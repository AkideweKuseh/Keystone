# ADR 0001 — PostgreSQL as the Single Source of Truth

**Status:** Accepted  
**Date:** 2026-05-15

## Context

Access-control platforms traditionally treat device state as authoritative — what the device says goes. This creates drift when devices reboot, lose power, or receive out-of-band changes.

## Decision

**PostgreSQL is the source of truth. Devices are replicas.**

If a device disagrees with the DB, the DB wins. A reconciler re-pushes correct state.

## Consequences

- Every mutation is persisted to Postgres before being pushed to devices.
- API never returns until the DB write completes; device sync is async.
- Reconciler can heal drift at any time without data loss.
- Trades device-side immediacy for consistency and auditability.

## Alternatives rejected

- **Device as source of truth:** drift is undetectable; backup means backing up the device.
- **Event sourcing (append-only log):** higher complexity, harder to query current state.
