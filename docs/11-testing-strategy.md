# 11 — Testing Strategy & Acceptance Criteria

A test plan is part of the definition of "done." This document defines what gets tested, how, and what passing actually means.

---

## 1. Test Pyramid

```
                    ▲
                    │ E2E (Playwright)         ~5%
                    │ Smoke against real device
                    ├──────────────────────────┐
                    │ Integration              ~25%
                    │ (API, DB, Redis, Mock)
                    ├──────────────────────────┐
                    │ Unit                     ~70%
                    │ (libs/, drivers, domain)
                    └──────────────────────────►
```

Why this shape: unit tests are cheap and pinpoint; integration tests catch wiring; E2E is expensive and reserved for true user journeys.

---

## 2. Tooling

| Layer | Tool |
|-------|------|
| Unit | Vitest (or Jest) |
| HTTP integration | Supertest against a NestJS test module |
| DB | Real Postgres in Docker (testcontainers in CI) |
| Queue | Real Redis in Docker |
| Driver integration | MockDriver always; nightly job runs against a physical bench device |
| WebSocket | `socket.io-client` against a test server |
| E2E UI | Playwright |
| Load | k6 |
| Chaos | Custom scripts that kill containers / drop network |
| Security | Semgrep, gitleaks, npm audit, OWASP ZAP |
| Contract | OpenAPI schema diff in CI |

---

## 3. Unit Tests

Targets:
- `libs/domain/*` — every service method
- `libs/drivers/hikvision/*` — payload builders, error translator, capability negotiation
- `libs/queue/*` — idempotency key derivation, retry policy mapping
- Validation schemas
- Audit log helper

Rules:
- No I/O. All collaborators are mocked.
- One behavior per test.
- Coverage gate: **≥ 80% lines, ≥ 75% branches** on `libs/`.
- Property-based tests (`fast-check`) for parsers and key-derivation functions.

---

## 4. Integration Tests

Cover the seams: HTTP → service → repository → DB → queue → worker → driver.

### 4.1 API integration
For every endpoint:
- Happy path (200/201)
- Auth missing → 401
- Auth insufficient scope → 403
- Validation failure → 400 with Problem+JSON
- Not found → 404
- Idempotency replay → same response, no side effects
- Rate limit → 429 after threshold

### 4.2 Worker integration
For each job type:
- Successful job updates DB and emits event
- Driver error → correct retry path (`Timeout` retries, `AuthFailed` does not)
- DLQ on exhaustion
- Stale-revision job is a no-op
- Re-running a completed job is a no-op

### 4.3 Receiver integration
- Valid XML + JSON payloads → 200, one row
- Invalid token → 401, no row, no enqueue
- Duplicate body → 200, exactly one row in DB (dedup verified)
- Slow disk → still returns 200 within budget (perf assertion)

### 4.4 Realtime integration
- Connect with valid JWT → joins correct rooms
- Connect with no JWT → rejected
- Event published to Redis → received on Socket.IO client
- Gap-fill works: client disconnects, events occur, reconnects, queries `from=<lastSeen>` and receives the missed ones

---

## 5. End-to-End Tests

Playwright runs against the Docker Compose stack. Each scenario starts from a fresh seed.

| Scenario | Steps | Pass criteria |
|----------|-------|---------------|
| Admin onboarding | Sign in → register device (mock) → wait for `online` | Device shows online within 30 s, capabilities populated |
| Create user → see on device | Create user with card → wait for sync | `device_user_sync` shows `synced` within 15 s; mock device API confirms upsert |
| Live event display | Trigger simulated swipe at mock device | Dashboard shows event within 1 s |
| Door unlock | Click "Unlock" in UI | Mock device records command; audit log has before+after entries |
| User deletion | Delete user | Removed from all devices; events thereafter classify as `denied`/unknown user |
| Reconnect resilience | Disconnect WS for 60 s, trigger events meanwhile, reconnect | All events present after reconnect via gap-fill |
| Face credential | Upload face → wait for sync | Face appears on mock device |

---

## 6. Smoke Tests Against Real Hardware

Nightly job, dedicated bench device(s):

- `getDeviceInfo` returns parseable response.
- Capability discovery matches the previously stored capabilities (alerts on drift, e.g. firmware update).
- Create a test user, push it, list it back, delete it.
- Issue a door unlock; verify HTTP 200 (we don't physically verify the door — that's a manual ops check).
- Configure HTTP push; trigger an event via test scenario; receiver gets it.
- All flow within reasonable timeouts.

Failures in nightly smoke tests page the responsible engineer.

---

## 7. Performance Tests

`k6` scripts in `tests/perf/`:

| Test | Target | Pass criteria |
|------|--------|---------------|
| API steady state | Mixed CRUD, 200 RPS, 10 min | p95 < 200 ms, error rate < 0.1% |
| Receiver burst | 1,000 events/sec for 5 min | p95 < 100 ms 200 OK, no drops |
| Sync throughput | 5,000 user-sync jobs queued | Drained in < 5 min on baseline cluster |
| WebSocket fan-out | 5,000 concurrent clients, 100 ev/sec | All clients receive within 1 s p99 |
| DB query mix | Realistic event reads + writes | Postgres CPU < 70%, no long-running queries |

Baselines are recorded after each major release and compared. A regression of > 20% in p95 fails the perf gate.

---

## 8. Chaos & Resilience Tests

Quarterly drills (and a subset in CI):

- Kill a worker mid-job → job resumes elsewhere, no double-write
- Kill the API while a sync is enqueued → DB stays consistent
- Network partition between worker and devices → retries kick in; reconciler heals
- Postgres failover → API recovers within 60 s
- Redis failover → workers reconnect, queue continues
- Receiver overwhelmed → degrades gracefully (still 200s, may delay processing)

---

## 9. Security Tests

In CI:
- `gitleaks` — secrets scan on every commit
- `npm audit` (or `pnpm audit --prod`) — fail on critical
- `semgrep` — rules for JWT misuse, SQL injection patterns, XXE
- ESLint security plugin

In release pipeline:
- OWASP ZAP baseline scan against staging
- Authorization tests: each endpoint refuses each insufficient role
- XXE attack vectors against the receiver
- Open redirect / SSRF probes against the driver layer (outgoing HTTP must not follow redirects to unknown hosts)
- JWT tampering tests (wrong sig, expired, wrong audience)

Externally:
- Annual third-party pen test
- Quarterly internal red-team exercise

---

## 10. Contract Tests

- The OpenAPI spec is the contract.
- A CI job diffs the generated spec against the committed one and fails on undocumented changes.
- Consumer apps (frontend, mobile) can pin to an OpenAPI version and generate clients.
- Breaking changes require a major version bump and a deprecation window (≥ 90 days).

---

## 11. Test Data Management

- Each integration test starts from a clean DB schema and seeds its own fixtures.
- A `TestDataBuilder` exposes fluent helpers: `aUser().withCard(...).withAccessGroup(...).build()`.
- No shared mutable global state between tests.
- Tests use frozen time via `vi.useFakeTimers()` where time-sensitive.

---

## 12. Test Ownership

| Suite | Owner |
|-------|-------|
| Unit | Whichever team owns the library |
| API integration | Backend team |
| Worker integration | Backend team |
| Realtime integration | Backend team |
| E2E | QA |
| Smoke (real device) | Backend + Hardware ops |
| Perf | Performance Eng / SRE |
| Chaos | SRE |
| Security | Security Eng |

Tests are part of the deliverable. A PR without tests is incomplete by policy.

---

## 13. Master Test Acceptance Checklist

### Per-feature
- ☐ Unit tests written and cover happy + sad paths
- ☐ Integration test exercises the new endpoint / job end-to-end
- ☐ If user-facing: E2E scenario added or extended
- ☐ If a new metric: dashboard updated
- ☐ If new env var: `.env.example` updated
- ☐ If schema change: migration tested rollback as well as forward

### Per-release
- ☐ All unit tests green
- ☐ All integration tests green
- ☐ Coverage thresholds met
- ☐ E2E suite green on staging
- ☐ Nightly smoke tests green for the last 3 nights
- ☐ Perf baselines re-recorded; no > 20% regression
- ☐ Security scans clean (no criticals, highs triaged)
- ☐ ZAP baseline scan reviewed
- ☐ DR drill performed in the last quarter
- ☐ Pen-test findings from last test all resolved or accepted with rationale

---

## 14. Definition of Done (for any user story)

A story is **Done** when:

1. ✅ Code merged to `main` via reviewed PR
2. ✅ All test gates green in CI
3. ✅ Documentation updated (this doc set + ADR if applicable)
4. ✅ Observability added (logs, metrics, traces) if the feature warrants
5. ✅ Feature is behind a flag if rollout is staged
6. ✅ Deployed to `dev`, then `staging`, validated by QA
7. ✅ Runbook updated if there are new failure modes
8. ✅ Product/PM confirms acceptance criteria on staging

Until all eight are checked, the story is not Done — it's "in progress with code merged."
