# Smart Access Middleware Platform

Vendor-abstraction middleware and synchronization engine for Hikvision (and future multi-vendor) access-control devices. Eliminates HikCentral/OpenAPI licensing by communicating directly with devices via ISAPI.

## Prerequisites

- Node.js 20+ (`nvm use` — see `.nvmrc`)
- pnpm 9+ (`npm install -g pnpm@9`)
- Docker + Docker Compose

## Quick Start

```sh
cp .env.example .env
pnpm install
pnpm run dev:up       # start postgres, redis, minio
pnpm run dev:api      # start API in dev mode (port 3000)
```

## Scripts

| Script                   | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `pnpm run dev:up`        | Start local services (postgres, redis, minio) |
| `pnpm run dev:down`      | Stop local services                           |
| `pnpm run dev:api`       | Start API in watch mode                       |
| `pnpm run dev:worker`    | Start sync worker in watch mode               |
| `pnpm run dev:receiver`  | Start event receiver in watch mode            |
| `pnpm run dev:dashboard` | Start admin dashboard dev server (port 5173)  |
| `pnpm lint`              | Run ESLint across all packages                |
| `pnpm typecheck`         | Run TypeScript typecheck across all packages  |
| `pnpm test`              | Run all tests                                 |
| `pnpm build`             | Build all apps                                |

## Documentation

See `docs/` for the full architecture and implementation spec:

- `docs/01-architecture-overview.md` — System architecture and component catalogue
- `docs/02-tech-stack-and-rationale.md` — Technology choices and rationale
- `docs/10-implementation-roadmap-checklist.md` — Phase-by-phase build checklist

## Repository Layout

```
apps/
  api/        — NestJS REST + WebSocket server
  worker/     — BullMQ sync worker processes
  receiver/   — Device event ingestion endpoint
  dashboard/  — Vite + React admin UI (port 5173)
libs/
  domain/     — Pure domain logic (no I/O)
  drivers/
    core/     — AccessDeviceDriver interface
    hikvision/ — ISAPI implementation
    mock/     — In-memory driver for tests
  persistence/ — Prisma repositories
  queue/      — BullMQ setup and job types
  auth/       — JWT, RBAC, guards
  audit/      — Append-only audit log
  shared/     — Logging, config, errors, utilities
infra/
  compose/    — Docker Compose configs
  docker/     — Dockerfiles
  nginx/      — Nginx configs
prisma/
  schema.prisma — Database schema
```
