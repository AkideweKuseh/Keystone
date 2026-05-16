# 06 — Synchronization Engine

The sync engine is what makes "DB is source of truth" actually work. It turns desired state into device state — durably, idempotently, and observably.

---

## 1. Mental Model

```
Desired state (DB)  ─────────►  Diff  ─────────►  Jobs  ─────────►  Devices
                                  ▲                                    │
                                  └──────── Reconciler (periodic) ─────┘
```

Two pathways feed the queue:

1. **Reactive** — when an admin mutates state via the API, the relevant jobs are enqueued immediately.
2. **Proactive** — a reconciler runs on a schedule (every 5 min by default; nightly full sweep) to catch drift caused by device reboots, transient failures, or out-of-band changes.

---

## 2. Queues

All queues live in Redis under a single BullMQ connection.

| Queue | Concurrency | Purpose |
|-------|-------------|---------|
| `user-sync`           | 20 | Upsert/delete a user on a single device |
| `face-sync`           | 5  | Upload a face image to a single device (heavy, separate queue) |
| `permission-sync`     | 10 | Sync access-group changes to devices |
| `event-poll`          | 5  | Pull-mode event fetching for devices that don't push |
| `health-check`        | 5  | Periodic device pings |
| `capability-discover` | 5  | One-shot capability probe on registration |
| `event-process`       | 30 | Process pushed events from receiver |
| `reconcile`           | 2  | Drift detection sweeps |
| `dlq`                 | —  | Dead-letter queue for permanently failed jobs |

> Concurrency numbers are per worker process. Workers are horizontally scalable.

---

## 3. Job Schemas

Every job carries:

```ts
type JobBase = {
  tenantId: string;
  traceId: string;             // propagated from API request
  idempotencyKey: string;      // deterministic per logical operation
  enqueuedAt: number;
};
```

### `user-sync`

```ts
type UserSyncJob = JobBase & {
  userId: string;
  deviceId: string;
  desiredState: 'present' | 'absent';
  revision: number;            // monotonic version of the user record
};
```

Idempotency key: `user-sync:{userId}:{deviceId}:{revision}`.
If two jobs with the same key are enqueued, BullMQ deduplicates.

### `face-sync`

```ts
type FaceSyncJob = JobBase & {
  userId: string;
  deviceId: string;
  credentialId: string;
  imageKey: string;            // S3 key
};
```

### `event-process`

```ts
type EventProcessJob = JobBase & {
  eventId: string;
  deviceId: string;
};
```

---

## 4. Worker Pseudocode

```ts
// user-sync worker
worker.process('user-sync', async (job: Job<UserSyncJob>) => {
  const { userId, deviceId, desiredState, revision } = job.data;

  await txn(async (db) => {
    const row = await db.deviceUserSync.findUnique({ where: { deviceId_userId: { deviceId, userId } } });
    if (row && row.revision >= revision) return 'stale';   // newer job already won
    await db.deviceUserSync.update({
      where: { id: row.id },
      data: { sync_status: 'in_progress', last_attempt_at: new Date(), retry_count: { increment: 1 } },
    });
  });

  const device = await loadDevice(deviceId);
  const driver = registry.resolve(device);

  try {
    if (desiredState === 'present') {
      const user = await loadUserSnapshot(userId);
      await driver.upsertUser(user.deviceDto());
      await driver.upsertCard(user.employeeNo, user.activeCard());
    } else {
      await driver.deleteUser(employeeNoFor(userId));
    }
    await markSynced(deviceId, userId, revision);
    emit('sync:user-status', { userId, deviceId, status: 'synced' });
  } catch (err) {
    const policy = retryPolicyFor(err);
    if (policy === 'retry') throw err;       // BullMQ retries
    if (policy === 'dlq')   await dlq.add('user-sync', job.data);
    await markFailed(deviceId, userId, err);
    emit('sync:user-status', { userId, deviceId, status: 'failed', error: err.code });
  }
});
```

Key points:

- **Transactional state machine** in `device_user_sync` prevents two workers from racing on the same row.
- **Revision check** prevents stale jobs from overwriting newer state.
- **Result is observable** via DB and via WebSocket emit.

---

## 5. Retry Policy

Mapped from `DriverError`:

| Error | Retry? | Backoff | Max attempts | Then |
|-------|--------|---------|--------------|------|
| `Timeout`         | Yes | exp, 5s → 5m | 8 | DLQ |
| `Unreachable`     | Yes | exp, 30s → 30m | 12 | DLQ |
| `RateLimited`     | Yes | honor `Retry-After`, else 60s | 10 | DLQ |
| `BadResponse`     | Yes | exp, 10s → 10m | 6 | DLQ |
| `Conflict`        | Yes | linear, 5s | 3 | DLQ |
| `AuthFailed`      | No  | — | 0 | Mark device `degraded`, alert ops |
| `UnsupportedFeature` | No | — | 0 | Mark `device_capabilities`, alert |
| `Internal`        | Yes | linear, 30s | 3 | DLQ |

BullMQ implements this via the job's `backoff` option (`{ type: 'exponential', delay: 5000 }`).

---

## 6. Reconciler

A scheduled job that runs every 5 minutes:

```
For each tenant (parallel, throttled):
  For each device with status in ('online','degraded'):
    Pull current user roster from device (driver.listUsers)
    Compare to expected roster (DB join of user_access_groups → devices)
    For each diff:
      If in DB but not on device → enqueue user-sync(present)
      If on device but not in DB → enqueue user-sync(absent)
      If credentials differ      → enqueue credential update
```

The reconciler does NOT push directly — it only enqueues. The workers do the work. This keeps the reconciler stateless and cheap to re-run.

A separate **nightly full reconcile** is enqueued at low priority for devices that haven't been touched in 24 hours.

---

## 7. Backpressure & Fairness

- Each queue has a global concurrency cap.
- Per-device limiting via BullMQ's `groupKey` ensures a single slow device cannot starve others. (BullMQ Pro feature; alternatively implement with custom token-bucket in Redis.)
- Critical operations (`door-unlock`) skip the queue and run synchronously on the request thread.

---

## 8. Observability

The engine emits the following metrics:

- `sync_jobs_enqueued_total{queue}`
- `sync_jobs_completed_total{queue,result}`
- `sync_jobs_duration_seconds{queue}` (histogram)
- `sync_device_drift_count{device_id}` (gauge, set by reconciler)
- `sync_failed_rows_total{tenant_id}` (gauge)
- `device_reachable{device_id}` (gauge 0/1)

Grafana dashboards:
- **"Sync engine health"** — throughput, error rate, queue depth, oldest waiting job
- **"Device drift"** — top N devices with most pending/failed rows
- **"Hotspots"** — devices causing the most retries

Alerts (Alertmanager):
- Queue depth > 1000 for 10 min
- Error rate > 5% for 5 min on any queue
- A device with `device_reachable == 0` for > 30 min
- DLQ length increasing

---

## 9. Door-Unlock is *Not* Queued

Door unlocks are **synchronous**:

- The admin is waiting in the UI.
- A queued unlock with even a few seconds of latency would be unacceptable.
- The driver call is made on the request thread, with a tight timeout (≤ 3 s).
- The audit record is written before the call and updated after.
- If the call fails, the API returns the error to the user immediately; no auto-retry.

---

## 10. Acceptance Checklist (Sync Engine)

- ☐ Each job type has a deterministic `idempotencyKey`
- ☐ Workers compile-check job schemas via TypeScript types
- ☐ State transitions in `device_user_sync` are wrapped in DB transactions
- ☐ Revision-based stale-job guard verified by test
- ☐ Retry policy per `DriverError` exercised by chaos tests
- ☐ DLQ is monitored with alerting
- ☐ Reconciler enqueues, never pushes directly
- ☐ Per-device fairness (no starvation) verified under load
- ☐ Door-unlock confirmed synchronous and audit-logged
- ☐ Dashboards live before first production deploy
