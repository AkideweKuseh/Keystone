# 02 — Tech Stack & Rationale

This file records *what* we picked and, more importantly, *why*. If anyone proposes replacing a component, this is the document to update.

---

## 1. Stack Summary

| Layer | Choice | Version (min.) |
|-------|--------|----------------|
| Runtime | Node.js LTS | 20.x |
| Language | TypeScript | 5.x |
| HTTP framework | **NestJS** | 10.x |
| ORM / Query Builder | Prisma (or TypeORM) | latest |
| Primary DB | PostgreSQL | 16.x |
| Queue & Cache | Redis + BullMQ | Redis 7.x / BullMQ 5.x |
| Realtime | Socket.IO + Redis adapter | 4.x |
| HTTP client (digest) | `digest-fetch` or custom | — |
| Validation | Zod or class-validator | latest |
| Auth | JWT (access + refresh) | — |
| VPN | WireGuard | latest |
| Reverse proxy | Nginx | 1.24+ |
| Containerization | Docker + Docker Compose (dev), Kubernetes optional (prod) | — |
| CI/CD | GitHub Actions / GitLab CI | — |
| Observability | OpenTelemetry + Prometheus + Grafana + Loki | — |
| Object storage | S3-compatible (MinIO in dev) | — |
| Tests | Vitest / Jest, Supertest, Playwright | — |

---

## 2. Detailed Rationale

### 2.1 NestJS over plain Express
**Why:** Modular structure, DI container, decorators map well to a domain-services architecture, first-class support for guards/interceptors/pipes that we need for auth + validation + tracing. Easy to onboard new engineers because the structure is opinionated.

**Trade-off:** Slightly more ceremony than raw Express, but it pays for itself by the second feature.

### 2.2 PostgreSQL over MongoDB
**Why:**
- The domain is **relational** (users ↔ devices ↔ permissions ↔ events).
- We need **ACID** for permission grants and sync state.
- JSONB gives us flexibility for `raw_payload` without giving up schemas elsewhere.
- Mature replication, PITR, and ecosystem.

### 2.3 Redis + BullMQ over Kafka
**Why:**
- BullMQ gives us **retries, delays, rate limiting, repeat jobs, priorities** out of the box — exactly what device sync needs.
- We don't need event-log replay at the scale Kafka justifies.
- One less stateful system to operate.

**When we'd revisit:** if we cross ~50k events/sec or need long retention of the raw event stream for analytics replay.

### 2.4 Socket.IO over raw WebSockets
**Why:**
- Built-in reconnection, namespaces, rooms (one room per site/tenant).
- Redis adapter makes horizontal scale trivial.
- Browser & mobile SDKs are mature.

### 2.5 WireGuard over OpenVPN / IPsec
**Why:**
- Modern crypto, tiny config, very fast.
- Stateless, kernel-level on Linux → low CPU on the concentrator.
- Easy to script peer provisioning when a new site comes online.

### 2.6 HTTP Digest Auth for ISAPI
**Why:** Hikvision ISAPI requires it. No choice here — but we wrap it so the rest of the codebase doesn't have to think about it.

### 2.7 Docker + Nginx
**Why:**
- Docker normalizes dev/prod parity.
- Nginx handles TLS termination, gzip, HTTP/2, WebSocket upgrade, and rate limiting — all things we don't want in our app code.

---

## 3. Repository Layout

```
smart-access-middleware/
├── apps/
│   ├── api/                   # NestJS HTTP + WebSocket app
│   ├── worker/                # BullMQ worker processes
│   └── receiver/              # Device event ingestion endpoint (can be merged with api)
├── libs/
│   ├── domain/                # Pure domain logic (no I/O)
│   ├── drivers/
│   │   ├── core/              # AccessDeviceDriver interface, registry
│   │   ├── hikvision/         # ISAPI implementation
│   │   └── mock/              # In-memory driver for tests
│   ├── persistence/           # Prisma schema, repositories
│   ├── queue/                 # BullMQ setup, queue names, job types
│   ├── auth/                  # JWT, RBAC, decorators
│   ├── audit/                 # Append-only audit log
│   └── shared/                # Logging, config, errors, utils
├── infra/
│   ├── docker/                # Dockerfiles
│   ├── compose/               # docker-compose.{dev,prod}.yml
│   ├── nginx/                 # Nginx configs
│   ├── wireguard/             # WG configs and provisioning scripts
│   └── k8s/                   # (optional) Kubernetes manifests
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/                      # This documentation set
├── .env.example
├── package.json
└── tsconfig.json
```

A monorepo (pnpm workspaces or Nx) is recommended because `libs/` is shared across `apps/`.

---

## 4. Local Development Prerequisites

- Node.js 20+, pnpm 9+
- Docker Desktop / Podman
- A Hikvision device for true integration testing (or the mock driver)
- `mkcert` for local HTTPS
- `wireguard-tools` if you want to test VPN locally

---

## 5. Environment Variables (excerpt)

```env
# App
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://app:app@localhost:5432/sam

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# Crypto (for device password encryption at rest)
DEVICE_SECRET_KEY=base64:...

# Object storage
S3_ENDPOINT=...
S3_BUCKET=sam-faces
S3_ACCESS_KEY=...
S3_SECRET_KEY=...

# Sync engine
SYNC_CONCURRENCY=10
SYNC_MAX_RETRIES=8
SYNC_BACKOFF_MS=5000

# Devices
DEVICE_REQUEST_TIMEOUT_MS=10000
```

A full `.env.example` MUST be checked in; real `.env` files MUST NOT.

---

## 6. Coding Standards (one-screen summary)

- TypeScript `strict: true`. No `any` without a `// FIXME(any):` comment.
- ESLint + Prettier; run on pre-commit (Husky + lint-staged).
- Domain code MUST NOT import from `apps/` or framework packages.
- Every public function in `libs/` has a doc comment.
- Every error thrown is a typed `DomainError`, mapped to HTTP at the controller boundary only.
- Logs are structured JSON. No `console.log` in committed code.
- Every commit message follows Conventional Commits.

---

## 7. Decision Log (ADRs)

Maintain `docs/adr/NNNN-title.md` files for any decision that changes the stack or a principle. Examples:
- `0001-use-postgres-as-source-of-truth.md`
- `0002-bullmq-over-kafka.md`
- `0003-vendor-driver-interface.md`
- `0004-vpn-over-public-port-forward.md`
