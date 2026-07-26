import { describe, it, expect } from 'vitest';
import { mapUserDoc } from './gym-connector';

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
