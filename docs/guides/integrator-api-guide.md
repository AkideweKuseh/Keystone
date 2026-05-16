# Integrator API Guide

## Authentication

All endpoints require `Authorization: Bearer <jwt>` (admin session) or `X-Api-Key: <key>` (machine-to-machine, future Phase 5).

Obtain a token: `POST /api/v1/auth/login` — see Admin Guide.

## Base URL

```
https://api.your-deployment.com/api/v1
```

## Conventions

- **IDs:** UUID v4 strings.
- **Timestamps:** RFC 3339, UTC. Example: `2026-05-16T12:00:00Z`.
- **Errors:** Problem+JSON format:
  ```json
  {
    "type": "https://errors.smartaccess/not_found",
    "title": "Device not found: <id>",
    "status": 404,
    "instance": "/api/v1/devices/abc-123",
    "trace_id": "01HZAB..."
  }
  ```
- **Pagination:** Cursor-based. Pass `cursor=<next_cursor>` from previous response.
- **Rate limit:** 100 req/min per token. Returns `429` with `Retry-After` header.

## Key Endpoints

### Devices

| Method | Path                  | Description               |
| ------ | --------------------- | ------------------------- |
| POST   | `/devices`            | Register device           |
| GET    | `/devices`            | List devices              |
| GET    | `/devices/:id`        | Get device + capabilities |
| PATCH  | `/devices/:id`        | Update device             |
| DELETE | `/devices/:id`        | Soft-delete (disable)     |
| POST   | `/devices/:id/unlock` | Synchronous door unlock   |

### Users

| Method | Path                     | Description                    |
| ------ | ------------------------ | ------------------------------ |
| POST   | `/users`                 | Create user, enqueue sync      |
| GET    | `/users`                 | List users                     |
| GET    | `/users/:id`             | Get user + credentials         |
| PATCH  | `/users/:id`             | Update, re-enqueue sync        |
| DELETE | `/users/:id`             | Terminate, remove from devices |
| GET    | `/users/:id/sync-status` | Per-device sync state          |
| POST   | `/users/:id/resync`      | Force re-enqueue               |

### Events

| Method | Path          | Description                         |
| ------ | ------------- | ----------------------------------- |
| GET    | `/events`     | List events (paginated, filterable) |
| GET    | `/events/:id` | Get single event                    |

### Sync Engine

| Method | Path             | Description            |
| ------ | ---------------- | ---------------------- |
| POST   | `/sync/run`      | Trigger reconciliation |
| GET    | `/sync/status`   | Queue depths + stats   |
| GET    | `/sync/failures` | Failed sync rows       |

## Webhooks (Phase 5)

Not yet available. Use WebSocket for realtime events (`wss://<host>/ws`).

## OpenAPI / Swagger

Machine-readable spec available (in dev) at:

```
GET /api/docs-json
```

Interactive UI at: `GET /api/docs` (requires admin auth in production).
