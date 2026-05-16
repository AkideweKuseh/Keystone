import { beforeEach, describe, expect, it } from 'vitest';
import { DriverError } from '@sam/drivers-core';
import { MockDriver } from './mock-driver';

describe('MockDriver', () => {
  let driver: MockDriver;

  beforeEach(() => {
    driver = new MockDriver();
  });

  it('ping returns a healthy snapshot', async () => {
    const snap = await driver.ping();
    expect(snap.reachable).toBe(true);
    expect(snap.checkedAt).toBeInstanceOf(Date);
  });

  it('upsertUser then listUsers returns the user', async () => {
    await driver.upsertUser({
      employeeNo: 'E001',
      firstName: 'Ada',
      lastName: 'L',
      doorIndexes: [1],
    });
    const users = await driver.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0]?.employeeNo).toBe('E001');
  });

  it('deleteUser removes user and their cards', async () => {
    await driver.upsertUser({
      employeeNo: 'E001',
      firstName: 'Ada',
      lastName: 'L',
      doorIndexes: [],
    });
    await driver.upsertCard('E001', { cardNumber: '12345' });
    await driver.deleteUser('E001');
    expect(driver.getUserCount()).toBe(0);
  });

  it('failure injection throws configured error', async () => {
    const failing = new MockDriver({ failOn: { ping: DriverError.timeout() } });
    await expect(failing.ping()).rejects.toThrow('timed out');
  });

  it('callLog records method calls in order', async () => {
    await driver.ping();
    await driver.getDeviceInfo();
    expect(driver.callLog).toEqual(['ping', 'getDeviceInfo']);
  });

  it('discoverCapabilities returns sensible defaults', async () => {
    const caps = await driver.discoverCapabilities();
    expect(caps.supportsJson).toBe(true);
    expect(caps.maxUsers).toBeGreaterThan(0);
  });
});
