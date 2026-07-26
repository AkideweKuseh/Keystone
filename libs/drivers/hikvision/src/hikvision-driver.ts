import { DriverError } from '@sam/drivers-core';
import type {
  AccessDeviceDriver,
  CardPayload,
  DeviceCapabilities,
  DeviceEvent,
  DeviceInfo,
  DeviceUserPayload,
  DriverTarget,
  HealthSnapshot,
  HttpPushConfig,
  ListOpts,
} from '@sam/drivers-core';
import { HikvisionHttp } from './hikvision-http';

export class HikvisionDriver implements AccessDeviceDriver {
  private readonly http: HikvisionHttp;

  constructor(target: DriverTarget) {
    this.http = new HikvisionHttp(target);
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const res = await this.http.get<{ DeviceInfo?: Record<string, string> }>(
      '/ISAPI/System/deviceInfo?format=json',
    );
    const d = res.DeviceInfo ?? {};
    return {
      model: d['model'] ?? 'unknown',
      serialNumber: d['serialNumber'] ?? '',
      firmwareVersion: d['firmwareVersion'] ?? '',
      deviceName: d['deviceName'] ?? '',
    };
  }

  async ping(): Promise<HealthSnapshot> {
    const start = Date.now();
    await this.http.get('/ISAPI/System/deviceInfo?format=json');
    return { reachable: true, latencyMs: Date.now() - start, checkedAt: new Date() };
  }

  async discoverCapabilities(): Promise<DeviceCapabilities> {
    const res = await this.http
      .get<Record<string, unknown>>('/ISAPI/AccessControl/UserInfo/capabilities?format=json')
      .catch(() => ({}) as Record<string, unknown>);
    const cap = res['UserInfoCap'] as Record<string, unknown> | undefined;
    return {
      supportsJson: true,
      supportsFace: !!cap?.['faceCapable'],
      supportsFp: !!cap?.['fingerPrintCapable'],
      maxUsers: typeof cap?.['userCapacity'] === 'number' ? cap['userCapacity'] : undefined,
      maxCards: typeof cap?.['cardCapacity'] === 'number' ? cap['cardCapacity'] : undefined,
      raw: cap ?? {},
    };
  }

  async upsertUser(user: DeviceUserPayload): Promise<void> {
    const body = {
      UserInfo: {
        employeeNo: user.employeeNo,
        name: `${user.firstName} ${user.lastName}`.trim() || user.employeeNo,
        userType: 'normal',
        Valid: {
          enable: true,
          beginTime: user.validFrom ?? '2000-01-01T00:00:00',
          endTime: user.validTo ?? '2037-12-31T23:59:59',
        },
        doorRight: user.doorIndexes.join(',') || '1',
        RightPlan: user.doorIndexes.map((idx) => ({ doorNo: idx, planTemplateNo: '1' })),
      },
    };
    await this.http.post('/ISAPI/AccessControl/UserInfo/Record?format=json', JSON.stringify(body));
  }

  async deleteUser(employeeNo: string): Promise<void> {
    const body = { UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } };
    await this.http.put(
      '/ISAPI/AccessControl/UserInfoDetail/Delete?format=json',
      JSON.stringify(body),
      'application/json',
    );
  }

  async setValidity(employeeNo: string, enable: boolean, endTime?: string): Promise<void> {
    // Modify only the Valid block, leaving the face/card enrollment intact.
    // Disabling sets enable=false AND a past endTime (belt-and-suspenders across
    // firmwares that honour only one of the two). See ADR 0006.
    const body = {
      UserInfo: {
        employeeNo,
        Valid: {
          enable,
          beginTime: '2000-01-01T00:00:00',
          endTime: enable ? (endTime ?? '2037-12-31T23:59:59') : '2000-01-01T00:00:01',
        },
      },
    };
    await this.http.put(
      '/ISAPI/AccessControl/UserInfo/Modify?format=json',
      JSON.stringify(body),
      'application/json',
    );
  }

  async listUsers(opts?: ListOpts): Promise<DeviceUserPayload[]> {
    const body = {
      UserInfoSearchCond: {
        searchID: '1',
        searchResultPosition: opts?.offset ?? 0,
        maxResults: opts?.limit ?? 100,
      },
    };
    const res = await this.http.post<{ UserInfoSearch?: { UserInfo?: Record<string, unknown>[] } }>(
      '/ISAPI/AccessControl/UserInfo/Search?format=json',
      JSON.stringify(body),
    );
    const list = res.UserInfoSearch?.UserInfo ?? [];
    return list.map((u) => {
      const valid = u['Valid'] as { beginTime?: string; endTime?: string } | undefined;
      return {
        employeeNo: String(u['employeeNo'] ?? ''),
        firstName: String(u['name'] ?? '').split(' ')[0] ?? '',
        lastName: String(u['name'] ?? '')
          .split(' ')
          .slice(1)
          .join(' '),
        // Carry the validity window so callers can tell enabled vs disabled
        // (our disable path sets endTime into the past). See ADR 0006.
        validFrom: valid?.beginTime,
        validTo: valid?.endTime,
        doorIndexes: [],
      };
    });
  }

  async upsertCard(employeeNo: string, card: CardPayload): Promise<void> {
    const body = {
      CardInfo: {
        employeeNo,
        cardNo: card.cardNumber,
        cardType: 'normalCard',
      },
    };
    await this.http.post('/ISAPI/AccessControl/CardInfo/Record?format=json', JSON.stringify(body));
  }

  async unlockDoor(doorIndex: number, _durationSec = 5): Promise<void> {
    const body = `<RemoteControlDoor version="2.0"><cmd>open</cmd></RemoteControlDoor>`;
    await this.http.put(
      `/ISAPI/AccessControl/RemoteControl/door/${doorIndex}`,
      body,
      'application/xml',
    );
  }

  async configureHttpPush(config: HttpPushConfig): Promise<void> {
    const body = {
      HttpHostNotificationList: {
        HttpHostNotification: {
          id: '1',
          url: config.url,
          protocolType: 'HTTP',
          parameterFormatType: 'JSON',
          httpAuthenticationMethod: 'none',
          heartbeatInterval: 60,
          maxIntervalTime: 5,
          additionalHeaders: [{ name: 'X-Device-Token', value: config.token }],
          eventType: config.events.join(','),
        },
      },
    };
    await this.http.put(
      '/ISAPI/Event/notification/httpHosts',
      JSON.stringify(body),
      'application/json',
    );
  }

  async pullEvents(since: Date, limit: number): Promise<DeviceEvent[]> {
    const body = {
      AcsEventCond: {
        searchID: '1',
        searchResultPosition: 0,
        maxResults: Math.min(limit, 100),
        major: 0,
        minor: 0,
        startTime: since.toISOString(),
        endTime: new Date().toISOString(),
      },
    };
    const res = await this.http
      .post<{
        AcsEvent?: { InfoList?: Record<string, unknown>[] };
      }>('/ISAPI/AccessControl/AcsEvent?format=json', JSON.stringify(body))
      .catch(() => ({}) as { AcsEvent?: { InfoList?: Record<string, unknown>[] } });
    const list = res.AcsEvent?.InfoList ?? [];
    return list.map((e) => ({
      eventType: String(e['eventType'] ?? 'unknown'),
      employeeNo: e['employeeNoString'] ? String(e['employeeNoString']) : undefined,
      doorIndex: typeof e['doorNo'] === 'number' ? e['doorNo'] : undefined,
      eventTime: e['time'] ? new Date(String(e['time'])) : new Date(),
      raw: e,
    }));
  }

  // ─── Phase 4+ stubs ──────────────────────────────────────────────────────

  upsertFace(_employeeNo: string, _image: Buffer): Promise<void> {
    return Promise.reject(DriverError.unsupported('upsertFace'));
  }
  deleteCard(_employeeNo: string, _cardNumber: string): Promise<void> {
    return Promise.reject(DriverError.unsupported('deleteCard'));
  }
  lockDoor(_doorIndex: number): Promise<void> {
    return Promise.reject(DriverError.unsupported('lockDoor'));
  }
}
