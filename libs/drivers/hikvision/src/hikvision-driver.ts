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

  // ─── Phase 2+ stubs ──────────────────────────────────────────────────────

  upsertUser(_user: DeviceUserPayload): Promise<void> {
    return Promise.reject(DriverError.unsupported('upsertUser'));
  }
  deleteUser(_employeeNo: string): Promise<void> {
    return Promise.reject(DriverError.unsupported('deleteUser'));
  }
  listUsers(_opts?: ListOpts): Promise<DeviceUserPayload[]> {
    return Promise.reject(DriverError.unsupported('listUsers'));
  }
  upsertCard(_employeeNo: string, _card: CardPayload): Promise<void> {
    return Promise.reject(DriverError.unsupported('upsertCard'));
  }
  upsertFace(_employeeNo: string, _image: Buffer): Promise<void> {
    return Promise.reject(DriverError.unsupported('upsertFace'));
  }
  deleteCard(_employeeNo: string, _cardNumber: string): Promise<void> {
    return Promise.reject(DriverError.unsupported('deleteCard'));
  }
  unlockDoor(_doorIndex: number, _durationSec?: number): Promise<void> {
    return Promise.reject(DriverError.unsupported('unlockDoor'));
  }
  lockDoor(_doorIndex: number): Promise<void> {
    return Promise.reject(DriverError.unsupported('lockDoor'));
  }
  pullEvents(_since: Date, _limit: number): Promise<DeviceEvent[]> {
    return Promise.reject(DriverError.unsupported('pullEvents'));
  }
}
