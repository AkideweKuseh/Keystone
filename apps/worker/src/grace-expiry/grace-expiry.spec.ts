import { describe, it, expect } from 'vitest';
import { graceExpiryAt, isPastGrace, resolveGraceDays } from './grace-expiry.processor';

const DAY = 86_400_000;
const now = Date.UTC(2026, 6, 25); // fixed "now" for deterministic tests

describe('grace-expiry decision logic', () => {
  describe('graceExpiryAt', () => {
    it('is null when the member has no end date', () => {
      expect(graceExpiryAt(null, 5)).toBeNull();
    });

    it('adds the grace window to validTo', () => {
      const validTo = new Date(now);
      expect(graceExpiryAt(validTo, 3)).toBe(now + 3 * DAY);
    });

    it('equals validTo when grace is zero', () => {
      const validTo = new Date(now);
      expect(graceExpiryAt(validTo, 0)).toBe(now);
    });
  });

  describe('isPastGrace', () => {
    it('never revokes a member with no end date', () => {
      expect(isPastGrace(null, 0, now)).toBe(false);
    });

    it('revokes immediately past expiry when grace is zero', () => {
      const expired = new Date(now - 1); // 1ms ago
      expect(isPastGrace(expired, 0, now)).toBe(true);
    });

    it('does not revoke a member still inside the grace window', () => {
      const expiredYesterday = new Date(now - DAY);
      expect(isPastGrace(expiredYesterday, 3, now)).toBe(false); // 3-day grace still covers it
    });

    it('revokes once the grace window has fully lapsed', () => {
      const expiredFourDaysAgo = new Date(now - 4 * DAY);
      expect(isPastGrace(expiredFourDaysAgo, 3, now)).toBe(true);
    });

    it('treats the exact expiry instant as not-yet-revoked', () => {
      const validTo = new Date(now); // expiryAt === now, and now < now is false
      expect(isPastGrace(validTo, 0, now)).toBe(false);
    });
  });

  describe('resolveGraceDays', () => {
    it('uses the tenant default when there is no override', () => {
      expect(resolveGraceDays(null, 7)).toBe(7);
    });

    it('prefers a numeric per-member override over the tenant default', () => {
      expect(resolveGraceDays({ gracePeriodDays: 2 }, 7)).toBe(2);
    });

    it('allows a zero override to win (revoke immediately)', () => {
      expect(resolveGraceDays({ gracePeriodDays: 0 }, 7)).toBe(0);
    });

    it('falls back to 0 when neither override nor tenant default is set', () => {
      expect(resolveGraceDays(null, undefined)).toBe(0);
    });

    it('ignores a non-numeric override', () => {
      expect(resolveGraceDays({ gracePeriodDays: 'nope' }, 5)).toBe(5);
    });
  });
});
