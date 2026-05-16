# 01 — Architecture Overview

## 1. System Context

The Smart Access Middleware Platform sits between consumer applications (web dashboards, mobile apps, third-party HR/ERP systems) and the access-control hardware (Hikvision controllers, face terminals, door controllers). It acts as the single source of truth and the single integration surface.

```
┌─────────────────────────────────────────────────────────────┐
│                     CONSUMER LAYER                          │
│  Web Dashboard | Mobile App | HR System | 3rd-party APIs    │
└─────────────────────────┬───────────────────────────────────┘
                          │  HTTPS / WSS
┌─────────────────────────▼───────────────────────────────────┐
│                  MIDDLEWARE PLATFORM                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  API Gateway │  │  WebSocket   │  │  Event Receiver  │  │
│  │   (REST)     │  │   Server     │  │   (push from     │  │
│  │              │  │  (Socket.IO) │  │    devices)      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                   │            │
│  ┌──────▼─────────────────▼───────────────────▼─────────┐  │
│  │             Domain Services Layer                    │  │
│  │  Users · Devices · Access · Events · Audit · Tenant  │  │
│  └──────┬───────────────────────────────────────────────┘  │
│         │                                                  │
│  ┌──────▼──────────┐    ┌──────────────────┐               │
│  │  PostgreSQL     │    │  Redis + BullMQ  │               │
│  │  (source of     │    │  (queue, cache,  │               │
│  │   truth)        │    │   pub/sub)       │               │
│  └─────────────────┘    └────────┬─────────┘               │
│                                  │                         │
│  ┌───────────────────────────────▼─────────────────────┐   │
│  │           Sync Engine Workers (BullMQ)              │   │
│  │  user-sync · face-sync · event-fetch · health-check │   │
│  └─────────────┬───────────────────────────────────────┘   │
│                │                                           │
│  ┌─────────────▼───────────────────────────────────────┐   │
│  │        Vendor Driver Layer (Abstraction)            │   │
│  │  HikvisionDriver  · (future) SupremaDriver · ...    │   │
│  └─────────────┬───────────────────────────────────────┘   │
└────────────────┼───────────────────────────────────────────┘
                 │  WireGuard VPN
┌────────────────▼───────────────────────────────────────────┐
│                     DEVICE LAYER                           │
│   Site A: Controllers · Face Terminals · Door Readers      │
│   Site B: Controllers · Face Terminals · Door Readers      │
│   Site C: ...                                              │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Component Catalogue

### 2.1 API Gateway (REST)
- Stateless Node.js (NestJS) HTTP server behind Nginx.
- Handles authentication (JWT), authorization (RBAC), input validation, rate-limiting.
- **Does not** call devices directly — it writes intent to PostgreSQL and enqueues sync jobs.

### 2.2 WebSocket Server
- Socket.IO server clustered with the Redis adapter for horizontal scale.
- Subscribes to `events:*` channels in Redis and fans out to authorized clients.
- Used for live door events, sync status changes, device health changes.

### 2.3 Event Receiver
- HTTP endpoint that Hikvision devices POST to (HTTP listening / Alarm Server config).
- MUST respond `200 OK` quickly to prevent device retry storms (see [§17 in source doc](#)).
- Parses XML/JSON, validates, persists raw payload, then enqueues processing.

### 2.4 Domain Services
Pure business logic, framework-agnostic. Each service owns its aggregate:
- **UserService** — CRUD, card/PIN/face management, status lifecycle.
- **DeviceService** — registration, capability discovery, health, credentials.
- **AccessService** — permissions, schedules, door groups, access rules.
- **EventService** — ingestion, classification, deduplication, broadcast.
- **AuditService** — append-only audit log of every admin action.
- **TenantService** — multi-tenant isolation (Phase 3).

### 2.5 Sync Engine (Workers)
- BullMQ workers, one process per queue, horizontally scalable.
- Each job is **idempotent** and **retried with exponential backoff**.
- Workers translate domain intent into ISAPI calls via the Driver Layer.

### 2.6 Driver Layer (Hardware Abstraction)
- Strict TypeScript interface: `AccessDeviceDriver`.
- Each vendor implements the interface. Selection is per-device based on `device.vendor` and `device.model`.
- Internal `CapabilityRegistry` describes which features each firmware supports (because firmware varies wildly across Hikvision models — see ⚠️ in source doc §21).

### 2.7 Data Stores
- **PostgreSQL 16+** — primary store; ACID; the only authoritative source.
- **Redis 7+** — queue (BullMQ), cache, pub/sub for WebSocket fan-out.
- **Object storage (S3-compatible)** — face images, audit exports.

---

## 3. Core Design Principles

### P1 — Database is the Source of Truth
Devices are replicas. If a device disagrees with the DB, the DB wins. Reconciliation jobs re-push state.

### P2 — Eventual Consistency
Every device-bound mutation is enqueued. The API never blocks on a device round-trip. The UI shows `sync_status` per (user, device) pair.

### P3 — Idempotency Everywhere
Every job has an idempotency key. Re-running a job MUST be safe.

### P4 — Hardware Independence
No vendor-specific code outside `/drivers/<vendor>/`. Domain layer talks to the `AccessDeviceDriver` interface only.

### P5 — Fail Loud, Recover Quietly
Errors surface in `device_user_sync.error_message` and on the WebSocket. Retries happen automatically with backoff. Permanent failures move to a dead-letter queue with alerting.

### P6 — Observability First
Structured logs (JSON), traces (OpenTelemetry), metrics (Prometheus) from day one — not after the first incident.

---

## 4. Request Flow Examples

### 4.1 Admin creates a user → device receives it

```
1. POST /api/users           (web dashboard)
2. AuthN/AuthZ checks        (API Gateway)
3. Validate + persist        (UserService → PostgreSQL)
4. Enqueue sync jobs         (one per target device, in BullMQ)
5. Return 201 to client      (immediate; sync is async)
6. Worker picks job          (BullMQ)
7. Worker calls driver       (HikvisionDriver.createUser)
8. Driver issues ISAPI POST  (HTTP Digest auth, XML body)
9. Update device_user_sync   (success or queued retry)
10. Emit WebSocket event     (sync:user-status to dashboard)
```

### 4.2 Device pushes an access event → client sees it live

```
1. Card swipe at door
2. Device POSTs to /events   (HTTP push, XML payload)
3. Receiver responds 200 OK  (immediately, before processing)
4. Raw payload written       (access_events.raw_payload JSONB)
5. Job enqueued              (process-event queue)
6. Worker parses + classifies, resolves employee_no → user
7. Redis pub: events:granted (channel)
8. Socket.IO fans out        (to authorized dashboard clients)
9. Dashboard renders         (within ~200ms end-to-end target)
```

### 4.3 Admin clicks "Unlock Door"

```
1. POST /api/devices/:id/unlock
2. AuthZ check (does user have unlock permission for this door?)
3. AuditService records action (before execution)
4. Driver issues ISAPI command (XML: <RemoteControlDoor><cmd>open</cmd>...)
5. Response (success/failure) returned to client synchronously
6. AuditService updates record with outcome
7. WebSocket broadcast: door:unlocked
```

Note: door unlock is **synchronous** because the user is waiting. User/face sync is **asynchronous**.

---

## 5. Topology & Deployment Shape

- **Single primary region** with PostgreSQL primary + read replica.
- **Stateless app tier** scaled horizontally behind Nginx.
- **Worker tier** scaled independently of API tier (different load profile).
- **WireGuard concentrator** on the same network as workers and receiver.
- **Each remote site** runs a WireGuard client on a small gateway (NUC or industrial mini-PC) that bridges devices into the VPN.

See `09-deployment-and-devops.md` for the deployment topology diagram.

---

## 6. Non-Functional Requirements

| Attribute | Target |
|-----------|--------|
| API p95 latency (non-device) | < 200 ms |
| Event ingestion p95 | < 100 ms (200 OK) |
| Event → dashboard p95 | < 500 ms |
| User sync per device | < 5 s under normal load |
| Sync engine throughput | ≥ 200 jobs/sec/worker |
| Availability (API) | 99.9 % monthly |
| Data durability (Postgres) | RPO ≤ 5 min, RTO ≤ 30 min |
| Multi-site count | Designed for 100+ sites, 10k+ devices |
| Concurrent WS clients | 5,000 baseline |

---

## 7. Out of Scope (for now)

- On-device firmware updates (Phase 3+).
- Video/NVR integration (separate platform).
- Visitor management UI (consumer of our APIs, not part of platform).
- Direct biometric matching on the server (we delegate to device).
