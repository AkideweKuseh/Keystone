# ADR 0006 — Gym Integration: Poll-and-Enforce, On-Device Enrollment

**Status:** Accepted
**Date:** 2026-07-26

## Context

The initial gym integration (ADR-less, commit `0e51277`) assumed Keystone would
_provision_ members onto devices: the gym platform pushes members via a signed
webhook, Keystone creates the user + credentials and syncs them to every device.

The deployment reality is different:

- **Multi-branch gym, one shared gym platform.** Each branch has its own
  Hikvision terminals on its own LAN. A member belongs to **one home branch**
  and may only enter that branch.
- **Biometric enrollment happens on the device.** Staff enrol a member's face
  or card directly at the terminal. Keystone does **not** create credentials.
- **The gym platform owns membership.** Keystone should not be a second
  system-of-record for members; it reads membership and enforces it.
- **We want a dead-simple local deployment** (Docker + one-click launcher on a
  branch PC) with **no inbound exposure** — see the all-outbound data flow below.

## Decision

**Keystone runs as a per-branch, read-and-enforce agent. It does not provision
credentials. All integration is outbound; the gym database is accessed directly.**

Four settled points (from the deployment owner):

1. **Identity:** device `employeeNo` is **not** the gym member number. The two
   are linked via a mapping stored **in the gym database** (see "Member↔device
   linking").
2. **Revocation:** expired members are **disabled, not deleted**, on the device —
   preserving the enrolled face so a renewal needs no re-enrollment.
3. **Gym DB access:** Keystone reads membership from, and writes attendance to,
   the gym database directly. Attendance is written to a **dedicated integration
   table**, never into the platform's core tables.
4. **Attendance:** Keystone writes **raw entry/exit event rows**. Analytics
   (sessions, dwell time, occupancy) is done downstream in the gym platform, not
   in Keystone.

### Scope split vs ADR 0001

ADR 0001 ("Postgres is the source of truth, devices are replicas") still holds
for **access decisions** (membership → allowed/revoked is DB-driven). But for
**biometric credential enrollment**, the **device is authoritative** — Keystone
reads the enrolled set, it never writes faces. This ADR records that carve-out.

## Data flows (all outbound from the branch box)

```
  Hikvision terminals ──(LAN push: entry/exit)──►  Keystone receiver
  Keystone  ──(write raw attendance rows)──────►  Gym DB (integration table)
  Keystone  ──(poll membership status)◄─────────  Gym DB (read)
  Keystone  ──(LAN: disable expired, unlock)───►  Hikvision terminals
```

No inbound port is exposed; the branch PC needs only outbound network to the gym
DB and LAN reach to the terminals. This is why Docker + launcher on a local box
(ADR: Option A) is sufficient — no VPN, no public API.

## Member↔device linking

Because `employeeNo ≠ member number`, a human must connect "this enrollment =
this member" once. Keystone assists rather than owns it:

1. **Enrollment sync (device → gym DB):** Keystone periodically calls the
   driver's `listUsers()` on each terminal and upserts unlinked enrollments
   (`device_user_id`, name, branch, first_seen) into a **staging/link table** in
   the gym DB.
2. **Human link (gym app):** staff match each staged enrollment to a member in
   the gym platform, populating `member_number ↔ device_user_id`.
3. **Enforcement (gym DB → device):** Keystone reads linked members + status;
   for expired/cancelled ones it disables that `device_user_id` on the branch
   terminal; for reactivated ones it re-enables.

Keystone keeps a **local mirror** (its `users` table, keyed by device
`employeeNo`, member number in metadata) so grace windows, retries, and audit
work offline and survive a WAN outage.

## Components

**Reuse (already built):**

- Device driver: `listUsers`, `deleteUser`, `unlockDoor`, `pullEvents`.
- Receiver + event-process + parser (entry/exit ingestion).
- grace-expiry worker (revocation engine) — repoint its source to gym-polled
  membership and its action to _disable_ instead of _delete_.
- Health check (with hysteresis), capability discovery, remote unlock.
- Docker prod compose + Dockerfiles.

**Net-new:**

- **Gym DB connector** — read membership, write attendance (dedicated table).
- **Membership poller** (scheduled worker) — reconcile enrolled set ↔ gym
  membership; enqueue disable/enable.
- **Enrollment-link sync** — push device enrollments into the gym staging table.
- **Attendance sink** — in event-process, write raw entry/exit rows to gym DB,
  idempotently.
- **Driver `setValidity(employeeNo, enable, endTime)`** — disable without delete
  (the driver currently only has `deleteUser`).
- **One-click launcher + per-branch config** (branch id, gym DB DSN, device list).

## Consequences

- Keystone never handles biometric data — smaller security and privacy surface.
- Provisioning (`upsertUser`/`upsertCard` push) is dropped from the runtime flow;
  the code stays in the driver but is no longer invoked by the sync path.
- A branch box survives WAN/gym-DB outages: doors keep working (enrollment is
  on-device), attendance buffers locally and drains when the DB is reachable,
  revocations apply on the next successful poll.
- Direct gym-DB coupling is a known risk; contained to the connector and a
  dedicated attendance table, treated as an integration contract that can change.

## BoldGym specifics (confirmed from the codebase)

BoldGym is **Node/Express on MongoDB** (`MONGODB_URI`), single location (gym +
beach _gates_, not multi-branch — branches are a future feature). Keystone
touches two collections:

- **`users`** (read): `memberId` ("GYM-00001"), `subscriptionStatus`
  (`none|active|past_due|cancelled|paused`), `subscriptionExpiryDate`,
  `access.gym`, and `deviceUserId` (the linked Hikvision `employeeNo` — a field
  BoldGym will add).
- **`scanlogs`** (insert): the existing attendance shape
  `{ memberId, gate:'gym', result:'granted', reason, scannedAt, deviceId }` —
  no new table needed. Keystone writes raw rows; BoldGym does analytics.

Enforcement is stricter than BoldGym's QR whitelist (which only checks
`access.gym`): a member is allowed iff active **and** unexpired **and**
`access.gym`. This closes the gap where BoldGym's expiry job only _reminds_ and
never revokes physical access. Keystone is independent of the QR
whitelist/snapshot mechanism.

## Implementation status

- ✅ `setValidity` disable-not-delete (commit `ed19d9f`).
- ✅ Pure enforcement + drift reconciliation in `libs/domain/gym`.
- ✅ `MongoGymConnector`, membership poller, attendance sink (`b684403`,
  `c07e67e`). No-op until `GYM_DATABASE_URL` is set.
- ⬜ BoldGym adds the `User.deviceUserId` field + a way for staff to set it.
- ⬜ Integration test against a real/seeded BoldGym Mongo.
- ⬜ Confirm `UserInfo/Modify` disable semantics on DS-K1T342 firmware (bench).

## Alternatives rejected

- **Provision from the gym (original design):** contradicts on-device enrollment;
  Keystone would fight the terminal over who owns the face.
- **Central Keystone + VPN to every branch:** more moving parts (public API,
  per-branch tunnels) and a WAN dependency for door operations; overkill for a
  home-branch-only, per-site model.
- **Delete on expiry:** destroys the enrolled face; renewals would require
  re-enrollment at the terminal.
- **Gym API instead of direct DB:** preferred in general, but the owner has DB
  access and no suitable API; mitigated by writing only to a dedicated table.
