# 09 — Deployment & DevOps

How the system is built, packaged, shipped, run, observed, and recovered.

---

## 1. Environments

| Env | Purpose | Data | Access |
|-----|---------|------|--------|
| `local` | Engineer's laptop, Docker Compose | Seeded fixtures | Engineer |
| `dev` | Shared dev environment | Synthetic data, ephemeral | Engineering |
| `staging` | Pre-prod, mirror of prod topology | Anonymized prod snapshot | Engineering + QA |
| `prod` | Production | Live | Ops on-call only |

All four are deployed from the same Docker images. Configuration differs only via env vars and secrets.

---

## 2. Local Development (Docker Compose)

`infra/compose/docker-compose.dev.yml` brings up:

- `postgres:16`
- `redis:7`
- `minio` (S3-compatible)
- `api` (NestJS, hot-reload via mounted source)
- `worker`
- `receiver`
- `nginx` (front)
- `mock-device` (an instance of MockDriver exposed as a fake HTTP server for end-to-end tests)

One-command bootstrap:

```bash
make dev-up           # docker compose up + migrate + seed
make dev-down
make logs SERVICE=api
make test
```

---

## 3. Container Images

One Dockerfile per app under `infra/docker/`. All use multi-stage builds:

```Dockerfile
# build stage
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:api

# runtime stage
FROM node:20-alpine
WORKDIR /app
COPY --from=build /src/dist/apps/api ./
COPY --from=build /src/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "main.js"]
```

Image hardening:
- Run as non-root (`USER node`).
- No `apk add` of shells/curl in runtime stage.
- Multi-arch builds (`linux/amd64`, `linux/arm64`).
- Image signed with `cosign`.

---

## 4. Prod Topology

```
                ┌────────────────────┐
                │  Cloud Load        │
                │  Balancer (TLS)    │
                └─────────┬──────────┘
                          │
                ┌─────────▼──────────┐
                │      Nginx         │  (2+ replicas)
                │  WAF / rate limit  │
                └─────────┬──────────┘
                          │
        ┌─────────────────┼─────────────────┬───────────────────┐
        ▼                 ▼                 ▼                   ▼
   ┌─────────┐      ┌─────────┐       ┌──────────┐        ┌──────────┐
   │  api    │      │  api    │ ...   │ receiver │  ...   │ receiver │
   │  pod    │      │  pod    │       │  pod     │        │  pod     │
   └─────────┘      └─────────┘       └──────────┘        └──────────┘
        │                 │                 │                   │
        └─────────────────┼─────────────────┴───────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐      ┌─────────┐       ┌─────────┐
   │ worker  │      │ worker  │ ...   │ worker  │
   └─────────┘      └─────────┘       └─────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌─────────┐ ┌─────────┐
        │ Postgres │ │  Redis  │ │   S3    │
        │ Primary  │ │ Primary │ │         │
        │   +RR    │ │ +Replica│ │         │
        └──────────┘ └─────────┘ └─────────┘
                          │
                    ┌─────▼──────┐
                    │ WireGuard  │
                    │ Concentrat.│
                    └─────┬──────┘
                          │
                ┌─────────┴──────────┐
                ▼                    ▼
              Site A               Site B  ...
```

- **API tier** scaled by CPU/req-per-second.
- **Receiver tier** scaled by event throughput.
- **Worker tier** scaled by queue depth.
- **Postgres** with HA via streaming replication; PITR enabled.
- **Redis** with replica; AOF persistence on.

Orchestrator: **Docker Swarm** for small deployments, **Kubernetes** when ≥3 sites or ≥1000 devices.

---

## 5. Configuration

- All env vars documented in `.env.example`.
- Validated at startup with a Zod schema; the app refuses to start on misconfig.
- Feature flags via env (`FEATURE_FACE_SYNC=true`) for staged rollouts.

---

## 6. CI/CD

Pipeline (GitHub Actions):

```
on: pull_request, push (main)

jobs:
  lint        — eslint + prettier check
  typecheck   — tsc --noEmit
  unit        — vitest run
  integration — bring up Postgres + Redis + MockDriver, run integration suite
  security    — gitleaks, npm audit, semgrep
  build       — docker buildx (multi-arch)
  e2e         — Playwright + docker-compose stack
  publish     — push images to registry (main branch only)
  deploy      — trigger deployment to dev (auto), staging (auto), prod (manual approval)
```

Branch policy:
- `main` is always deployable.
- Feature work in PRs from short-lived branches.
- Required reviewers: 1 for libs, 2 for security-sensitive paths (auth, audit, drivers).
- All checks must pass; signed commits required.

---

## 7. Deployments

Strategy: **rolling update with health checks** for app tier.
- `/health` (liveness) and `/health/ready` (readiness) checked by orchestrator.
- Graceful shutdown: stop accepting new requests, drain in-flight, exit ≤ 30 s.

Migrations:
- Run **before** new pods accept traffic.
- Expand/contract pattern for schema changes that aren't strictly additive.
- Migration job is idempotent and re-runnable.

---

## 8. Observability

### 8.1 Logs
- Structured JSON, `pino`.
- Fields: `time, level, msg, trace_id, tenant_id, user_id, route, device_id, job_id`.
- Shipped to Loki (or CloudWatch / Datadog).

### 8.2 Metrics
- Prometheus scrape of `/metrics` on every app.
- Custom metrics (see `06-sync-engine.md` §8).
- Grafana dashboards version-controlled (`infra/grafana/`).

### 8.3 Traces
- OpenTelemetry, exported to Tempo/Jaeger/Datadog APM.
- Spans wrap: HTTP request, queue enqueue, queue dequeue, driver call, DB query.
- `trace_id` propagated from HTTP to job to driver to DB.

### 8.4 Alerts
Page (P1):
- API error rate > 5% for 5 min
- DB connection failure
- DLQ growing
- Auth failure spike (possible attack)
- Receiver returning non-200

Notify (P2):
- Sync failure rate > 5% for 15 min
- Single device offline > 30 min
- p95 latency > 2× target

---

## 9. Backups & DR

| Asset | Backup | Frequency | Retention | Tested |
|-------|--------|-----------|-----------|--------|
| Postgres | base + WAL | continuous WAL, daily base | 30 days hot, 1 year cold | Restore drill quarterly |
| Redis | AOF | continuous | 7 days | Failover drill quarterly |
| Object storage | Versioning + cross-region replication | continuous | 1 year | Listed in DR runbook |
| Secrets / KMS | Provider-managed | — | — | Documented recovery path |

Targets: **RPO ≤ 5 min, RTO ≤ 30 min** for the API. Event ingestion is allowed RPO ≤ 1 min because devices buffer.

---

## 10. Capacity Planning (starting point)

| Scale | API replicas | Worker replicas | Receiver replicas | DB |
|-------|--------------|-----------------|-------------------|----|
| 1 site, 10 devices, 100 users | 2 | 2 | 2 | 1 (managed small) |
| 10 sites, 100 devices, 5k users | 3 | 4 | 3 | 1 primary + 1 RR (medium) |
| 100 sites, 1k devices, 50k users | 6 | 12 | 8 | Primary + 2 RR (large) + read partitioning |

Workers scale primarily with event volume and user-sync churn. Receivers scale with event volume only.

---

## 11. Deployment Acceptance Checklist

- ☐ `make dev-up` brings up a working stack end-to-end on a clean laptop
- ☐ All images are multi-arch and signed
- ☐ Liveness + readiness endpoints work and differ correctly
- ☐ Graceful shutdown verified by sending SIGTERM during load
- ☐ Migrations forward + rollback exercised in CI
- ☐ Rolling deploy completes without dropping connections (verified by k6 test)
- ☐ Prometheus, Loki, Tempo wired in staging and prod
- ☐ Alerts wired to PagerDuty/Slack, tested with synthetic incident
- ☐ DR runbooks exist and have been rehearsed at least once
- ☐ Backups verified by full restore to a scratch instance
- ☐ Capacity load test confirms target throughput before launch
