import type { AccessDeviceDriver } from './access-device-driver';

export interface DriverTarget {
  id: string;
  vendor: string;
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  timeoutMs?: number;
}

export type DriverFactory = (target: DriverTarget) => AccessDeviceDriver;

export class DriverRegistry {
  private readonly factories = new Map<string, DriverFactory>();
  private readonly cache = new Map<string, AccessDeviceDriver>();

  register(vendor: string, factory: DriverFactory): void {
    this.factories.set(vendor, factory);
  }

  resolve(target: DriverTarget): AccessDeviceDriver {
    const cached = this.cache.get(target.id);
    if (cached) return cached;

    const factory = this.factories.get(target.vendor);
    if (!factory) throw new Error(`No driver registered for vendor: ${target.vendor}`);

    const driver = factory(target);
    this.cache.set(target.id, driver);
    return driver;
  }

  evict(deviceId: string): void {
    this.cache.delete(deviceId);
  }
}
