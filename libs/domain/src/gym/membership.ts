/**
 * Pure gym-membership enforcement logic. No I/O — the connector reads/writes
 * MongoDB, this decides. Mirrors BoldGym's `User` shape (subscriptionStatus,
 * subscriptionExpiryDate, access.gym). See ADR 0006.
 */

/** BoldGym `User.subscriptionStatus` values. */
export const MembershipStatus = {
  None: 'none',
  Active: 'active',
  PastDue: 'past_due',
  Cancelled: 'cancelled',
  Paused: 'paused',
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

/** The subset of a BoldGym member Keystone needs to make an access decision. */
export interface GymMember {
  /** `User.memberId`, e.g. "GYM-00123". */
  memberId: string;
  /** `User.subscriptionStatus`. */
  subscriptionStatus: string;
  /** `User.subscriptionExpiryDate` (null = no expiry set). */
  subscriptionExpiryDate: Date | null;
  /** `User.access.gym` — the manual per-member gym access toggle. */
  accessGym: boolean;
  /** `User.deviceUserId` — the Hikvision `employeeNo` staff linked to this member. */
  deviceUserId: string | null;
}

/**
 * The access rule Keystone enforces on the gym terminal. A member may enter iff
 * their subscription is active AND not past its expiry date AND the gym access
 * flag is on. This is stricter than BoldGym's QR whitelist (which only checks
 * `access.gym`) — closing the "expired member still has physical access" gap
 * that BoldGym does not currently enforce.
 */
export function isMembershipActive(member: GymMember, now: Date = new Date()): boolean {
  if (member.accessGym !== true) return false;
  if (member.subscriptionStatus !== MembershipStatus.Active) return false;
  if (member.subscriptionExpiryDate && member.subscriptionExpiryDate.getTime() < now.getTime()) {
    return false;
  }
  return true;
}

/**
 * Desired device validity for a member: enabled when active, disabled otherwise.
 * `endTime` (ISO) is the device validity end used when enabling, so the terminal
 * also expires the user locally at the membership end even if a poll is missed.
 */
export function desiredValidity(
  member: GymMember,
  now: Date = new Date(),
): { enable: boolean; endTime?: string } {
  const enable = isMembershipActive(member, now);
  if (!enable) return { enable: false };
  return { enable: true, endTime: member.subscriptionExpiryDate?.toISOString() };
}

/** A user currently enrolled on the device, with its validity window end. */
export interface EnrolledDeviceUser {
  employeeNo: string;
  /** Device-side validity end; null = open-ended. Past = effectively disabled. */
  validTo: Date | null;
}

/** An enable/disable action to apply to one device user. */
export interface ValidityAction {
  employeeNo: string;
  enable: boolean;
  endTime?: string;
}

/**
 * Reconcile a device's enrolled users against membership, emitting an action
 * ONLY where the device's current state disagrees with the desired state. This
 * keeps the poller from re-issuing calls every cycle (which would hammer the
 * terminal). Enrolled users not linked to any member are left untouched (staff,
 * or not-yet-linked enrollments).
 */
export function planValidityActions(
  enrolled: EnrolledDeviceUser[],
  members: GymMember[],
  now: Date = new Date(),
): ValidityAction[] {
  const byDeviceUser = new Map<string, GymMember>();
  for (const m of members) {
    if (m.deviceUserId) byDeviceUser.set(m.deviceUserId, m);
  }

  const actions: ValidityAction[] = [];
  for (const e of enrolled) {
    const member = byDeviceUser.get(e.employeeNo);
    if (!member) continue; // enrolled but unlinked — not Keystone's to manage
    const desired = desiredValidity(member, now);
    const currentlyEnabled = e.validTo ? e.validTo.getTime() >= now.getTime() : true;
    if (desired.enable !== currentlyEnabled) {
      actions.push({ employeeNo: e.employeeNo, enable: desired.enable, endTime: desired.endTime });
    }
  }
  return actions;
}
