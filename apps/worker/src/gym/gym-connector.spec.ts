import { describe, it, expect } from 'vitest';
import { parseMemberDto, directionFromDeviceName, gymConfigured } from './gym-connector';

describe('parseMemberDto', () => {
  it('maps a full API member object to a GymMember', () => {
    const m = parseMemberDto({
      memberId: 'GYM-00123',
      subscriptionStatus: 'active',
      subscriptionExpiryDate: '2026-12-31T00:00:00.000Z',
      accessGym: true,
      deviceUserId: '42',
    });
    expect(m).toEqual({
      memberId: 'GYM-00123',
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2026-12-31T00:00:00.000Z'),
      accessGym: true,
      deviceUserId: '42',
    });
  });

  it('defaults missing fields safely (status none, accessGym false, null dates)', () => {
    const m = parseMemberDto({ memberId: 'GYM-1' });
    expect(m.subscriptionStatus).toBe('none');
    expect(m.accessGym).toBe(false);
    expect(m.subscriptionExpiryDate).toBeNull();
    expect(m.deviceUserId).toBeNull();
  });

  it('treats accessGym absent or false as no gym access', () => {
    expect(parseMemberDto({ memberId: 'GYM-1' }).accessGym).toBe(false);
    expect(parseMemberDto({ memberId: 'GYM-1', accessGym: false }).accessGym).toBe(false);
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
  it('is false for blank or placeholder URLs', () => {
    expect(gymConfigured(undefined)).toBe(false);
    expect(gymConfigured('')).toBe(false);
    expect(gymConfigured('https://gym.example/CHANGE_ME')).toBe(false);
  });
  it('is true for a real URL', () => {
    expect(gymConfigured('https://gym.boldfitness.app')).toBe(true);
  });
});
