# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a monorepo that any engineer can clone and have a running stack within 15 minutes.

**Architecture:** pnpm workspaces monorepo with three apps (`api`, `worker`, `receiver`) sharing code via `libs/`. All tooling (lint, typecheck, format, commit hooks, CI) is wired from day one so the tree is never broken.

**Tech Stack:** Node.js 20 LTS, TypeScript 5 strict, pnpm 9, NestJS, Prisma, BullMQ, Docker Compose, GitHub Actions (or GitLab CI — TBD).

---

## Open Choices (must be answered before execution)

| # | Question | Options | Default if not answered |
|---|----------|---------|------------------------|
| OC-1 | Node version manager | nvm / fnm / volta | fnm (fastest on all OS) |
| OC-2 | License | MIT / ISC / UNLICENSED | UNLICENSED (private) |
| OC-3 | CI host | GitHub Actions / GitLab CI | GitHub Actions |
| OC-4 | Git remote URL | — | (must provide) |
| OC-5 | `make` on Windows | Keep Makefile + WSL / replace with pnpm scripts | Replace with pnpm scripts |

---

## File Map

```
smart-access-middleware/           ← project root
├── .editorconfig
├── .nvmrc                         ← Node pin (or .tool-versions for asdf/mise)
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── commitlint.config.cjs
├── package.json                   ← workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json             ← strict: true base
├── .eslintrc.cjs
├── .prettierrc
├── .husky/
│   ├── pre-commit                 ← lint-staged
│   └── commit-msg                 ← commitlint
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   ├── pull_request_template.md
│   └── workflows/
│       ├── lint.yml
│       ├── typecheck.yml
│       ├── test.yml
│       └── build.yml
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json          ← extends ../../tsconfig.base.json
│   │   └── src/main.ts            ← NestJS bootstrap stub
│   ├── worker/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/main.ts
│   └── receiver/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/main.ts
├── libs/
│   ├── domain/
│   │   ├── package.json
│   │   └── src/index.ts           ← empty barrel
│   ├── drivers/
│   │   ├── core/
│   │   │   ├── package.json
│   │   │   └── src/index.ts
│   │   ├── hikvision/
│   │   │   ├── package.json
│   │   │   └── src/index.ts
│   │   └── mock/
│   │       ├── package.json
│   │       └── src/index.ts
│   ├── persistence/
│   │   ├── package.json
│   │   └── src/index.ts
│   ├── queue/
│   │   ├── package.json
│   │   └── src/index.ts
│   ├── auth/
│   │   ├── package.json
│   │   └── src/index.ts
│   ├── audit/
│   │   ├── package.json
│   │   └── src/index.ts
│   └── shared/
│       ├── package.json
│       └── src/index.ts
├── prisma/
│   └── schema.prisma              ← minimal datasource block only
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.worker
│   │   └── Dockerfile.receiver
│   ├── compose/
│   │   └── docker-compose.dev.yml
│   └── nginx/
│       └── nginx.dev.conf
└── docs/                          ← existing spec files moved here
    └── (01-13 docs)
```

---

## Task 1: Initialize git repo and move docs into `docs/`

**Files:**
- Create: `.gitignore`
- Create: `docs/` (move all *.md spec files here)

- [ ] **Step 1: Initialize git**

```powershell
git init
git checkout -b main
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.env
.env.local
*.local.env
prisma/migrations/**/migration_lock.toml
coverage/
.nyc_output/
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Move spec docs into docs/**

```powershell
New-Item -ItemType Directory -Force docs
Move-Item *.md docs/ -Exclude README.md
```

- [ ] **Step 4: Commit**

```
git add .
git commit -m "chore: initial repo skeleton with docs"
```

---

## Task 2: Root package.json + pnpm workspace

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Write root package.json**

```json
{
  "name": "smart-access-middleware",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "dev:api": "pnpm --filter @sam/api dev",
    "dev:worker": "pnpm --filter @sam/worker dev",
    "dev:receiver": "pnpm --filter @sam/receiver dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint . --ext .ts",
    "lint:fix": "eslint . --ext .ts --fix",
    "format": "prettier --write \"**/*.{ts,json,md,yml}\"",
    "test": "pnpm -r test",
    "dev:up": "docker compose -f infra/compose/docker-compose.dev.yml up -d",
    "dev:down": "docker compose -f infra/compose/docker-compose.dev.yml down"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.0.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.4.0"
  },
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

- [ ] **Step 2: Write pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "libs/*"
  - "libs/drivers/*"
```

- [ ] **Step 3: Install deps**

```
pnpm install
```

- [ ] **Step 4: Commit**

```
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore(workspace): add pnpm workspace root"
```

---

## Task 3: TypeScript base config

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts"]
}
```

- [ ] **Step 2: Verify typecheck runs on empty project**

```
pnpm typecheck
```

Expected: exits 0 (nothing to check yet)

- [ ] **Step 3: Commit**

```
git add tsconfig.base.json
git commit -m "chore(typescript): add strict tsconfig base"
```

---

## Task 4: ESLint + Prettier

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Write .eslintrc.cjs**

```cjs
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.base.json', './apps/*/tsconfig.json', './libs/**/tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    'no-console': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '*.cjs', '*.mjs'],
};
```

- [ ] **Step 2: Write .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: Write .prettierignore**

```
dist/
node_modules/
pnpm-lock.yaml
```

- [ ] **Step 4: Run lint on empty project**

```
pnpm lint
```

Expected: exits 0 (no .ts files yet)

- [ ] **Step 5: Commit**

```
git add .eslintrc.cjs .prettierrc .prettierignore
git commit -m "chore(lint): add ESLint + Prettier config"
```

---

## Task 5: Commitlint + Husky

**Files:**
- Create: `commitlint.config.cjs`
- Create: `.husky/commit-msg`
- Create: `.husky/pre-commit`

- [ ] **Step 1: Write commitlint.config.cjs**

```cjs
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

- [ ] **Step 2: Init Husky**

```
pnpm exec husky init
```

- [ ] **Step 3: Write .husky/commit-msg**

```sh
#!/bin/sh
pnpm exec commitlint --edit "$1"
```

- [ ] **Step 4: Write .husky/pre-commit**

```sh
#!/bin/sh
pnpm exec lint-staged
```

- [ ] **Step 5: Verify hooks are executable (Linux/Mac only; Windows skips chmod)**

```
# On Linux/Mac:
chmod +x .husky/commit-msg .husky/pre-commit
```

- [ ] **Step 6: Test commitlint rejects bad message**

```
echo "bad message" | pnpm exec commitlint
```

Expected: exits 1 with validation errors

- [ ] **Step 7: Commit**

```
git add commitlint.config.cjs .husky/
git commit -m "chore(git): add Husky + commitlint + lint-staged"
```

---

## Task 6: EditorConfig + Node version pin

**Files:**
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `.tool-versions`

- [ ] **Step 1: Write .editorconfig**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 2: Write .nvmrc**

```
20.19.0
```

(Use the latest Node 20 LTS patch. Verify at https://nodejs.org/en/about/previous-releases)

- [ ] **Step 3: Write .tool-versions (for asdf/mise)**

```
nodejs 20.19.0
```

- [ ] **Step 4: Commit**

```
git add .editorconfig .nvmrc .tool-versions
git commit -m "chore(tooling): pin Node 20 LTS + EditorConfig"
```

---

## Task 7: Workspace app stubs (api, worker, receiver)

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/main.ts`
- Create: `apps/receiver/package.json`, `apps/receiver/tsconfig.json`, `apps/receiver/src/main.ts`

- [ ] **Step 1: Create apps/api/package.json**

```json
{
  "name": "@sam/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "ts-node -r tsconfig-paths/register src/main.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.0",
    "tsconfig-paths": "^4.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create apps/api/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@sam/domain": ["../../libs/domain/src"],
      "@sam/shared": ["../../libs/shared/src"],
      "@sam/auth": ["../../libs/auth/src"],
      "@sam/queue": ["../../libs/queue/src"],
      "@sam/persistence": ["../../libs/persistence/src"],
      "@sam/audit": ["../../libs/audit/src"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create apps/api/src/main.ts (NestJS bootstrap stub)**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({})
class AppModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
```

- [ ] **Step 4: Repeat for apps/worker and apps/receiver**

`apps/worker/package.json` — same structure, name `@sam/worker`
`apps/worker/tsconfig.json` — extends `../../tsconfig.base.json`
`apps/worker/src/main.ts`:
```typescript
import 'reflect-metadata';

async function bootstrap(): Promise<void> {
  // BullMQ worker bootstrap (Phase 2)
  process.stdout.write('Worker starting...\n');
}

void bootstrap();
```

`apps/receiver/package.json` — same structure, name `@sam/receiver`
`apps/receiver/tsconfig.json` — extends `../../tsconfig.base.json`
`apps/receiver/src/main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({})
class ReceiverModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ReceiverModule);
  await app.listen(process.env.RECEIVER_PORT ?? 3001);
}

void bootstrap();
```

- [ ] **Step 5: Install workspace deps**

```
pnpm install
```

- [ ] **Step 6: Typecheck all apps**

```
pnpm typecheck
```

Expected: exits 0

- [ ] **Step 7: Commit**

```
git add apps/
git commit -m "chore(apps): add api, worker, receiver stub apps"
```

---

## Task 8: Library stubs (domain, drivers, shared, etc.)

**Files:**
- Create: `libs/domain/src/index.ts`, `libs/domain/package.json`, `libs/domain/tsconfig.json`
- Same pattern for: `libs/shared`, `libs/auth`, `libs/queue`, `libs/persistence`, `libs/audit`, `libs/drivers/core`, `libs/drivers/hikvision`, `libs/drivers/mock`

- [ ] **Step 1: Create each lib's package.json (example: libs/domain/package.json)**

```json
{
  "name": "@sam/domain",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

Repeat for each lib with name `@sam/<lib-name>`. `libs/drivers/core` → `@sam/drivers-core`, `libs/drivers/hikvision` → `@sam/drivers-hikvision`, `libs/drivers/mock` → `@sam/drivers-mock`.

- [ ] **Step 2: Each lib's tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

(For drivers, `"extends": "../../../tsconfig.base.json"` — one extra level)

- [ ] **Step 3: Each lib's src/index.ts**

```typescript
// @sam/<lib-name> — barrel export
```

(Empty barrel — content added in Phase 1+)

- [ ] **Step 4: Install + typecheck**

```
pnpm install
pnpm typecheck
```

Expected: exits 0

- [ ] **Step 5: Commit**

```
git add libs/
git commit -m "chore(libs): add library package stubs"
```

---

## Task 9: Prisma minimal setup

**Files:**
- Create: `prisma/schema.prisma`
- Modify: root `package.json` (add prisma dev dep)

- [ ] **Step 1: Install Prisma**

```
pnpm add -D prisma @prisma/client --filter @sam/persistence
pnpm add -w -D prisma
```

- [ ] **Step 2: Write prisma/schema.prisma**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

(Schema models will be added in Phase 1 — doc 03)

- [ ] **Step 3: Verify prisma format passes**

```
pnpm exec prisma format
```

- [ ] **Step 4: Commit**

```
git add prisma/
git commit -m "chore(prisma): add minimal datasource schema"
```

---

## Task 10: .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Write .env.example**

```env
# ─── App ────────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
RECEIVER_PORT=3001
LOG_LEVEL=info

# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://app:app@localhost:5432/sam

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Auth ────────────────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# ─── Crypto (device password encryption at rest) ─────────────────────────────
DEVICE_SECRET_KEY=base64:change-me-32-bytes-min

# ─── Object Storage ──────────────────────────────────────────────────────────
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=sam-faces
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# ─── Sync Engine ─────────────────────────────────────────────────────────────
SYNC_CONCURRENCY=10
SYNC_MAX_RETRIES=8
SYNC_BACKOFF_MS=5000

# ─── Devices ─────────────────────────────────────────────────────────────────
DEVICE_REQUEST_TIMEOUT_MS=10000
```

- [ ] **Step 2: Confirm .gitignore excludes .env**

Verify `.env` is in `.gitignore` (added in Task 1).

- [ ] **Step 3: Commit**

```
git add .env.example
git commit -m "chore(env): document all environment variables in .env.example"
```

---

## Task 11: Docker Compose (dev)

**Files:**
- Create: `infra/compose/docker-compose.dev.yml`

- [ ] **Step 1: Write docker-compose.dev.yml**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: sam
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d sam"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
  minio_data:
```

- [ ] **Step 2: Bring up the stack**

```
pnpm run dev:up
```

Expected: postgres, redis, minio containers start and healthchecks pass.

- [ ] **Step 3: Verify postgres is reachable**

```powershell
docker exec $(docker ps -q -f name=postgres) psql -U app -d sam -c "\l"
```

Expected: lists databases including `sam`

- [ ] **Step 4: Bring it down**

```
pnpm run dev:down
```

- [ ] **Step 5: Commit**

```
git add infra/
git commit -m "chore(infra): add docker-compose dev stack (postgres, redis, minio)"
```

---

## Task 12: Proxy config stub + Dockerfiles stub

**Files:**
- Create: `infra/nginx/nginx.dev.conf`
- Create: `infra/docker/Dockerfile.api`, `Dockerfile.worker`, `Dockerfile.receiver`

- [ ] **Step 1: Write nginx.dev.conf**

```nginx
events {}

http {
  upstream api {
    server api:3000;
  }

  server {
    listen 80;

    location /api/ {
      proxy_pass http://api/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io/ {
      proxy_pass http://api/socket.io/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
    }
  }
}
```

- [ ] **Step 2: Write Dockerfile.api (multi-stage)**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY libs/*/package.json libs/*/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @sam/api build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Create stubs for Dockerfile.worker and Dockerfile.receiver** (same pattern, different app names)

- [ ] **Step 4: Commit**

```
git add infra/nginx/ infra/docker/
git commit -m "chore(infra): add nginx dev config and Dockerfile stubs"
```

---

## Task 13: Community files (README, CONTRIBUTING, LICENSE, templates)

**Files:**
- Modify: `README.md` (project-facing)
- Create: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Write top-level README.md**

```markdown
# Smart Access Middleware Platform

Vendor-abstraction middleware and synchronization engine for Hikvision (and future multi-vendor) access-control devices.

## Prerequisites

- Node.js 20+ (`fnm use` or `nvm use`)
- pnpm 9+
- Docker + Docker Compose

## Quick Start

```sh
cp .env.example .env
pnpm install
pnpm run dev:up   # start postgres, redis, minio
pnpm run dev:api  # start api in dev mode
```

## Documentation

See `docs/` for the full architecture and implementation spec.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm run dev:up` | Start local services (postgres, redis, minio) |
| `pnpm run dev:down` | Stop local services |
| `pnpm run dev:api` | Start API in watch mode |
| `pnpm run dev:worker` | Start worker in watch mode |
| `pnpm run dev:receiver` | Start receiver in watch mode |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript typecheck |
| `pnpm test` | Run all tests |
| `pnpm build` | Build all apps |
```

- [ ] **Step 2: Write CONTRIBUTING.md** (one page: branch convention, commit format, PR checklist)

- [ ] **Step 3: Write CODE_OF_CONDUCT.md** (Contributor Covenant 2.1 standard text)

- [ ] **Step 4: Write LICENSE** (UNLICENSED for private, or MIT — per OC-2)

- [ ] **Step 5: Write .github/pull_request_template.md**

```markdown
## What changed

## Why

## How verified

- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green
- [ ] Docs updated if behavior changed

## Relevant doc section

[link to docs/NN-*.md section]
```

- [ ] **Step 6: Write bug_report.yml and feature_request.yml** (standard GitHub issue form templates)

- [ ] **Step 7: Commit**

```
git add README.md CONTRIBUTING.md CODE_OF_CONDUCT.md LICENSE .github/
git commit -m "chore(docs): add community files and GitHub templates"
```

---

## Task 14: CI workflows (GitHub Actions)

**Files:**
- Create: `.github/workflows/lint.yml`
- Create: `.github/workflows/typecheck.yml`
- Create: `.github/workflows/test.yml`
- Create: `.github/workflows/build.yml`

- [ ] **Step 1: Write lint.yml**

```yaml
name: Lint

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
```

- [ ] **Step 2: Write typecheck.yml**

```yaml
name: Typecheck

on:
  push:
    branches: [main]
  pull_request:

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
```

- [ ] **Step 3: Write test.yml**

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: app
          POSTGRES_DB: sam
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://app:app@localhost:5432/sam
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

- [ ] **Step 4: Write build.yml**

```yaml
name: Build

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

- [ ] **Step 5: Commit**

```
git add .github/workflows/
git commit -m "ci: add lint, typecheck, test, build workflows"
```

---

## Task 15: Phase 0 acceptance verification

- [ ] **Step 1: Clone the repo fresh (simulate new engineer)**

```powershell
cd ..
git clone <repo-url> sam-test
cd sam-test
```

- [ ] **Step 2: Run dev:up**

```
cp .env.example .env
pnpm install
pnpm run dev:up
```

Expected: all three containers healthy within 60 seconds.

- [ ] **Step 3: Verify typecheck, lint, test all pass**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all exits 0.

- [ ] **Step 4: Verify commit hook rejects bad commit**

```
git commit -m "bad message"
```

Expected: commit rejected by commitlint.

- [ ] **Step 5: Tag Phase 0 complete**

```
git tag v0.0.0-phase0
git push origin main --tags
```

---

## Self-Review Against Phase 0 Spec

| Spec item (doc 10 §Phase 0) | Task |
|-----------------------------|------|
| Initialize monorepo (pnpm workspaces) | Task 2 |
| ESLint + Prettier + commitlint + Husky | Tasks 4, 5 |
| TypeScript strict: true | Task 3 |
| EditorConfig, .nvmrc, .tool-versions | Task 6 |
| README, CONTRIBUTING, CODE_OF_CONDUCT | Task 13 |
| License file | Task 13 |
| Issue & PR templates | Task 13 |
| docker-compose.dev.yml | Task 11 |
| pnpm dev:up / dev:down / test scripts | Tasks 2, 11 |
| .env.example with every variable | Task 10 |
| Lint CI job | Task 14 |
| Typecheck CI job | Task 14 |
| Unit test CI job | Task 14 |
| Build CI job | Task 14 |
| Required-checks branch protection | (manual GitHub setting — flagged as OC-6) |

**OC-6 gap:** Branch protection rules on `main` must be set in the GitHub repo settings UI (or via GitHub CLI) — not automatable from the repo. Must be done after first push.
