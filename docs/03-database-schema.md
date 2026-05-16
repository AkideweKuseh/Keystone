# 03 — Database Schema

PostgreSQL is the **single source of truth**. Every device is a replica. Every state change is persisted here before being pushed downstream.

This file covers the schema, indexing strategy, multi-tenancy plan, and migration approach.

---

## 1. Schema Overview (ER summary)

```
tenants ──┐
          │
          ├── users ──┐
          │           ├── user_credentials (cards, PINs, faces)
          │           ├── user_permissions
          │           └── device_user_sync ──┐
          │                                  │
          ├── sites ──┐                      │
          │           ├── devices ───────────┘
          │           │     └── device_capabilities
          │           │
          │           └── doors
          │
          ├── access_groups ─── access_group_doors
          │
          ├── access_events
          ├── audit_log
          └── api_keys / admin_users
```

---

## 2. Core Tables

### 2.1 `tenants` (Phase 3, multi-tenant)

```sql
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','suspended','deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> Every other tenant-scoped table includes `tenant_id UUID NOT NULL REFERENCES tenants(id)` and is indexed by it. For Phase 1 (single-tenant), default to a single seeded tenant.

### 2.2 `sites`

```sql
CREATE TABLE sites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  timezone   TEXT NOT NULL DEFAULT 'UTC',
  address    TEXT,
  vpn_subnet CIDR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sites_tenant ON sites(tenant_id);
```

### 2.3 `devices`

```sql
CREATE TABLE devices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  site_id             UUID REFERENCES sites(id),
  name                TEXT NOT NULL,
  vendor              TEXT NOT NULL DEFAULT 'hikvision'
                      CHECK (vendor IN ('hikvision','suprema','dahua','zkteco','mock')),
  model               TEXT,
  serial_number       TEXT,
  firmware_version    TEXT,
  ip_address          INET NOT NULL,
  port                INTEGER NOT NULL DEFAULT 80,
  username            TEXT NOT NULL,
  password_encrypted  BYTEA NOT NULL,    -- AES-GCM, key in KMS / env
  status              TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (status IN ('online','offline','degraded','unknown','disabled')),
  last_seen_at        TIMESTAMPTZ,
  last_health_check   TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, ip_address, port)
);
CREATE INDEX idx_devices_tenant_site ON devices(tenant_id, site_id);
CREATE INDEX idx_devices_status      ON devices(status) WHERE status <> 'disabled';
```

### 2.4 `device_capabilities`

Discovered/declared capabilities per device. Used to gate features by firmware.

```sql
CREATE TABLE device_capabilities (
  device_id     UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  supports_json BOOLEAN NOT NULL DEFAULT FALSE,
  supports_face BOOLEAN NOT NULL DEFAULT FALSE,
  supports_fp   BOOLEAN NOT NULL DEFAULT FALSE,
  max_users     INTEGER,
  max_cards     INTEGER,
  raw           JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.5 `doors`

```sql
CREATE TABLE doors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  door_index  INTEGER NOT NULL,         -- as used in ISAPI URLs
  name        TEXT NOT NULL,
  open_state  TEXT NOT NULL DEFAULT 'closed',
  UNIQUE (device_id, door_index)
);
```

### 2.6 `users` (access-control end users, not admins)

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  employee_no   TEXT NOT NULL,         -- the ID propagated to devices
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended','terminated')),
  valid_from    TIMESTAMPTZ,
  valid_to      TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_no)
);
CREATE INDEX idx_users_tenant_status ON users(tenant_id, status);
```

### 2.7 `user_credentials`

A user can have many cards/PINs/faces. Each row is one credential.

```sql
CREATE TABLE user_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL
                 CHECK (type IN ('card','pin','face','fingerprint')),
  card_number    TEXT,
  pin_hash       TEXT,                  -- never store raw PIN
  face_image_key TEXT,                  -- S3 key
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type, card_number)
);
CREATE INDEX idx_credentials_user ON user_credentials(user_id);
```

### 2.8 `access_groups` and `access_group_doors`

```sql
CREATE TABLE access_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  schedule   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- weekly schedule
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE access_group_doors (
  access_group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  door_id         UUID NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  PRIMARY KEY (access_group_id, door_id)
);

CREATE TABLE user_access_groups (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, access_group_id)
);
```

### 2.9 `device_user_sync` (the heart of the sync engine)

```sql
CREATE TABLE device_user_sync (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  desired_state   TEXT NOT NULL
                  CHECK (desired_state IN ('present','absent')),
  current_state   TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (current_state IN ('present','absent','unknown')),
  sync_status     TEXT NOT NULL DEFAULT 'pending'
                  CHECK (sync_status IN ('pending','in_progress','synced','failed')),
  last_attempt_at TIMESTAMPTZ,
  last_synced_at  TIMESTAMPTZ,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  UNIQUE (device_id, user_id)
);
CREATE INDEX idx_dus_pending ON device_user_sync(sync_status)
  WHERE sync_status IN ('pending','failed');
```

> The `(desired_state, current_state)` pair lets the reconciler compute drift trivially.

### 2.10 `access_events`

```sql
CREATE TABLE access_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  device_id     UUID REFERENCES devices(id),
  door_id       UUID REFERENCES doors(id),
  user_id       UUID REFERENCES users(id),
  employee_no   TEXT,
  event_type    TEXT NOT NULL,    -- granted, denied, door_open, tamper, ...
  event_subtype TEXT,
  event_time    TIMESTAMPTZ NOT NULL,
  raw_payload   JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedup_key     TEXT
) PARTITION BY RANGE (event_time);
```

> Partition `access_events` monthly. Each child like `access_events_2026_05`. This keeps indexes small and makes archival cheap.

Indexes on each partition:

```sql
CREATE INDEX ON access_events_2026_05 (tenant_id, event_time DESC);
CREATE INDEX ON access_events_2026_05 (device_id, event_time DESC);
CREATE INDEX ON access_events_2026_05 (employee_no, event_time DESC);
CREATE UNIQUE INDEX ON access_events_2026_05 (dedup_key)
  WHERE dedup_key IS NOT NULL;
```

### 2.11 `audit_log`

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  actor_id    UUID,
  actor_kind  TEXT NOT NULL CHECK (actor_kind IN ('admin','system','api_key')),
  action      TEXT NOT NULL,           -- e.g. 'device.unlock', 'user.create'
  resource    TEXT NOT NULL,           -- e.g. 'device:<uuid>'
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  result      TEXT NOT NULL CHECK (result IN ('success','failure','pending')),
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_actor       ON audit_log(actor_id, created_at DESC);
```

> Audit log is **append-only**. No `UPDATE`/`DELETE` privileges for the app role on this table.

### 2.12 `admin_users` and `api_keys`

```sql
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,         -- argon2id
  role          TEXT NOT NULL CHECK (role IN ('owner','admin','operator','viewer')),
  mfa_secret    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL,           -- store hash only
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  last_used   TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Indexing Principles

- Every foreign key column gets an index.
- Every `WHERE` predicate used by hot paths gets a covering index.
- Use **partial indexes** for status filters (`WHERE status <> 'disabled'`).
- Use **JSONB GIN** indexes only where we actually query JSON paths.
- All large append-heavy tables are **partitioned** (events, audit_log can be partitioned too if volume warrants).

---

## 4. Migrations

- Tool: Prisma Migrate **or** node-pg-migrate (pick one, stick with it).
- Migrations live in `prisma/migrations/` and are immutable once merged.
- Every migration MUST be:
  - **Backwards-compatible** with the previous app version (we deploy app first, then run migration, then deploy app that uses the new column — or use expand/contract).
  - Tested in CI against a real PostgreSQL container.

---

## 5. Multi-Tenant Isolation

For Phase 3, enable **Row-Level Security (RLS)** on tenant-scoped tables:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

The app sets `SET app.current_tenant = '<uuid>'` per connection/transaction.

---

## 6. Retention & Archival

| Table | Retention | Archive to |
|-------|-----------|------------|
| `access_events` | 12 months hot, then cold | S3 Parquet partitions |
| `audit_log` | 7 years (regulatory) | S3 (immutable bucket) |
| `device_user_sync` rows in `synced` | indefinite (small) | — |
| `device_user_sync` rows in `failed` after 30 days | move to DLQ table | — |

A monthly cron in the worker tier handles partition creation and old-partition export.

---

## 7. Sample Seed Data (dev)

```sql
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default', 'default');

INSERT INTO sites (tenant_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'HQ');

-- Devices and users are created via the API to exercise that path.
```

---

## 8. Schema Acceptance Checklist

- ☐ All FK columns indexed
- ☐ All `CHECK` constraints align with TypeScript enums
- ☐ `access_events` is partitioned with a working monthly-rollover job
- ☐ `audit_log` is append-only (no `UPDATE/DELETE` for app role)
- ☐ Backups verified by restoring to a scratch instance
- ☐ RLS policies tested with multi-tenant fixtures (Phase 3)
- ☐ Migrations run forward and rollback cleanly in CI
