import type {
  AccessDeviceDriver,
  CardPayload,
  DeviceCapabilities,
  DeviceEvent,
  DeviceInfo,
  DeviceUserPayload,
  HealthSnapshot,
  ListOpts,
} from '@sam/drivers-core';

export interface MockDriverConfig {
  failOn?: Partial<Record<keyof AccessDeviceDriver, Error>>;
  latencyMs?: number;
  deviceInfo?: Partial<DeviceInfo>;
}

export class MockDriver implements AccessDeviceDriver {
  private readonly users = new Map<string, DeviceUserPayload>();
  private readonly cards = new Map<string, Map<string, string>>();
  private readonly enabled = new Map<string, boolean>();
  public readonly callLog: string[] = [];

  constructor(private readonly config: MockDriverConfig = {}) {}

  private async simulate<T>(method: keyof AccessDeviceDriver, result: T): Promise<T> {
    this.callLog.push(method);
    if (this.config.latencyMs) {
      await new Promise((r) => setTimeout(r, this.config.latencyMs));
    }
    const err = this.config.failOn?.[method];
    if (err) throw err;
    return result;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return this.simulate('getDeviceInfo', {
      model: this.config.deviceInfo?.model ?? 'MockDevice-V1',
      serialNumber: this.config.deviceInfo?.serialNumber ?? 'MOCK-0000001',
      firmwareVersion: this.config.deviceInfo?.firmwareVersion ?? '1.0.0',
      deviceName: this.config.deviceInfo?.deviceName ?? 'Mock Device',
    });
  }

  async ping(): Promise<HealthSnapshot> {
    const start = Date.now();
    return this.simulate('ping', {
      reachable: true,
      latencyMs: Date.now() - start,
      checkedAt: new Date(),
    });
  }

  async discoverCapabilities(): Promise<DeviceCapabilities> {
    return this.simulate('discoverCapabilities', {
      supportsJson: true,
      supportsFace: true,
      supportsFp: false,
      maxUsers: 10000,
      maxCards: 10000,
      raw: { source: 'mock' },
    });
  }

  async upsertUser(user: DeviceUserPayload): Promise<void> {
    await this.simulate('upsertUser', undefined);
    this.users.set(user.employeeNo, user);
    this.enabled.set(user.employeeNo, true);
  }

  async deleteUser(employeeNo: string): Promise<void> {
    await this.simulate('deleteUser', undefined);
    this.users.delete(employeeNo);
    this.cards.delete(employeeNo);
    this.enabled.delete(employeeNo);
  }

  async setValidity(employeeNo: string, enable: boolean, _endTime?: string): Promise<void> {
    await this.simulate('setValidity', undefined);
    // Modeled as an in-place toggle: enrollment (user/cards) is untouched.
    this.enabled.set(employeeNo, enable);
  }

  async listUsers(_opts?: ListOpts): Promise<DeviceUserPayload[]> {
    return this.simulate('listUsers', [...this.users.values()]);
  }

  async upsertCard(employeeNo: string, card: CardPayload): Promise<void> {
    await this.simulate('upsertCard', undefined);
    if (!this.cards.has(employeeNo)) this.cards.set(employeeNo, new Map());
    this.cards.get(employeeNo)!.set(card.cardNumber, card.cardNumber);
  }

  async upsertFace(_employeeNo: string, _image: Buffer): Promise<void> {
    await this.simulate('upsertFace', undefined);
  }

  async deleteCard(employeeNo: string, cardNumber: string): Promise<void> {
    await this.simulate('deleteCard', undefined);
    this.cards.get(employeeNo)?.delete(cardNumber);
  }

  async unlockDoor(_doorIndex: number, _durationSec?: number): Promise<void> {
    await this.simulate('unlockDoor', undefined);
  }

  async lockDoor(_doorIndex: number): Promise<void> {
    await this.simulate('lockDoor', undefined);
  }

  async pullEvents(_since: Date, _limit: number): Promise<DeviceEvent[]> {
    return this.simulate('pullEvents', []);
  }

  getUserCount(): number {
    return this.users.size;
  }
  hasUser(employeeNo: string): boolean {
    return this.users.has(employeeNo);
  }
  /** True if the user is enrolled and currently enabled (validity open). */
  isEnabled(employeeNo: string): boolean {
    return this.enabled.get(employeeNo) ?? false;
  }
}
