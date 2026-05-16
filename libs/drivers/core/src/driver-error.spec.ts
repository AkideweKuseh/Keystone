import { describe, it, expect } from 'vitest';
import { DriverError, DriverErrorCode } from './driver-error';

describe('DriverError', () => {
  it('timeout is retryable', () => {
    expect(DriverError.timeout().isRetryable).toBe(true);
  });

  it('unreachable is retryable', () => {
    expect(DriverError.unreachable().isRetryable).toBe(true);
  });

  it('rateLimited is retryable', () => {
    expect(DriverError.rateLimited().isRetryable).toBe(true);
  });

  it('authFailed is NOT retryable', () => {
    expect(DriverError.authFailed().isRetryable).toBe(false);
  });

  it('conflict is NOT retryable', () => {
    expect(DriverError.conflict().isRetryable).toBe(false);
  });

  it('static factories set correct code', () => {
    expect(DriverError.unreachable().code).toBe(DriverErrorCode.Unreachable);
    expect(DriverError.badResponse('x').code).toBe(DriverErrorCode.BadResponse);
    expect(DriverError.unsupported('y').message).toContain('y');
  });

  it('DriverError is instanceof Error', () => {
    expect(DriverError.internal()).toBeInstanceOf(Error);
  });
});
