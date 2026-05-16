# Runbook: Dead-Letter Queue Growth

**Alert:** DLQ length increasing over 15 min  
**Severity:** Critical

## Diagnosis

```bash
# List DLQ contents (user-sync failures)
redis-cli -u "$REDIS_URL" lrange 'bull:user-sync:failed' 0 20
```

Query permanently failed sync rows:

```sql
SELECT d.name, u.employee_no, dus.error_message, dus.retry_count
FROM device_user_sync dus
JOIN devices d ON d.id = dus.device_id
JOIN users u ON u.id = dus.user_id
WHERE dus.sync_status = 'failed'
ORDER BY dus.retry_count DESC
LIMIT 20;
```

## Common root causes

| Error                        | Likely cause                         | Action                                                       |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `DRIVER_AUTH_FAILED`         | Device password changed externally   | Update via `PATCH /api/v1/devices/:id`                       |
| `DRIVER_UNSUPPORTED_FEATURE` | Firmware doesn't support JSON upsert | Check `device_capabilities`; update firmware or use XML path |
| `DRIVER_BAD_RESPONSE`        | Device returns 5xx consistently      | Check device health; contact hardware support                |

## Resolution

After fixing root cause, re-enqueue via:

```bash
# Trigger resync for a specific user on all devices
POST /api/v1/users/:id/resync

# Trigger global reconciliation
POST /api/v1/sync/run { "scope": "all" }
```

Drain DLQ once root cause is fixed (jobs are idempotent):

```bash
redis-cli -u "$REDIS_URL" del 'bull:user-sync:failed'
```
