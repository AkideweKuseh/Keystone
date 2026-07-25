import { describe, it, expect, vi } from 'vitest';
import { MockDriver } from '@sam/drivers-mock';
import { DriverError } from '@sam/drivers-core';
import type { AccessDeviceDriver, HealthSnapshot } from '@sam/drivers-core';
import { pingWithRetry, statusFromSnapshot } from './health-check.processor';

function snap(latencyMs: number): HealthSnapshot {
  return { reachable: true, latencyMs, checkedAt: new Date() };
}

describe('health-check status mapping', () => {
  it('maps a fast ping to online', () => {
    expect(statusFromSnapshot(snap(120))).toBe('online');
  });

  it('maps a slow ping (> degraded threshold) to degraded', () => {
    expect(statusFromSnapshot(snap(5000))).toBe('degraded');
  });

  it('maps no snapshot (all pings failed) to offline', () => {
    expect(statusFromSnapshot(null)).toBe('offline');
  });
});

describe('pingWithRetry hysteresis', () => {
  it('returns the snapshot on first success without retrying', async () => {
    const ping = vi.fn().mockResolvedValue(snap(100));
    const driver = { ping } as unknown as AccessDeviceDriver;
    const result = await pingWithRetry(driver);
    expect(result?.latencyMs).toBe(100);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('recovers when an early ping blips but a later one succeeds', async () => {
    // One transient failure then success must NOT be reported as offline.
    const ping = vi
      .fn()
      .mockRejectedValueOnce(DriverError.unreachable())
      .mockResolvedValueOnce(snap(140));
    const driver = { ping } as unknown as AccessDeviceDriver;
    const result = await pingWithRetry(driver);
    expect(result?.latencyMs).toBe(140);
    expect(statusFromSnapshot(result)).toBe('online');
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it('returns null only after all attempts fail', async () => {
    const ping = vi.fn().mockRejectedValue(DriverError.timeout());
    const driver = { ping } as unknown as AccessDeviceDriver;
    const result = await pingWithRetry(driver);
    expect(result).toBeNull();
    expect(statusFromSnapshot(result)).toBe('offline');
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('works against a real MockDriver ping', async () => {
    const result = await pingWithRetry(new MockDriver());
    expect(result).not.toBeNull();
    expect(statusFromSnapshot(result)).toBe('online');
  });
});
