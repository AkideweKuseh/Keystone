import { describe, it, expect } from 'vitest';
import {
  isMembershipActive,
  desiredValidity,
  doorEventToAttendance,
  planValidityActions,
  MembershipStatus,
  type GymMember,
} from './membership';

const now = new Date('2026-07-26T12:00:00Z');

function member(overrides: Partial<GymMember> = {}): GymMember {
  return {
    memberId: 'GYM-00123',
    subscriptionStatus: MembershipStatus.Active,
    subscriptionExpiryDate: new Date('2026-12-31T00:00:00Z'),
    accessGym: true,
    deviceUserId: '42',
    ...overrides,
  };
}

describe('isMembershipActive', () => {
  it('grants an active, unexpired, gym-enabled member', () => {
    expect(isMembershipActive(member(), now)).toBe(true);
  });

  it('denies when the gym access flag is off', () => {
    expect(isMembershipActive(member({ accessGym: false }), now)).toBe(false);
  });

  for (const status of ['none', 'past_due', 'cancelled', 'paused']) {
    it(`denies when subscription is ${status}`, () => {
      expect(isMembershipActive(member({ subscriptionStatus: status }), now)).toBe(false);
    });
  }

  it('denies an active member whose expiry has passed', () => {
    expect(
      isMembershipActive(member({ subscriptionExpiryDate: new Date('2026-07-25T00:00:00Z') }), now),
    ).toBe(false);
  });

  it('grants when there is no expiry date set', () => {
    expect(isMembershipActive(member({ subscriptionExpiryDate: null }), now)).toBe(true);
  });
});

describe('desiredValidity', () => {
  it('enables with the expiry as endTime for an active member', () => {
    const v = desiredValidity(member(), now);
    expect(v.enable).toBe(true);
    expect(v.endTime).toBe('2026-12-31T00:00:00.000Z');
  });

  it('disables (no endTime) for a lapsed member', () => {
    const v = desiredValidity(member({ subscriptionStatus: 'cancelled' }), now);
    expect(v).toEqual({ enable: false });
  });

  it('enables without endTime when there is no expiry', () => {
    const v = desiredValidity(member({ subscriptionExpiryDate: null }), now);
    expect(v).toEqual({ enable: true, endTime: undefined });
  });
});

describe('planValidityActions', () => {
  const active = member({ deviceUserId: '10' });
  const lapsed = member({ deviceUserId: '20', subscriptionStatus: 'cancelled' });

  it('disables an enrolled-and-enabled member who has lapsed', () => {
    const actions = planValidityActions(
      [{ employeeNo: '20', validTo: new Date('2027-01-01T00:00:00Z') }],
      [lapsed],
      now,
    );
    expect(actions).toEqual([{ employeeNo: '20', enable: false, endTime: undefined }]);
  });

  it('enables an enrolled-but-disabled member who is active', () => {
    const actions = planValidityActions(
      [{ employeeNo: '10', validTo: new Date('2000-01-01T00:00:01Z') }], // past = disabled
      [active],
      now,
    );
    expect(actions[0]?.employeeNo).toBe('10');
    expect(actions[0]?.enable).toBe(true);
  });

  it('emits nothing when device state already matches (no re-hammering)', () => {
    const actions = planValidityActions(
      [{ employeeNo: '10', validTo: new Date('2026-12-31T00:00:00Z') }], // future = enabled
      [active],
      now,
    );
    expect(actions).toEqual([]);
  });

  it('ignores enrolled users not linked to any member', () => {
    const actions = planValidityActions(
      [{ employeeNo: '999', validTo: null }],
      [active, lapsed],
      now,
    );
    expect(actions).toEqual([]);
  });
});

describe('doorEventToAttendance', () => {
  it('maps an entry event to a granted gym ScanLog row', () => {
    const row = doorEventToAttendance({
      memberId: 'GYM-00123',
      deviceId: 'dev-1',
      eventTime: now,
      direction: 'entry',
    });
    expect(row).toEqual({
      memberId: 'GYM-00123',
      gate: 'gym',
      result: 'granted',
      reason: 'entry',
      scannedAt: now,
      deviceId: 'dev-1',
      isOfflineScan: false,
    });
  });

  it('leaves reason null when direction is unknown', () => {
    const row = doorEventToAttendance({ memberId: 'GYM-1', deviceId: null, eventTime: now });
    expect(row.reason).toBeNull();
    expect(row.result).toBe('granted');
  });
});
