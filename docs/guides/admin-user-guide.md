# Administrator User Guide

## Getting Started

### Login

```bash
POST /api/v1/auth/login
{
  "email": "admin@your-org.com",
  "password": "your-password"
}
```

Save the `access_token` (15 min TTL) and `refresh_token` (7 days). Use `Authorization: Bearer <access_token>` on all subsequent requests. Refresh before expiry:

```bash
POST /api/v1/auth/refresh
{ "refresh_token": "<your_refresh_token>" }
```

### Roles

| Role       | Can do                                                  |
| ---------- | ------------------------------------------------------- |
| `owner`    | Everything, including managing other admins             |
| `admin`    | All device + user ops, no admin management              |
| `operator` | Create/update/delete devices and users, trigger unlocks |
| `viewer`   | Read-only access to all resources                       |

---

## Registering a Device

```bash
POST /api/v1/devices
Authorization: Bearer <token>
{
  "name": "HQ Lobby Reader",
  "vendor": "hikvision",
  "model": "DS-K1T343",
  "ip_address": "10.10.0.21",
  "port": 80,
  "username": "admin",
  "password": "device-password-here",
  "site_id": "optional-site-uuid"
}
```

The device transitions to `online` after the automatic health-check (≤ 60 s). Capabilities are discovered immediately. The device password is AES-GCM encrypted at rest and never returned by the API.

---

## Managing Users

### Create a user

```bash
POST /api/v1/users
{
  "employee_no": "EMP00123",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com",
  "access_group_ids": ["uuid-of-access-group"]
}
```

The platform enqueues one sync job per online device. The user appears on devices within 30 s under normal load.

### Monitor sync progress

```bash
GET /api/v1/users/:id/sync-status
```

### Terminate a user (remove from all devices)

```bash
DELETE /api/v1/users/:id
```

---

## Unlocking a Door

```bash
POST /api/v1/devices/:id/unlock
Authorization: Bearer <token>
{ "door_index": 1 }
```

This is synchronous — the API waits for the device to confirm (≤ 3 s). The action is audit-logged before and after.

---

## Viewing Events

```bash
GET /api/v1/events?limit=50&from=2026-05-16T00:00:00Z&event_type=access_granted
```

Use `next_cursor` from the response for pagination.

---

## Health Checks

| Endpoint            | Purpose                                 |
| ------------------- | --------------------------------------- |
| `GET /health`       | Liveness — always 200 if process is up  |
| `GET /health/ready` | Readiness — 200 only if DB is reachable |

---

## Realtime Events (WebSocket)

Connect to `wss://<host>/ws` with `auth: { token: "<access_token>" }`. Listen for `event` messages:

```js
const socket = io('wss://api.your-platform.com', { path: '/ws', auth: { token } });
socket.on('event', (e) => console.log(e.type, e.employeeNo));
```
