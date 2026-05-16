import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
} from './domain-error';

describe('DomainError subclasses', () => {
  it('NotFoundError has correct code, message, and context', () => {
    const err = new NotFoundError('Device', 'abc-123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('Device');
    expect(err.message).toContain('abc-123');
    expect(err.context).toEqual({ resource: 'Device', id: 'abc-123' });
    expect(err.name).toBe('NotFoundError');
  });

  it('ConflictError preserves context', () => {
    const err = new ConflictError('duplicate ip', { ip: '10.0.0.1' });
    expect(err.code).toBe('CONFLICT');
    expect(err.context).toEqual({ ip: '10.0.0.1' });
  });

  it('ValidationError exposes fields', () => {
    const err = new ValidationError('bad input', { email: 'invalid' });
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fields).toEqual({ email: 'invalid' });
  });

  it('ForbiddenError uses default message', () => {
    const err = new ForbiddenError();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Insufficient permissions');
  });

  it('UnauthorizedError is instanceof DomainError', () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('UNAUTHENTICATED');
  });
});
