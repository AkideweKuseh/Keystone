import { describe, it, expect } from 'vitest';
import { mapUserDoc, directionFromDeviceName, gymConfigured } from './gym-connector';

describe('mapUserDoc', () => {
  it('maps a full BoldGym user doc to a GymMember', () => {
    const m = mapUserDoc({
      memberId: 'GYM-00123',
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2026-12-31T00:00:00Z'),
      access: { gym: true, beach: false },
      deviceUserId: '42',
    });
    expect(m).toEqual({
      memberId: 'GYM-00123',
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2026-12-31T00:00:00Z'),
      accessGym: true,
      deviceUserId: '42',
    });
  });

  it('defaults missing fields safely (status none, accessGym false, null dates)', () => {
    const m = mapUserDoc({ memberId: 'GYM-1' });
    expect(m.subscriptionStatus).toBe('none');
    expect(m.accessGym).toBe(false);
    expect(m.subscriptionExpiryDate).toBeNull();
    expect(m.deviceUserId).toBeNull();
  });

  it('treats access.gym absent or false as no gym access', () => {
    expect(mapUserDoc({ memberId: 'GYM-1', access: { beach: true } }).accessGym).toBe(false);
    expect(mapUserDoc({ memberId: 'GYM-1', access: { gym: false } }).accessGym).toBe(false);
  });
});

describe('directionFromDeviceName', () => {
  it('detects exit', () => {
    expect(directionFromDeviceName('Exit Device')).toBe('exit');
    expect(directionFromDeviceName('Gym EXIT')).toBe('exit');
  });
  it('detects entry', () => {
    expect(directionFromDeviceName('Entry Device')).toBe('entry');
    expect(directionFromDeviceName('Main Entrance')).toBe('entry');
  });
  it('is undefined when the name gives no hint', () => {
    expect(directionFromDeviceName('Lobby Reader 3')).toBeUndefined();
    expect(directionFromDeviceName(null)).toBeUndefined();
  });
});

describe('gymConfigured', () => {
  it('is false for blank or placeholder URIs', () => {
    expect(gymConfigured(undefined)).toBe(false);
    expect(gymConfigured('')).toBe(false);
    expect(gymConfigured('mongodb://readonly:CHANGE_ME@host/gym')).toBe(false);
  });
  it('is true for a real URI', () => {
    expect(gymConfigured('mongodb://user:pass@host:27017/gym')).toBe(true);
  });
});
