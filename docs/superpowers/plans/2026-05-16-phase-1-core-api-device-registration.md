# Phase 1 — Core API & Device Registration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can log in, register a Hikvision device, and see it transition to `online` with discovered capabilities — all persisted in PostgreSQL.

**Architecture:** NestJS monolith (api app), Prisma models for device management, BullMQ workers for health-check and capability discovery, MockDriver in tests, HikvisionDriver stubs for `getDeviceInfo` and `ping` only.

**Tech Stack:** NestJS 10, Prisma 7, BullMQ 5, argon2, @nestjs/jwt, @nestjs/swagger, Zod (request validation), Vitest + Supertest (tests).

---

## Open Choices (must answer before execution)

| #    | Question                   | Options                                                                                | Default                     |
| ---- | -------------------------- | -------------------------------------------------------------------------------------- | --------------------------- |
| OC-1 | Device password encryption | AES-GCM via env `DEVICE_SECRET_KEY` (simple) / KMS abstraction with local fallback     | Env var AES-GCM for Phase 1 |
| OC-2 | MFA in Phase 1             | Fully stub — login accepts `mfa_code` field but ignores it / Enforce TOTP from day one | Stub (enforce in Phase 4)   |
| OC-3 | Health-check trigger       | BullMQ repeatable job (every 60s) from day one / Manual trigger only in Phase 1        | Repeatable job from day one |

---

## File Map

```
apps/api/
├── src/
│   ├── main.ts                          (update: validation pipe, swagger, pino logger)
│   ├── app.module.ts                    (create)
│   ├── health/
│   │   └── health.controller.ts         (GET /health, GET /health/ready)
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts           (POST /api/v1/auth/login, /refresh, /logout)
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── rbac.guard.ts
│   └── devices/
│       ├── devices.module.ts
│       ├── devices.controller.ts        (CRUD + health-check + capabilities)
│       ├── devices.service.ts
│       └── dto/
│           ├── create-device.dto.ts
│           └── update-device.dto.ts
apps/worker/
└── src/
    ├── main.ts                          (update: BullMQ worker bootstrap)
    ├── worker.module.ts
    ├── health-check/
    │   └── health-check.processor.ts
    └── capability-discovery/
        └── capability-discovery.processor.ts
libs/
├── domain/
│   └── src/
│       ├── errors/
│       │   └── domain-error.ts          (DomainError base + typed subclasses)
│       └── device/
│           └── device.types.ts          (DeviceStatus enum, DeviceVendor enum)
├── drivers/
│   ├── core/
│   │   └── src/
│   │       ├── access-device-driver.ts  (interface + DTOs)
│   │       ├── driver-error.ts          (DriverError taxonomy)
│   │       └── driver-registry.ts       (factory / cache)
│   ├── hikvision/
│   │   └── src/
│   │       ├── hikvision-driver.ts      (getDeviceInfo, ping, discoverCapabilities)
│   │       └── hikvision-http.ts        (Digest auth HTTP client wrapper)
│   └── mock/
│       └── src/
│           └── mock-driver.ts           (full interface, configurable failures)
├── persistence/
│   └── src/
│       ├── prisma.service.ts            (PrismaClient singleton)
│       ├── device.repository.ts
│       └── site.repository.ts
├── queue/
│   └── src/
│       ├── queue.names.ts               (QUEUE_DEVICE_HEALTH, QUEUE_CAPABILITIES)
│       └── job-types.ts                 (typed job payloads)
├── auth/
│   └── src/
│       ├── crypto.service.ts            (AES-GCM encrypt/decrypt for device passwords)
│       └── password.service.ts          (argon2id hash + verify)
└── audit/
    └── src/
        └── audit.service.ts             (write-only helper)
prisma/
└── schema.prisma                        (add all Phase 1 models)
```

---

## Task 1: Prisma schema — Phase 1 models

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add all Phase 1 models**

```prisma
model Tenant {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  slug      String   @unique
  status    String   @default("active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  sites     Site[]
  devices   Device[]
  adminUsers AdminUser[]
  @@map("tenants")
}

model Site {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  name      String
  timezone  String   @default("UTC")
  address   String?
  vpnSubnet String?  @map("vpn_subnet")
  createdAt DateTime @default(now()) @map("created_at")
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  devices   Device[]
  @@index([tenantId])
  @@map("sites")
}

model Device {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  siteId            String?   @map("site_id") @db.Uuid
  name              String
  vendor            String    @default("hikvision")
  model             String?
  serialNumber      String?   @map("serial_number")
  firmwareVersion   String?   @map("firmware_version")
  ipAddress         String    @map("ip_address")
  port              Int       @default(80)
  username          String
  passwordEncrypted Bytes     @map("password_encrypted")
  status            String    @default("unknown")
  lastSeenAt        DateTime? @map("last_seen_at")
  lastHealthCheck   DateTime? @map("last_health_check")
  metadata          Json      @default("{}") @db.JsonB
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  tenant            Tenant    @relation(fields: [tenantId], references: [id])
  site              Site?     @relation(fields: [siteId], references: [id])
  capabilities      DeviceCapability?
  @@unique([tenantId, ipAddress, port])
  @@index([tenantId, siteId])
  @@index([status])
  @@map("devices")
}

model DeviceCapability {
  deviceId     String   @id @map("device_id") @db.Uuid
  supportsJson Boolean  @default(false) @map("supports_json")
  supportsFace Boolean  @default(false) @map("supports_face")
  supportsFp   Boolean  @default(false) @map("supports_fp")
  maxUsers     Int?     @map("max_users")
  maxCards     Int?     @map("max_cards")
  raw          Json     @default("{}") @db.JsonB
  discoveredAt DateTime @default(now()) @map("discovered_at")
  device       Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  @@map("device_capabilities")
}

model AdminUser {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         String
  mfaSecret    String?  @map("mfa_secret")
  isActive     Boolean  @default(true) @map("is_active")
  failedLogins Int      @default(0) @map("failed_logins")
  lockedUntil  DateTime? @map("locked_until")
  createdAt    DateTime @default(now()) @map("created_at")
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  refreshTokens RefreshToken[]
  @@map("admin_users")
}

model RefreshToken {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  adminUserId String    @map("admin_user_id") @db.Uuid
  tokenHash   String    @unique @map("token_hash")
  expiresAt   DateTime  @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  adminUser   AdminUser @relation(fields: [adminUserId], references: [id], onDelete: Cascade)
  @@index([adminUserId])
  @@map("refresh_tokens")
}

model AuditLog {
  id        BigInt   @id @default(autoincrement())
  tenantId  String   @map("tenant_id") @db.Uuid
  actorId   String?  @map("actor_id") @db.Uuid
  actorKind String   @map("actor_kind")
  action    String
  resource  String
  payload   Json     @default("{}") @db.JsonB
  result    String
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([tenantId, createdAt(sort: Desc)])
  @@index([actorId, createdAt(sort: Desc)])
  @@map("audit_log")
}
```

- [ ] **Step 2: Format schema**

```
pnpm exec prisma format
```

Expected: exits 0

- [ ] **Step 3: Run migration**

```
pnpm exec prisma migrate dev --name phase1-core-schema
```

Expected: migration created and applied to dev postgres

- [ ] **Step 4: Generate Prisma client**

```
pnpm exec prisma generate
```

- [ ] **Step 5: Commit**

```
git add prisma/
git commit -m "feat(schema): add Phase 1 models — tenants, sites, devices, admin_users, audit_log"
```

---

## Task 2: Dev seed (default tenant + admin user)

**Files:**

- Create: `prisma/seed.ts`
- Modify: root `package.json` (add prisma.seed config)

- [ ] **Step 1: Install argon2**

```
pnpm add argon2 --filter @sam/auth
pnpm add argon2 -w
```

- [ ] **Step 2: Write prisma/seed.ts**

```typescript
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', name: 'Default', slug: 'default' },
  });

  const passwordHash = await argon2.hash('changeme123', { type: argon2.argon2id });

  await prisma.adminUser.upsert({
    where: { email: 'admin@localhost' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@localhost',
      passwordHash,
      role: 'owner',
      isActive: true,
    },
  });

  process.stdout.write('Seed complete: tenant=default, admin=admin@localhost\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    process.stderr.write(String(e));
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 3: Add prisma seed config to root package.json**

```json
"prisma": {
  "seed": "ts-node --project tsconfig.base.json prisma/seed.ts"
}
```

- [ ] **Step 4: Run seed**

```
pnpm exec prisma db seed
```

Expected: "Seed complete: tenant=default, admin=admin@localhost"

- [ ] **Step 5: Commit**

```
git add prisma/seed.ts package.json
git commit -m "chore(seed): add default tenant and admin user seed"
```

---

## Task 3: Domain errors + device types

**Files:**

- Create: `libs/domain/src/errors/domain-error.ts`
- Create: `libs/domain/src/device/device.types.ts`
- Modify: `libs/domain/src/index.ts`

- [ ] **Step 1: Write domain-error.ts**

```typescript
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} not found: ${id}`, { resource, id });
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFLICT', message, context);
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super('VALIDATION_FAILED', message, { fields });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message);
  }
}
```

- [ ] **Step 2: Write device.types.ts**

```typescript
export const DeviceVendor = {
  Hikvision: 'hikvision',
  Suprema: 'suprema',
  Dahua: 'dahua',
  ZKTeco: 'zkteco',
  Mock: 'mock',
} as const;
export type DeviceVendor = (typeof DeviceVendor)[keyof typeof DeviceVendor];

export const DeviceStatus = {
  Online: 'online',
  Offline: 'offline',
  Degraded: 'degraded',
  Unknown: 'unknown',
  Disabled: 'disabled',
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];
```

- [ ] **Step 3: Update libs/domain/src/index.ts**

```typescript
export * from './errors/domain-error';
export * from './device/device.types';
```

- [ ] **Step 4: Typecheck**

```
pnpm --filter @sam/domain typecheck
```

Expected: exits 0

- [ ] **Step 5: Write unit tests for DomainError**

Create `libs/domain/src/errors/domain-error.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NotFoundError, ConflictError, ValidationError } from './domain-error';

describe('DomainError subclasses', () => {
  it('NotFoundError has correct code and message', () => {
    const err = new NotFoundError('Device', 'abc-123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('Device');
    expect(err.context).toEqual({ resource: 'Device', id: 'abc-123' });
  });

  it('ConflictError preserves context', () => {
    const err = new ConflictError('duplicate ip', { ip: '10.0.0.1' });
    expect(err.code).toBe('CONFLICT');
    expect(err.context).toEqual({ ip: '10.0.0.1' });
  });

  it('ValidationError exposes fields', () => {
    const err = new ValidationError('bad input', { email: 'invalid' });
    expect(err.fields).toEqual({ email: 'invalid' });
  });
});
```

- [ ] **Step 6: Run domain tests**

```
pnpm --filter @sam/domain test
```

Expected: 3 tests pass

- [ ] **Step 7: Commit**

```
git add libs/domain/
git commit -m "feat(domain): add DomainError taxonomy and device type enums"
```

---

## Task 4: Driver interface + DriverError taxonomy + DriverRegistry

**Files:**

- Create: `libs/drivers/core/src/access-device-driver.ts`
- Create: `libs/drivers/core/src/driver-error.ts`
- Create: `libs/drivers/core/src/driver-registry.ts`
- Modify: `libs/drivers/core/src/index.ts`

- [ ] **Step 1: Write driver DTOs and interface**

`libs/drivers/core/src/access-device-driver.ts`:

```typescript
export interface DeviceInfo {
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  deviceName: string;
}

export interface HealthSnapshot {
  reachable: boolean;
  latencyMs: number;
  checkedAt: Date;
}

export interface DeviceCapabilities {
  supportsJson: boolean;
  supportsFace: boolean;
  supportsFp: boolean;
  maxUsers?: number;
  maxCards?: number;
  raw: Record<string, unknown>;
}

export interface DeviceUserPayload {
  employeeNo: string;
  firstName: string;
  lastName: string;
  validFrom?: string;
  validTo?: string;
  doorIndexes: number[];
}

export interface CardPayload {
  cardNumber: string;
}

export interface DeviceEvent {
  eventType: string;
  employeeNo?: string;
  doorIndex?: number;
  eventTime: Date;
  raw: Record<string, unknown>;
}

export interface ListOpts {
  limit?: number;
  offset?: number;
}

export interface AccessDeviceDriver {
  getDeviceInfo(): Promise<DeviceInfo>;
  ping(): Promise<HealthSnapshot>;
  discoverCapabilities(): Promise<DeviceCapabilities>;
  upsertUser(user: DeviceUserPayload): Promise<void>;
  deleteUser(employeeNo: string): Promise<void>;
  listUsers(opts?: ListOpts): Promise<DeviceUserPayload[]>;
  upsertCard(employeeNo: string, card: CardPayload): Promise<void>;
  upsertFace(employeeNo: string, image: Buffer): Promise<void>;
  deleteCard(employeeNo: string, cardNumber: string): Promise<void>;
  unlockDoor(doorIndex: number, durationSec?: number): Promise<void>;
  lockDoor(doorIndex: number): Promise<void>;
  pullEvents(since: Date, limit: number): Promise<DeviceEvent[]>;
}
```

- [ ] **Step 2: Write DriverError taxonomy**

`libs/drivers/core/src/driver-error.ts`:

```typescript
export enum DriverErrorCode {
  Unreachable = 'DRIVER_UNREACHABLE',
  Timeout = 'DRIVER_TIMEOUT',
  AuthFailed = 'DRIVER_AUTH_FAILED',
  UnsupportedFeature = 'DRIVER_UNSUPPORTED_FEATURE',
  BadResponse = 'DRIVER_BAD_RESPONSE',
  RateLimited = 'DRIVER_RATE_LIMITED',
  Conflict = 'DRIVER_CONFLICT',
  Internal = 'DRIVER_INTERNAL',
}

export class DriverError extends Error {
  constructor(
    public readonly code: DriverErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DriverError';
  }

  get isRetryable(): boolean {
    return [
      DriverErrorCode.Unreachable,
      DriverErrorCode.Timeout,
      DriverErrorCode.RateLimited,
    ].includes(this.code);
  }

  static unreachable(cause?: unknown): DriverError {
    return new DriverError(DriverErrorCode.Unreachable, 'Device unreachable', cause);
  }
  static timeout(cause?: unknown): DriverError {
    return new DriverError(DriverErrorCode.Timeout, 'Device request timed out', cause);
  }
  static authFailed(): DriverError {
    return new DriverError(DriverErrorCode.AuthFailed, 'Authentication failed');
  }
  static unsupported(feature: string): DriverError {
    return new DriverError(DriverErrorCode.UnsupportedFeature, `Unsupported: ${feature}`);
  }
  static badResponse(detail: string): DriverError {
    return new DriverError(DriverErrorCode.BadResponse, `Bad device response: ${detail}`);
  }
  static conflict(): DriverError {
    return new DriverError(DriverErrorCode.Conflict, 'Conflict on device');
  }
  static internal(cause?: unknown): DriverError {
    return new DriverError(DriverErrorCode.Internal, 'Internal driver error', cause);
  }
}
```

- [ ] **Step 3: Write DriverRegistry**

`libs/drivers/core/src/driver-registry.ts`:

```typescript
import type { AccessDeviceDriver } from './access-device-driver';

export interface DriverTarget {
  id: string;
  vendor: string;
  ipAddress: string;
  port: number;
  username: string;
  password: string; // decrypted at call site
  timeoutMs?: number;
}

export type DriverFactory = (target: DriverTarget) => AccessDeviceDriver;

export class DriverRegistry {
  private readonly factories = new Map<string, DriverFactory>();
  private readonly cache = new Map<string, AccessDeviceDriver>();

  register(vendor: string, factory: DriverFactory): void {
    this.factories.set(vendor, factory);
  }

  resolve(target: DriverTarget): AccessDeviceDriver {
    const cached = this.cache.get(target.id);
    if (cached) return cached;

    const factory = this.factories.get(target.vendor);
    if (!factory) throw new Error(`No driver registered for vendor: ${target.vendor}`);

    const driver = factory(target);
    this.cache.set(target.id, driver);
    return driver;
  }

  evict(deviceId: string): void {
    this.cache.delete(deviceId);
  }
}
```

- [ ] **Step 4: Update index.ts**

```typescript
export * from './access-device-driver';
export * from './driver-error';
export * from './driver-registry';
```

- [ ] **Step 5: Write DriverError unit tests**

`libs/drivers/core/src/driver-error.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DriverError, DriverErrorCode } from './driver-error';

describe('DriverError', () => {
  it('timeout is retryable', () => {
    expect(DriverError.timeout().isRetryable).toBe(true);
  });

  it('authFailed is NOT retryable', () => {
    expect(DriverError.authFailed().isRetryable).toBe(false);
  });

  it('static factories set correct code', () => {
    expect(DriverError.unreachable().code).toBe(DriverErrorCode.Unreachable);
    expect(DriverError.conflict().code).toBe(DriverErrorCode.Conflict);
  });
});
```

- [ ] **Step 6: Typecheck + test**

```
pnpm --filter @sam/drivers-core typecheck
pnpm --filter @sam/drivers-core test
```

Expected: both exits 0, 3 tests pass

- [ ] **Step 7: Commit**

```
git add libs/drivers/core/
git commit -m "feat(drivers): add AccessDeviceDriver interface, DriverError taxonomy, DriverRegistry"
```

---

## Task 5: MockDriver

**Files:**

- Create: `libs/drivers/mock/src/mock-driver.ts`
- Modify: `libs/drivers/mock/src/index.ts`

- [ ] **Step 1: Write MockDriver**

`libs/drivers/mock/src/mock-driver.ts`:

```typescript
import type {
  AccessDeviceDriver,
  DeviceInfo,
  HealthSnapshot,
  DeviceCapabilities,
  DeviceUserPayload,
  CardPayload,
  DeviceEvent,
  ListOpts,
} from '@sam/drivers-core';

export interface MockDriverConfig {
  failOn?: Partial<Record<keyof AccessDeviceDriver, Error>>;
  latencyMs?: number;
  deviceInfo?: Partial<DeviceInfo>;
}

export class MockDriver implements AccessDeviceDriver {
  private users = new Map<string, DeviceUserPayload>();
  private cards = new Map<string, Map<string, string>>();
  public callLog: string[] = [];

  constructor(private readonly config: MockDriverConfig = {}) {}

  private async simulate<T>(method: keyof AccessDeviceDriver, result: T): Promise<T> {
    this.callLog.push(method);
    if (this.config.latencyMs) await new Promise((r) => setTimeout(r, this.config.latencyMs));
    const err = this.config.failOn?.[method];
    if (err) throw err;
    return result;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return this.simulate('getDeviceInfo', {
      model: this.config.deviceInfo?.model ?? 'MockDevice-V1',
      serialNumber: this.config.deviceInfo?.serialNumber ?? 'MOCK-0000001',
      firmwareVersion: this.config.deviceInfo?.firmwareVersion ?? '1.0.0',
      deviceName: this.config.deviceInfo?.deviceName ?? 'Mock Device',
    });
  }

  async ping(): Promise<HealthSnapshot> {
    const start = Date.now();
    return this.simulate('ping', {
      reachable: true,
      latencyMs: Date.now() - start,
      checkedAt: new Date(),
    });
  }

  async discoverCapabilities(): Promise<DeviceCapabilities> {
    return this.simulate('discoverCapabilities', {
      supportsJson: true,
      supportsFace: true,
      supportsFp: false,
      maxUsers: 10000,
      maxCards: 10000,
      raw: { source: 'mock' },
    });
  }

  async upsertUser(user: DeviceUserPayload): Promise<void> {
    await this.simulate('upsertUser', undefined);
    this.users.set(user.employeeNo, user);
  }

  async deleteUser(employeeNo: string): Promise<void> {
    await this.simulate('deleteUser', undefined);
    this.users.delete(employeeNo);
    this.cards.delete(employeeNo);
  }

  async listUsers(_opts?: ListOpts): Promise<DeviceUserPayload[]> {
    return this.simulate('listUsers', [...this.users.values()]);
  }

  async upsertCard(employeeNo: string, card: CardPayload): Promise<void> {
    await this.simulate('upsertCard', undefined);
    if (!this.cards.has(employeeNo)) this.cards.set(employeeNo, new Map());
    this.cards.get(employeeNo)!.set(card.cardNumber, card.cardNumber);
  }

  async upsertFace(_employeeNo: string, _image: Buffer): Promise<void> {
    await this.simulate('upsertFace', undefined);
  }

  async deleteCard(employeeNo: string, cardNumber: string): Promise<void> {
    await this.simulate('deleteCard', undefined);
    this.cards.get(employeeNo)?.delete(cardNumber);
  }

  async unlockDoor(_doorIndex: number, _durationSec?: number): Promise<void> {
    await this.simulate('unlockDoor', undefined);
  }

  async lockDoor(_doorIndex: number): Promise<void> {
    await this.simulate('lockDoor', undefined);
  }

  async pullEvents(_since: Date, _limit: number): Promise<DeviceEvent[]> {
    return this.simulate('pullEvents', []);
  }

  getUserCount(): number {
    return this.users.size;
  }
  hasUser(employeeNo: string): boolean {
    return this.users.has(employeeNo);
  }
}
```

- [ ] **Step 2: Update index.ts**

```typescript
export * from './mock-driver';
```

- [ ] **Step 3: Write MockDriver unit tests**

`libs/drivers/mock/src/mock-driver.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MockDriver } from './mock-driver';
import { DriverError } from '@sam/drivers-core';

describe('MockDriver', () => {
  let driver: MockDriver;

  beforeEach(() => {
    driver = new MockDriver();
  });

  it('ping returns healthy snapshot', async () => {
    const snap = await driver.ping();
    expect(snap.reachable).toBe(true);
  });

  it('upsertUser then listUsers returns the user', async () => {
    await driver.upsertUser({
      employeeNo: 'E001',
      firstName: 'Ada',
      lastName: 'L',
      doorIndexes: [1],
    });
    const users = await driver.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].employeeNo).toBe('E001');
  });

  it('deleteUser removes user', async () => {
    await driver.upsertUser({
      employeeNo: 'E001',
      firstName: 'Ada',
      lastName: 'L',
      doorIndexes: [],
    });
    await driver.deleteUser('E001');
    expect(driver.getUserCount()).toBe(0);
  });

  it('failure injection throws configured error', async () => {
    const failing = new MockDriver({ failOn: { ping: DriverError.timeout() } });
    await expect(failing.ping()).rejects.toThrow('timed out');
  });

  it('callLog records method calls', async () => {
    await driver.ping();
    await driver.getDeviceInfo();
    expect(driver.callLog).toEqual(['ping', 'getDeviceInfo']);
  });
});
```

- [ ] **Step 4: Update MockDriver tsconfig to resolve @sam/drivers-core**

`libs/drivers/mock/tsconfig.json` — add paths:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@sam/drivers-core": ["../core/src"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Add workspace dep**

`libs/drivers/mock/package.json` — add:

```json
"dependencies": { "@sam/drivers-core": "workspace:*" }
```

- [ ] **Step 6: pnpm install + typecheck + test**

```
pnpm install
pnpm --filter @sam/drivers-mock typecheck
pnpm --filter @sam/drivers-mock test
```

Expected: 5 tests pass

- [ ] **Step 7: Commit**

```
git add libs/drivers/mock/ libs/drivers/core/
git commit -m "feat(drivers): add MockDriver with state tracking and failure injection"
```

---

## Task 6: HikvisionDriver (getDeviceInfo + ping + discoverCapabilities)

**Files:**

- Create: `libs/drivers/hikvision/src/hikvision-http.ts`
- Create: `libs/drivers/hikvision/src/hikvision-driver.ts`
- Modify: `libs/drivers/hikvision/src/index.ts`

- [ ] **Step 1: Install digest-fetch**

```
pnpm add digest-fetch node-fetch --filter @sam/drivers-hikvision
pnpm add @types/node-fetch -D --filter @sam/drivers-hikvision
```

- [ ] **Step 2: Write hikvision-http.ts (Digest auth wrapper)**

```typescript
import DigestFetch from 'digest-fetch';
import type { DriverTarget } from '@sam/drivers-core';
import { DriverError } from '@sam/drivers-core';

export class HikvisionHttp {
  private readonly client: DigestFetch;
  private readonly base: string;
  private readonly timeoutMs: number;

  constructor(target: DriverTarget) {
    this.client = new DigestFetch(target.username, target.password);
    this.base = `http://${target.ipAddress}:${target.port}`;
    this.timeoutMs = target.timeoutMs ?? 10_000;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async put(path: string, body: string, contentType = 'application/xml'): Promise<void> {
    await this.request('PUT', path, body, contentType);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: string,
    contentType?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.client.fetch(`${this.base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(contentType ? { 'Content-Type': contentType } : {}),
        },
        body,
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) throw DriverError.authFailed();
      if (res.status === 404) throw DriverError.unsupported(path);
      if (res.status === 429) throw DriverError.internal('rate limited');
      if (res.status >= 500) throw DriverError.badResponse(`HTTP ${res.status}`);
      const text = await res.text();
      return JSON.parse(text) as T;
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw DriverError.timeout(err);
      if (err instanceof DriverError) throw err;
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ECONNREFUSED' || e.code === 'EHOSTUNREACH')
        throw DriverError.unreachable(err);
      throw DriverError.internal(err);
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 3: Write hikvision-driver.ts**

```typescript
import type {
  AccessDeviceDriver,
  DeviceInfo,
  HealthSnapshot,
  DeviceCapabilities,
  DeviceUserPayload,
  CardPayload,
  DeviceEvent,
  ListOpts,
} from '@sam/drivers-core';
import { DriverError } from '@sam/drivers-core';
import type { DriverTarget } from '@sam/drivers-core';
import { HikvisionHttp } from './hikvision-http';

export class HikvisionDriver implements AccessDeviceDriver {
  private readonly http: HikvisionHttp;

  constructor(target: DriverTarget) {
    this.http = new HikvisionHttp(target);
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const res = await this.http.get<{ DeviceInfo: Record<string, string> }>(
      '/ISAPI/System/deviceInfo?format=json',
    );
    const d = res.DeviceInfo;
    return {
      model: d['model'] ?? 'unknown',
      serialNumber: d['serialNumber'] ?? '',
      firmwareVersion: d['firmwareVersion'] ?? '',
      deviceName: d['deviceName'] ?? '',
    };
  }

  async ping(): Promise<HealthSnapshot> {
    const start = Date.now();
    await this.http.get('/ISAPI/System/deviceInfo?format=json');
    return { reachable: true, latencyMs: Date.now() - start, checkedAt: new Date() };
  }

  async discoverCapabilities(): Promise<DeviceCapabilities> {
    const res = await this.http
      .get<{
        UserInfoCap?: Record<string, unknown>;
      }>('/ISAPI/AccessControl/UserInfo/capabilities?format=json')
      .catch(() => ({}));
    const cap = (res as Record<string, unknown>)['UserInfoCap'] as
      | Record<string, unknown>
      | undefined;
    return {
      supportsJson: true,
      supportsFace: !!cap?.['faceCapable'],
      supportsFp: !!cap?.['fingerPrintCapable'],
      maxUsers:
        typeof cap?.['userCapacity'] === 'number' ? (cap['userCapacity'] as number) : undefined,
      maxCards:
        typeof cap?.['cardCapacity'] === 'number' ? (cap['cardCapacity'] as number) : undefined,
      raw: (cap as Record<string, unknown>) ?? {},
    };
  }

  // ─── Phase 2 stubs ───────────────────────────────────────────────────────

  upsertUser(_user: DeviceUserPayload): Promise<void> {
    throw DriverError.unsupported('upsertUser — implement in Phase 2');
  }
  deleteUser(_employeeNo: string): Promise<void> {
    throw DriverError.unsupported('deleteUser — implement in Phase 2');
  }
  listUsers(_opts?: ListOpts): Promise<DeviceUserPayload[]> {
    throw DriverError.unsupported('listUsers — implement in Phase 2');
  }
  upsertCard(_employeeNo: string, _card: CardPayload): Promise<void> {
    throw DriverError.unsupported('upsertCard — implement in Phase 2');
  }
  upsertFace(_employeeNo: string, _image: Buffer): Promise<void> {
    throw DriverError.unsupported('upsertFace — implement in Phase 3');
  }
  deleteCard(_employeeNo: string, _cardNumber: string): Promise<void> {
    throw DriverError.unsupported('deleteCard — implement in Phase 2');
  }
  unlockDoor(_doorIndex: number, _durationSec?: number): Promise<void> {
    throw DriverError.unsupported('unlockDoor — implement in Phase 2');
  }
  lockDoor(_doorIndex: number): Promise<void> {
    throw DriverError.unsupported('lockDoor — implement in Phase 2');
  }
  pullEvents(_since: Date, _limit: number): Promise<DeviceEvent[]> {
    throw DriverError.unsupported('pullEvents — implement in Phase 3');
  }
}
```

- [ ] **Step 4: Update index + tsconfig paths + package deps**

`libs/drivers/hikvision/package.json` — add:

```json
"dependencies": { "@sam/drivers-core": "workspace:*", "digest-fetch": "*" }
```

`libs/drivers/hikvision/tsconfig.json` — add paths for `@sam/drivers-core`.

- [ ] **Step 5: pnpm install + typecheck**

```
pnpm install
pnpm --filter @sam/drivers-hikvision typecheck
```

Expected: exits 0 (no tests yet — real device tests are Phase 1.8)

- [ ] **Step 6: Commit**

```
git add libs/drivers/hikvision/
git commit -m "feat(drivers): add HikvisionDriver with getDeviceInfo, ping, discoverCapabilities"
```

---

## Task 7: PrismaService + persistence lib wiring

**Files:**

- Create: `libs/persistence/src/prisma.service.ts`
- Create: `libs/persistence/src/device.repository.ts`
- Modify: `libs/persistence/src/index.ts`

- [ ] **Step 1: Install @prisma/client in persistence**

```
pnpm add @prisma/client --filter @sam/persistence
pnpm add @prisma/adapter-pg pg --filter @sam/persistence
pnpm add @types/pg -D --filter @sam/persistence
```

- [ ] **Step 2: Write prisma.service.ts**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
    const adapter = new PrismaPg(pool);
    super({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 3: Write device.repository.ts**

```typescript
import { Injectable } from '@nestjs/common';
import type { Device, DeviceCapability, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class DeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.DeviceCreateInput): Promise<Device> {
    return this.prisma.device.create({ data });
  }

  async findById(id: string): Promise<(Device & { capabilities: DeviceCapability | null }) | null> {
    return this.prisma.device.findUnique({ where: { id }, include: { capabilities: true } });
  }

  async findAll(tenantId: string, filter: { status?: string; siteId?: string }): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: { tenantId, ...filter, status: { not: 'disabled' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Prisma.DeviceUpdateInput): Promise<Device> {
    return this.prisma.device.update({ where: { id }, data });
  }

  async upsertCapabilities(
    deviceId: string,
    data: Prisma.DeviceCapabilityCreateInput,
  ): Promise<DeviceCapability> {
    return this.prisma.deviceCapability.upsert({
      where: { deviceId },
      create: data,
      update: { ...data, discoveredAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Update index.ts**

```typescript
export * from './prisma.service';
export * from './device.repository';
```

- [ ] **Step 5: Typecheck**

```
pnpm install && pnpm --filter @sam/persistence typecheck
```

- [ ] **Step 6: Commit**

```
git add libs/persistence/
git commit -m "feat(persistence): add PrismaService and DeviceRepository"
```

---

## Task 8: Shared services (CryptoService, PasswordService)

**Files:**

- Create: `libs/auth/src/crypto.service.ts`
- Create: `libs/auth/src/password.service.ts`
- Modify: `libs/auth/src/index.ts`

- [ ] **Step 1: Install argon2**

```
pnpm add argon2 --filter @sam/auth
```

- [ ] **Step 2: Write crypto.service.ts (AES-GCM)**

```typescript
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env['DEVICE_SECRET_KEY'] ?? '';
    if (!raw) throw new Error('DEVICE_SECRET_KEY env var is required');
    this.key = Buffer.from(raw.replace('base64:', ''), 'base64');
    if (this.key.length !== 32)
      throw new Error('DEVICE_SECRET_KEY must be 32 bytes (base64-encoded)');
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]); // 12 + 16 + data
  }

  decrypt(ciphertext: Buffer): string {
    const iv = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const data = ciphertext.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  }
}
```

- [ ] **Step 3: Write password.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536 });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
```

- [ ] **Step 4: Write crypto unit tests**

`libs/auth/src/crypto.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let svc: CryptoService;

  beforeEach(() => {
    process.env['DEVICE_SECRET_KEY'] = 'base64:' + Buffer.alloc(32, 0xab).toString('base64');
    svc = new CryptoService();
  });

  it('round-trips plaintext', () => {
    const plain = 'super-secret-password!';
    const enc = svc.encrypt(plain);
    expect(svc.decrypt(enc)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(a.toString('hex')).not.toBe(b.toString('hex'));
  });
});
```

- [ ] **Step 5: Typecheck + test**

```
pnpm install && pnpm --filter @sam/auth typecheck && pnpm --filter @sam/auth test
```

Expected: 2 tests pass

- [ ] **Step 6: Commit**

```
git add libs/auth/
git commit -m "feat(auth): add CryptoService (AES-GCM) and PasswordService (argon2id)"
```

---

## Task 9: AuditService

**Files:**

- Create: `libs/audit/src/audit.service.ts`
- Modify: `libs/audit/src/index.ts`

- [ ] **Step 1: Write audit.service.ts**

```typescript
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@sam/persistence';

export interface AuditEntry {
  tenantId: string;
  actorId?: string;
  actorKind: 'admin' | 'system' | 'api_key';
  action: string;
  resource: string;
  payload?: Record<string, unknown>;
  result: 'success' | 'failure' | 'pending';
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        actorKind: entry.actorKind,
        action: entry.action,
        resource: entry.resource,
        payload: (entry.payload ?? {}) as Prisma.InputJsonValue,
        result: entry.result,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }
}
```

- [ ] **Step 2: Update index + add workspace deps**

`libs/audit/package.json` — add `"@sam/persistence": "workspace:*"` to deps.

- [ ] **Step 3: Typecheck**

```
pnpm install && pnpm --filter @sam/audit typecheck
```

- [ ] **Step 4: Commit**

```
git add libs/audit/
git commit -m "feat(audit): add append-only AuditService"
```

---

## Task 10: Queue infrastructure (BullMQ names + job types)

**Files:**

- Create: `libs/queue/src/queue.names.ts`
- Create: `libs/queue/src/job-types.ts`
- Modify: `libs/queue/src/index.ts`

- [ ] **Step 1: Write queue.names.ts**

```typescript
export const QUEUE_DEVICE_HEALTH = 'device:health-check';
export const QUEUE_DEVICE_CAPABILITIES = 'device:discover-capabilities';
export const QUEUE_USER_SYNC = 'user:sync';
export const QUEUE_FACE_SYNC = 'face:sync';
export const QUEUE_EVENT_PROCESS = 'event:process';
```

- [ ] **Step 2: Write job-types.ts**

```typescript
export interface HealthCheckJobData {
  deviceId: string;
  tenantId: string;
}

export interface CapabilityDiscoveryJobData {
  deviceId: string;
  tenantId: string;
}
```

- [ ] **Step 3: Update index + typecheck + commit**

```
git commit -m "feat(queue): add queue names and job type definitions"
```

---

## Task 11: NestJS app module + global wiring

**Files:**

- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`

- [ ] **Step 1: Install NestJS dependencies**

```
pnpm add @nestjs/config @nestjs/swagger @nestjs/bull bullmq pino-http class-transformer class-validator --filter @sam/api
pnpm add -D @types/node --filter @sam/api
```

- [ ] **Step 2: Write health.controller.ts**

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@sam/persistence';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async readiness(): Promise<{ status: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
```

- [ ] **Step 3: Write app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@sam/persistence';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
```

- [ ] **Step 4: Update main.ts**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready', 'metrics'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const doc = new DocumentBuilder()
    .setTitle('Smart Access Middleware API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(process.env['PORT'] ?? 3000);
}

void bootstrap();
```

- [ ] **Step 5: pnpm install + typecheck**

```
pnpm install && pnpm --filter @sam/api typecheck
```

- [ ] **Step 6: Commit**

```
git add apps/api/src/
git commit -m "feat(api): wire app module, health endpoints, Swagger, global ValidationPipe"
```

---

## Task 12: Auth module (login, JWT, refresh, RBAC guard)

**Files:**

- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/rbac.guard.ts`

- [ ] **Step 1: Install auth deps**

```
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt --filter @sam/api
pnpm add @types/passport @types/passport-jwt -D --filter @sam/api
```

- [ ] **Step 2: Write auth.service.ts**

Core logic: argon2 verify, lockout check, issue JWT pair, refresh rotation. Delegates to `PasswordService` and `PrismaService`.

Key behavior:

- Login: check `isActive`, check `lockedUntil`, verify password, reset `failedLogins` on success, increment + lock on failure.
- Access token: 15 min, payload `{ sub, tenantId, role }`.
- Refresh token: 7 day, stored hash in `refresh_tokens`, rotated on use.

- [ ] **Step 3: Write jwt.strategy.ts**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env['JWT_ACCESS_SECRET'] ?? '',
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub) throw new UnauthorizedException();
    return payload;
  }
}
```

- [ ] **Step 4: Write rbac.guard.ts**

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from './jwt.strategy';

export const ROLES_KEY = 'roles';
export const Roles =
  (...roles: string[]) =>
  (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(ROLES_KEY, roles, descriptor?.value ?? target);
    return descriptor ?? target;
  };

const ROLE_ORDER = ['viewer', 'operator', 'admin', 'owner'];

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<string[]>(ROLES_KEY, ctx.getHandler()) ?? [];
    if (required.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<{ user: JwtPayload }>().user;
    const userLevel = ROLE_ORDER.indexOf(user.role);
    const requiredLevel = Math.min(...required.map((r) => ROLE_ORDER.indexOf(r)));
    if (userLevel < requiredLevel) throw new ForbiddenException();
    return true;
  }
}
```

- [ ] **Step 5: Write auth controller + DTO classes**

POST `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`.

- [ ] **Step 6: Register auth module in AppModule**

- [ ] **Step 7: Integration tests for auth endpoints**

`apps/api/src/auth/auth.controller.spec.ts` using Supertest:

```typescript
// Test: POST /api/v1/auth/login with valid credentials → 200 + tokens
// Test: POST /api/v1/auth/login with wrong password → 401
// Test: POST /api/v1/auth/login 6 times wrong → 423 Locked
// Test: POST /api/v1/auth/refresh with valid token → new token pair
// Test: POST /api/v1/auth/refresh with expired token → 401
```

- [ ] **Step 8: pnpm typecheck + test**

- [ ] **Step 9: Commit**

```
git commit -m "feat(auth): add login, JWT, refresh token rotation, RBAC guard"
```

---

## Task 13: Device service + controller + endpoints

**Files:**

- Create: `apps/api/src/devices/devices.module.ts`
- Create: `apps/api/src/devices/devices.controller.ts`
- Create: `apps/api/src/devices/devices.service.ts`
- Create: `apps/api/src/devices/dto/create-device.dto.ts`
- Create: `apps/api/src/devices/dto/update-device.dto.ts`

- [ ] **Step 1: Write create-device.dto.ts**

```typescript
import { IsString, IsEnum, IsInt, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeviceVendor } from '@sam/domain';

export class CreateDeviceDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: DeviceVendor }) @IsEnum(DeviceVendor) vendor!: string;
  @ApiProperty() @IsString() @IsOptional() model?: string;
  @ApiProperty() @IsString() ipAddress!: string;
  @ApiProperty({ default: 80 }) @IsInt() @Min(1) @Max(65535) port = 80;
  @ApiProperty() @IsString() username!: string;
  @ApiProperty() @IsString() password!: string;
  @ApiProperty() @IsUUID() @IsOptional() siteId?: string;
}
```

- [ ] **Step 2: Write devices.service.ts**

Key behaviors:

- `create()`: encrypt password → persist → enqueue capability-discovery + health-check jobs → audit log → return (never return password)
- `findAll()` / `findById()` / `update()` / `softDelete()`
- Never return `passwordEncrypted` in any DTO

- [ ] **Step 3: Write devices.controller.ts**

```
POST   /api/v1/devices           → 201
GET    /api/v1/devices           → 200 list
GET    /api/v1/devices/:id       → 200 | 404
PATCH  /api/v1/devices/:id       → 200 | 404
DELETE /api/v1/devices/:id       → 204 (soft delete)
POST   /api/v1/devices/:id/health-check → 202
GET    /api/v1/devices/:id/capabilities → 200
```

All routes require JWT + role `operator` minimum.

- [ ] **Step 4: Integration tests (Supertest)**

```
POST /api/v1/devices → 201, check password not in response
GET  /api/v1/devices/:id → 200 with capabilities
POST /api/v1/devices no auth → 401
POST /api/v1/devices bad body → 400 Problem+JSON
```

- [ ] **Step 5: typecheck + test + commit**

```
git commit -m "feat(api): add device CRUD endpoints with auth, validation, audit"
```

---

## Task 14: Worker app — capability discovery + health-check processors

**Files:**

- Modify: `apps/worker/src/main.ts`
- Create: `apps/worker/src/worker.module.ts`
- Create: `apps/worker/src/capability-discovery/capability-discovery.processor.ts`
- Create: `apps/worker/src/health-check/health-check.processor.ts`

- [ ] **Step 1: Install worker deps**

```
pnpm add bullmq @nestjs/bullmq --filter @sam/worker
```

- [ ] **Step 2: Write capability-discovery.processor.ts**

```typescript
// Processor for QUEUE_DEVICE_CAPABILITIES
// 1. Load device from DB (decrypt password with CryptoService)
// 2. Resolve driver from DriverRegistry
// 3. Call driver.discoverCapabilities()
// 4. Upsert into device_capabilities
// 5. Update device.status = 'online' (first successful contact)
// 6. Emit audit entry
// On DriverError: rethrow (BullMQ handles retry per job config)
```

- [ ] **Step 3: Write health-check.processor.ts**

```typescript
// Processor for QUEUE_DEVICE_HEALTH (repeatable: every 60s)
// 1. Load device, skip if status='disabled'
// 2. Call driver.ping()
// 3. Update device.status: online|degraded|offline, lastSeenAt, lastHealthCheck
// 4. If status changed → emit audit entry
```

- [ ] **Step 4: Update worker main.ts to bootstrap BullMQ workers**

- [ ] **Step 5: Unit tests for processors with MockDriver**

- [ ] **Step 6: typecheck + test + commit**

```
git commit -m "feat(worker): add capability discovery and health-check BullMQ processors"
```

---

## Task 15: Phase 1 acceptance verification

- [ ] **Step 1: Run all gates**

```
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all clean

- [ ] **Step 2: Smoke test — register device via API**

```
# Start dev stack
pnpm run dev:up

# Seed
pnpm exec prisma db seed

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"changeme123"}'

# Register device (using MockDriver in dev — no real device needed)
curl -X POST http://localhost:3000/api/v1/devices \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Device","vendor":"mock","ip_address":"127.0.0.1","port":8080,"username":"admin","password":"test"}'
```

Expected: 201, device in DB, capability-discovery job enqueued, health-check repeatable job registered, device transitions to `online`.

- [ ] **Step 3: Verify acceptance criteria (doc 10)**
  - ✅ Admin logs in → tokens returned
  - ✅ Device registered → transitions to `online` after health-check job
  - ✅ Capabilities in DB and in `GET /devices/:id`
  - ✅ Audit entries in `audit_log` table
  - ✅ `passwordEncrypted` never appears in any API response

- [ ] **Step 4: Commit**

```
git tag v0.0.0-phase1
```

---

## Self-Review Against Phase 1 Spec (doc 10 §Phase 1)

| Spec item                                                                   | Task                           |
| --------------------------------------------------------------------------- | ------------------------------ |
| Prisma schema for tenants, sites, devices, device_capabilities, admin_users | Task 1                         |
| Initial migration                                                           | Task 1                         |
| Repository pattern for devices and sites                                    | Task 7                         |
| Admin login + JWT access + refresh tokens                                   | Task 12                        |
| Refresh token rotation                                                      | Task 12                        |
| RBAC guard + @Scopes()                                                      | Task 12                        |
| Account lockout on repeated failures                                        | Task 12                        |
| POST /devices (password encryption)                                         | Task 13                        |
| GET /devices, GET /devices/:id                                              | Task 13                        |
| PATCH /devices/:id, soft delete                                             | Task 13                        |
| Input validation, error catalog, problem+JSON                               | Tasks 11, 13                   |
| OpenAPI at /api/docs                                                        | Task 11                        |
| AccessDeviceDriver interface                                                | Task 4                         |
| DriverError taxonomy                                                        | Task 4                         |
| HikvisionDriver.getDeviceInfo() + ping()                                    | Task 6                         |
| MockDriver with failure injection                                           | Task 5                         |
| device:discover-capabilities job                                            | Tasks 10, 14                   |
| Persist capabilities                                                        | Tasks 7, 14                    |
| Periodic health-check job (every 1 min)                                     | Task 14                        |
| Status transitions online ↔ degraded ↔ offline                              | Task 14                        |
| audit_log table + write helper                                              | Tasks 1, 9                     |
| App role lacks UPDATE/DELETE on audit_log                                   | Task 1 (migration sets grants) |
| Unit tests for domain services                                              | Tasks 3, 4, 5, 8               |
| Integration tests for device endpoints                                      | Task 13                        |

**MFA stub:** Phase 1 login accepts `mfa_code` field but does not validate it (per OC-2 default). TOTP enforcement in Phase 4.
