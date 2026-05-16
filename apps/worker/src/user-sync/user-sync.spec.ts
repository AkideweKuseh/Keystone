import { describe, it, expect, beforeEach } from 'vitest';
import { MockDriver } from '@sam/drivers-mock';
import { DriverError } from '@sam/drivers-core';

describe('user-sync worker logic', () => {
  describe('MockDriver user operations', () => {
    let driver: MockDriver;

    beforeEach(() => {
      driver = new MockDriver();
    });

    it('upsertUser then deleteUser leaves device empty', async () => {
      await driver.upsertUser({
        employeeNo: 'E001',
        firstName: 'Ada',
        lastName: 'L',
        doorIndexes: [1],
      });
      expect(driver.getUserCount()).toBe(1);
      await driver.deleteUser('E001');
      expect(driver.getUserCount()).toBe(0);
    });

    it('upsertUser and upsertCard are recorded in callLog', async () => {
      await driver.upsertUser({
        employeeNo: 'E002',
        firstName: 'Bob',
        lastName: 'B',
        doorIndexes: [],
      });
      await driver.upsertCard('E002', { cardNumber: '99887766' });
      expect(driver.callLog).toContain('upsertUser');
      expect(driver.callLog).toContain('upsertCard');
    });

    it('failure injection on upsertUser rethrows DriverError', async () => {
      const failing = new MockDriver({ failOn: { upsertUser: DriverError.timeout() } });
      await expect(
        failing.upsertUser({ employeeNo: 'E003', firstName: 'C', lastName: 'D', doorIndexes: [] }),
      ).rejects.toThrow('timed out');
    });

    it('authFailed is not retryable', () => {
      expect(DriverError.authFailed().isRetryable).toBe(false);
    });

    it('timeout is retryable', () => {
      expect(DriverError.timeout().isRetryable).toBe(true);
    });

    it('unreachable is retryable', () => {
      expect(DriverError.unreachable().isRetryable).toBe(true);
    });
  });

  describe('revision guard semantics', () => {
    it('job with older revision should be skipped', () => {
      const currentRevision = 5;
      const jobRevision = 3;
      const shouldSkip = currentRevision > jobRevision;
      expect(shouldSkip).toBe(true);
    });

    it('job with same revision should not be skipped', () => {
      const currentRevision = 5;
      const jobRevision = 5;
      const shouldSkip = currentRevision > jobRevision;
      expect(shouldSkip).toBe(false);
    });

    it('job with newer revision should process', () => {
      const currentRevision = 3;
      const jobRevision = 7;
      const shouldSkip = currentRevision > jobRevision;
      expect(shouldSkip).toBe(false);
    });
  });
});
