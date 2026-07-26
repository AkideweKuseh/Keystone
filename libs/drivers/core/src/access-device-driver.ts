export interface DeviceInfo {
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  deviceName: string;
}

export interface HealthSnapshot {
  reachable: boolean;
  latencyMs: number;
  checkedAt: Date;
}

export interface DeviceCapabilities {
  supportsJson: boolean;
  supportsFace: boolean;
  supportsFp: boolean;
  maxUsers?: number;
  maxCards?: number;
  raw: Record<string, unknown>;
}

export interface DeviceUserPayload {
  employeeNo: string;
  firstName: string;
  lastName: string;
  validFrom?: string;
  validTo?: string;
  doorIndexes: number[];
}

export interface CardPayload {
  cardNumber: string;
}

export interface DeviceEvent {
  eventType: string;
  employeeNo?: string;
  doorIndex?: number;
  eventTime: Date;
  raw: Record<string, unknown>;
}

export interface ListOpts {
  limit?: number;
  offset?: number;
}

export interface AccessDeviceDriver {
  getDeviceInfo(): Promise<DeviceInfo>;
  ping(): Promise<HealthSnapshot>;
  discoverCapabilities(): Promise<DeviceCapabilities>;
  upsertUser(user: DeviceUserPayload): Promise<void>;
  deleteUser(employeeNo: string): Promise<void>;
  /**
   * Enable or disable an already-enrolled user without deleting them, by
   * setting their validity window. Disabling blocks access while preserving the
   * on-device face/card enrollment so a renewal needs no re-enrollment.
   * `endTime` (ISO 8601) sets the new expiry when re-enabling; ignored when
   * disabling. See ADR 0006.
   */
  setValidity(employeeNo: string, enable: boolean, endTime?: string): Promise<void>;
  listUsers(opts?: ListOpts): Promise<DeviceUserPayload[]>;
  upsertCard(employeeNo: string, card: CardPayload): Promise<void>;
  upsertFace(employeeNo: string, image: Buffer): Promise<void>;
  deleteCard(employeeNo: string, cardNumber: string): Promise<void>;
  unlockDoor(doorIndex: number, durationSec?: number): Promise<void>;
  lockDoor(doorIndex: number): Promise<void>;
  pullEvents(since: Date, limit: number): Promise<DeviceEvent[]>;
}
