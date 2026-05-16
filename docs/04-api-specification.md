# 04 — REST API Specification

All routes are versioned under `/api/v1`. The platform also exposes a WebSocket namespace under `/ws` (see `07-event-processing-realtime.md`).

---

## 1. Conventions

- **Format:** JSON request/response. UTF-8.
- **Auth:** `Authorization: Bearer <jwt>` for admin sessions. `X-Api-Key: <key>` for machine-to-machine.
- **IDs:** UUID v4.
- **Time:** RFC 3339 with timezone. Server stores UTC.
- **Pagination:** Cursor-based — `?limit=50&cursor=<opaque>`. Response includes `next_cursor`.
- **Sorting:** `?sort=-created_at`.
- **Filtering:** Explicit query params per resource. No generic Mongo-style `?filter[...]`.
- **Idempotency:** Mutating POSTs accept `Idempotency-Key` header.
- **Errors:** Problem+JSON shape:

```json
{
  "type": "https://errors.smartaccess/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "employee_no must be unique",
  "instance": "/api/v1/users",
  "fields": { "employee_no": "duplicate" },
  "trace_id": "01HZAB..."
}
```

- **Rate limits:** 100 req/min per JWT, 1000 req/min per API key (configurable). Returns `429` with `Retry-After`.

---

## 2. Authentication

### POST `/api/v1/auth/login`

```json
// request
{ "email": "admin@example.com", "password": "...", "mfa_code": "123456" }

// 200 response
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 900,
  "user": { "id": "...", "email": "...", "role": "admin" }
}
```

### POST `/api/v1/auth/refresh`
### POST `/api/v1/auth/logout`

---

## 3. Devices

### POST `/api/v1/devices`  — register a device

```json
{
  "name": "HQ Lobby Reader",
  "vendor": "hikvision",
  "model": "DS-K1T343",
  "ip_address": "10.10.0.21",
  "port": 80,
  "username": "admin",
  "password": "...",
  "site_id": "..."
}
```

Response `201`:

```json
{
  "id": "...",
  "status": "unknown",
  "capabilities_discovery": "queued"
}
```

Side effects:
- AES-GCM encrypt password.
- Enqueue `device:discover-capabilities` job.
- Enqueue `device:health-check` job.
- Audit log entry.

### GET `/api/v1/devices`  — list

Query: `?site_id=&status=&vendor=&search=&limit=&cursor=`

### GET `/api/v1/devices/:id`
### PATCH `/api/v1/devices/:id`
### DELETE `/api/v1/devices/:id`  (soft delete — sets `status='disabled'`)

### POST `/api/v1/devices/:id/health-check`  — force a check
### GET `/api/v1/devices/:id/capabilities`

### POST `/api/v1/devices/:id/unlock`  — synchronous door unlock

```json
{ "door_index": 1, "duration_seconds": 5 }
```

Response `200`:

```json
{ "status": "ok", "device_response_ms": 320 }
```

⚠️ This endpoint requires the `door.unlock` scope, RBAC role `operator` or above, MFA-recently-verified flag, and writes an audit entry **before and after** the action.

---

## 4. Users

### POST `/api/v1/users`  — create user

```json
{
  "employee_no": "EMP00123",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com",
  "credentials": [
    { "type": "card",  "card_number": "100245" },
    { "type": "face",  "face_image_base64": "..." }
  ],
  "access_group_ids": ["..."]
}
```

Response `201`:

```json
{
  "id": "...",
  "sync_status": "pending",
  "sync_targets": 6
}
```

Side effects: persist user + credentials + access-group memberships → enqueue one `user:sync` job per relevant device.

### GET `/api/v1/users`
### GET `/api/v1/users/:id`
### PATCH `/api/v1/users/:id`
### DELETE `/api/v1/users/:id`  — sets `status='terminated'` and queues removal from devices

### GET `/api/v1/users/:id/sync-status`  — per-device sync state

```json
{
  "user_id": "...",
  "devices": [
    { "device_id": "...", "name": "Lobby", "sync_status": "synced",  "last_synced_at": "..." },
    { "device_id": "...", "name": "Gate",  "sync_status": "failed",  "error_message": "TIMEOUT" }
  ]
}
```

### POST `/api/v1/users/:id/resync`  — re-enqueue sync for one user

---

## 5. Access Groups

### POST `/api/v1/access-groups`
### GET `/api/v1/access-groups`
### GET `/api/v1/access-groups/:id`
### PATCH `/api/v1/access-groups/:id`
### DELETE `/api/v1/access-groups/:id`
### POST `/api/v1/access-groups/:id/doors`     — attach doors
### DELETE `/api/v1/access-groups/:id/doors/:door_id`
### POST `/api/v1/access-groups/:id/users`     — attach users

---

## 6. Events

### GET `/api/v1/events`

Query: `?from=&to=&device_id=&user_id=&employee_no=&event_type=&limit=&cursor=`

```json
{
  "data": [
    {
      "id": "...",
      "event_time": "2026-05-15T10:22:11Z",
      "event_type": "access_granted",
      "device_id": "...",
      "door_id": "...",
      "user": { "id": "...", "employee_no": "EMP00123", "name": "Ada L." }
    }
  ],
  "next_cursor": "..."
}
```

### GET `/api/v1/events/:id`
### POST `/api/v1/events/export`  — async CSV/Parquet export job; returns a job id and download URL when complete.

---

## 7. Sync Engine

### POST `/api/v1/sync/run`  — trigger global reconciliation

```json
{ "scope": "all" }       // or { "scope": "device", "device_id": "..." }
                          // or { "scope": "user",   "user_id": "..." }
```

### GET `/api/v1/sync/status`

```json
{
  "queues": [
    { "name": "user-sync",  "waiting": 12, "active": 4, "failed": 1 },
    { "name": "face-sync",  "waiting": 0,  "active": 0, "failed": 0 },
    { "name": "event-poll", "waiting": 1,  "active": 1, "failed": 0 }
  ]
}
```

### GET `/api/v1/sync/failures`  — items in `device_user_sync.sync_status='failed'`

---

## 8. Device Event Ingestion (called by devices, not consumer apps)

### POST `/hikvision/events`

- Authenticated by **mTLS** *or* a per-device shared secret in `X-Device-Token`.
- Accepts `application/xml` or `application/json`.
- MUST return `200 OK` within 100 ms.
- Body is persisted raw into `access_events.raw_payload`; processing is enqueued.

---

## 9. Health and Operational

### GET `/health`        — liveness  (always 200 if process is up)
### GET `/health/ready`  — readiness  (200 only if DB + Redis reachable)
### GET `/metrics`       — Prometheus exposition (protected by IP allowlist or token)

---

## 10. Error Catalog (excerpt)

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_FAILED`     | 400 | Input failed schema validation |
| `UNAUTHENTICATED`       | 401 | Missing/invalid token |
| `FORBIDDEN`             | 403 | Token valid, scope insufficient |
| `NOT_FOUND`             | 404 | Resource not found in tenant |
| `CONFLICT`              | 409 | Unique constraint violation |
| `IDEMPOTENCY_MISMATCH`  | 409 | Idempotency key reused with different body |
| `DEVICE_UNREACHABLE`    | 502 | Device-side error during sync request |
| `DEVICE_TIMEOUT`        | 504 | Device-side timeout during sync request |
| `RATE_LIMITED`          | 429 | Per-token quota exceeded |
| `INTERNAL`              | 500 | Unhandled |

---

## 11. OpenAPI

The above is normative prose. The **machine-readable contract** lives in:

```
apps/api/openapi.yaml
```

It is generated from NestJS decorators via `@nestjs/swagger` and served at `/api/docs` (gated behind admin auth in production).

---

## 12. API Acceptance Checklist

- ☐ Every endpoint has an OpenAPI definition
- ☐ Every mutating endpoint accepts `Idempotency-Key`
- ☐ Every endpoint validated against schema (Zod / class-validator)
- ☐ Every endpoint returns Problem+JSON errors
- ☐ Every endpoint has an integration test (happy + auth-fail + validation-fail)
- ☐ All endpoints return `trace_id` in the response or `X-Trace-Id` header
- ☐ Rate limiting verified end-to-end
- ☐ `/health` and `/health/ready` distinguish liveness vs readiness
