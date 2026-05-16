export const DeviceVendor = {
  Hikvision: 'hikvision',
  Suprema: 'suprema',
  Dahua: 'dahua',
  ZKTeco: 'zkteco',
  Mock: 'mock',
} as const;
export type DeviceVendor = (typeof DeviceVendor)[keyof typeof DeviceVendor];

export const DeviceStatus = {
  Online: 'online',
  Offline: 'offline',
  Degraded: 'degraded',
  Unknown: 'unknown',
  Disabled: 'disabled',
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];

export const AdminRole = {
  Owner: 'owner',
  Admin: 'admin',
  Operator: 'operator',
  Viewer: 'viewer',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
