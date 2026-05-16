# 10 — Implementation Roadmap & Checklist

This is the single document a delivery manager can use to track build progress from "empty repo" to "production-ready." Each phase has a clear scope, a checklist of work, and acceptance criteria.

> Convention: ☐ = open, ✅ = done. Owner suggestion in parens. Estimates are deliberately rough; refine in planning.

---

## Phase 0 — Foundations *(week 1)*

Goal: a repo that any engineer can clone and run.

### 0.1 Repo & tooling
- ☐ Initialize monorepo (pnpm workspaces) (DevOps)
- ☐ ESLint + Prettier + commitlint + Husky (DevOps)
- ☐ TypeScript `strict: true` across all packages (Tech Lead)
- ☐ EditorConfig, `.nvmrc`, `.tool-versions`
- ☐ `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- ☐ License file
- ☐ Issue & PR templates

### 0.2 Local dev environment
- ☐ `docker-compose.dev.yml` with postgres, redis, minio, mock-device
- ☐ `make dev-up` / `make dev-down` / `make test`
- ☐ `.env.example` with every variable documented

### 0.3 CI baseline
- ☐ Lint job
- ☐ Typecheck job
- ☐ Unit test job
- ☐ Build job
- ☐ Required-checks branch protection on `main`

**Acceptance:** ✅ A new engineer can clone, run `make dev-up`, and have a working stack within 15 minutes.

---

## Phase 1 — Core API & Device Registration *(weeks 2–3)*

Goal: register devices, persist them, talk to one device.

### 1.1 Domain & persistence
- ☐ Prisma schema for `tenants`, `sites`, `devices`, `device_capabilities`, `admin_users`
- ☐ Initial migration
- ☐ Repository pattern for devices and sites

### 1.2 Auth
- ☐ Admin login (email + password + MFA stub)
- ☐ JWT access + refresh tokens
- ☐ Refresh token rotation
- ☐ RBAC guard + `@Scopes()` decorator
- ☐ Account lockout on repeated failures

### 1.3 Device API
- ☐ `POST /devices` (with password encryption)
- ☐ `GET /devices`, `GET /devices/:id`
- ☐ `PATCH /devices/:id`, soft delete
- ☐ Input validation, error catalog, problem+JSON
- ☐ OpenAPI auto-generated and served at `/api/docs`

### 1.4 Driver layer (Hikvision baseline)
- ☐ `AccessDeviceDriver` interface
- ☐ `DriverError` taxonomy
- ☐ `HikvisionDriver.getDeviceInfo()` via Digest auth
- ☐ `HikvisionDriver.ping()`
- ☐ `MockDriver` with failure injection

### 1.5 Capability discovery
- ☐ `device:discover-capabilities` job
- ☐ Persist results to `device_capabilities`
- ☐ Detect JSON vs XML support

### 1.6 Health-check job
- ☐ Periodic ping (every 1 min default)
- ☐ Status transitions: online ↔ degraded ↔ offline
- ☐ Metric + WebSocket emit on transition

### 1.7 Audit log
- ☐ `audit_log` table + write helper
- ☐ App role lacks UPDATE/DELETE on audit log
- ☐ Every Phase 1 mutation writes an entry

### 1.8 Tests
- ☐ Unit tests for domain services
- ☐ Integration tests for device endpoints against MockDriver
- ☐ One smoke test against a real Hikvision unit on the dev bench

**Acceptance criteria:**
- ✅ Admin logs in, registers a device, sees it transition to `online` automatically.
- ✅ Discovered capabilities appear in DB and in `GET /devices/:id`.
- ✅ All audit entries land in `audit_log`.
- ✅ Hikvision device password is never returned in any API response.

---

## Phase 2 — Users, Credentials & Sync Engine *(weeks 4–6)*

Goal: an admin can create a user and see them appear on the device automatically.

### 2.1 User domain
- ☐ Tables: `users`, `user_credentials`, `access_groups`, `user_access_groups`, `access_group_doors`, `doors`, `device_user_sync`
- ☐ CRUD APIs for users, access groups
- ☐ Card management endpoints

### 2.2 Queue infrastructure
- ☐ BullMQ wiring with named queues
- ☐ Worker process (`apps/worker`)
- ☐ Job schema types in `libs/queue`
- ☐ Idempotency keys derived deterministically
- ☐ Retry/backoff per `DriverError`
- ☐ DLQ + handler

### 2.3 User sync
- ☐ `HikvisionDriver.upsertUser` / `deleteUser` / `listUsers` / `upsertCard`
- ☐ `user-sync` worker
- ☐ State machine in `device_user_sync`
- ☐ Per-device fairness
- ☐ Revision-based stale-job guard
- ☐ `POST /users/:id/resync`
- ☐ `GET /users/:id/sync-status`

### 2.4 Door unlock
- ☐ `HikvisionDriver.unlockDoor`
- ☐ `POST /devices/:id/unlock` (synchronous)
- ☐ MFA-recently-verified guard
- ☐ Audit before+after

### 2.5 Reconciler
- ☐ Scheduled diff job (every 5 min)
- ☐ Nightly full sweep
- ☐ Drift metric per device

### 2.6 Observability
- ☐ Prometheus metrics for queues
- ☐ "Sync engine health" Grafana dashboard
- ☐ Alerts for queue depth, error rate, DLQ growth

### 2.7 Tests
- ☐ Sync worker unit + integration tests
- ☐ Reconciler test: induce drift on Mock, verify it heals
- ☐ Chaos test: kill worker mid-job, verify recovery
- ☐ Load test: 1k users × 5 devices, p95 sync time

**Acceptance criteria:**
- ✅ Creating a user enqueues N jobs (one per relevant device); all complete in < 30 s under normal load.
- ✅ Killing a device mid-sync results in retries with backoff and eventual success when device returns.
- ✅ Deleting a user removes them from all devices; `device_user_sync` shows `absent/synced`.
- ✅ Reconciler heals an intentionally-deleted user on the device within one cycle.

---

## Phase 3 — Events, Realtime & Face Sync *(weeks 7–9)*

Goal: live events flowing from devices to dashboards; face credentials syncing.

### 3.1 Receiver
- ☐ `POST /hikvision/events` endpoint (separate app `apps/receiver`)
- ☐ Per-device token verification
- ☐ Dedup key + UNIQUE index
- ☐ Fast persist + enqueue, return 200 in < 100 ms

### 3.2 Push configuration
- ☐ `HikvisionDriver.configureHttpPush`
- ☐ Auto-configure on device registration
- ☐ Token rotation job (weekly)

### 3.3 Event processing
- ☐ `event-process` worker
- ☐ XML + JSON parsers (XXE-hardened)
- ☐ Classification logic + tests
- ☐ Update `access_events` row with parsed fields

### 3.4 Pull-mode fallback
- ☐ `HikvisionDriver.pullEvents`
- ☐ `event-poll` worker with bounded window
- ☐ Mode detection during capability discovery

### 3.5 Realtime fan-out
- ☐ Socket.IO server + Redis adapter
- ☐ Auth on connect
- ☐ Rooms (tenant, site, device)
- ☐ Pub/sub from event worker
- ☐ Client gap-fill on reconnect (server emits last-seen cursor)

### 3.6 Face sync
- ☐ Face upload endpoint (`POST /users/:id/credentials/face`, multipart)
- ☐ Image validation + sharp re-encode
- ☐ Store in S3
- ☐ `HikvisionDriver.upsertFace`
- ☐ `face-sync` worker (separate queue, lower concurrency)

### 3.7 Events API
- ☐ `GET /events` with pagination, filtering
- ☐ `GET /events/:id`
- ☐ Async export endpoint

### 3.8 Tests
- ☐ Receiver load test: 500 events/sec, p95 < 100 ms
- ☐ Duplicate POST → exactly one row
- ☐ End-to-end: swipe simulated → dashboard receives within 500 ms p95
- ☐ XXE attack vector test on XML parser
- ☐ Face upload + sync verified on real device

**Acceptance criteria:**
- ✅ Dashboard shows access events in real time with p95 < 500 ms from device.
- ✅ Receiver sustains 500 ev/s with no event loss or duplicates.
- ✅ Face upload appears on device within 30 s.
- ✅ Push-mode device retries do not create duplicates.
- ✅ Pull-mode device is handled identically from the client's perspective.

---

## Phase 4 — Hardening & Production Readiness *(weeks 10–12)*

Goal: shippable to a paying customer.

### 4.1 Security hardening
- ☐ Pen test (external)
- ☐ Threat-modeling workshop
- ☐ Secret scanner in CI
- ☐ Dependency scanner in CI
- ☐ SAST + DAST in CI
- ☐ Audit log immutability verified
- ☐ Key rotation procedure documented and rehearsed

### 4.2 Operational readiness
- ☐ Runbooks for every alert
- ☐ On-call rotation set up
- ☐ Status page
- ☐ Incident response process documented
- ☐ Postmortem template

### 4.3 DR
- ☐ Backup automation
- ☐ Restore drill (Postgres, Redis, S3)
- ☐ Failover drill
- ☐ Documented RTO/RPO and verified

### 4.4 Performance
- ☐ Load test against representative traffic
- ☐ Capacity plan documented
- ☐ Slow-query baseline + indexing review
- ☐ Connection pool tuning

### 4.5 Documentation
- ☐ Admin user guide
- ☐ Integrator (API) guide
- ☐ Site-installation guide (WireGuard provisioning)
- ☐ ADRs for all major decisions

**Acceptance criteria:**
- ✅ Load test confirms target capacity with headroom.
- ✅ DR drill restores stack to RTO within 30 min.
- ✅ Pen test findings triaged; criticals fixed before launch.
- ✅ Runbooks rehearsed; on-call can resolve a synthetic incident.

---

## Phase 5 — Multi-Tenant & Roadmap Features *(post-launch)*

Per the source doc's Phase 2 & 3 roadmap.

- ☐ Multi-tenant isolation (RLS) + tenant onboarding flow
- ☐ Attendance reporting
- ☐ Audit log export
- ☐ Multi-site dashboards with site-scoped roles
- ☐ Mobile app (consumer of existing APIs)
- ☐ Second vendor driver (Suprema or ZKTeco)
- ☐ Analytics pipeline (events → warehouse)
- ☐ Public webhooks for 3rd-party integrations

---

## Cross-Phase Quality Gates

These MUST be green before any phase is declared complete:

| Gate | How verified |
|------|--------------|
| Unit test coverage ≥ 80% on `libs/` | CI report |
| Integration tests pass against MockDriver | CI |
| Smoke tests pass against real device on dev bench | Nightly job |
| No criticals from secret/dep scanners | CI |
| Lint + typecheck clean | CI |
| Migrations forward + rollback work | CI |
| Updated docs in PR if behavior changed | PR review |
| New endpoint has OpenAPI + tests | PR review |
| New env var is in `.env.example` | PR review |
| New metric has a dashboard panel | PR review |

---

## Risk Register (top items)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Firmware variations break sync | High | High | Capability discovery + per-firmware fallback paths + nightly smoke tests against multiple device models |
| Network instability at remote sites | High | Medium | Aggressive retries, exponential backoff, reconciler, device-side buffering |
| Devices retry on slow 200 → flood | Medium | High | Receiver isolated; minimal work before 200; rate-limit at Nginx |
| KMS / secrets misconfig | Low | Critical | Startup validation + DR drill |
| Postgres lock contention on hot tables | Medium | Medium | Partition `access_events`; index review; batch inserts |
| Single-vendor lock-in (HikCentral was rejected for this) | Mitigated by driver abstraction | — | Add second vendor in Phase 5 |
| Compromised admin account | Low | Critical | MFA, anomaly detection, audit log review |
| Loss of event push config on device after reboot | Medium | Medium | Reconciler verifies push config; re-applies if missing |
