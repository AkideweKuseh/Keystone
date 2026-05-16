# 07 — Event Processing & Realtime

How a card swipe becomes a row in PostgreSQL, a push to a mobile app, and a chart on a dashboard — in under half a second.

---

## 1. End-to-End Flow

```
  Device                Receiver               Queue/Workers          DB              Realtime
   ┌─────┐  POST XML    ┌─────────┐  enqueue   ┌──────────┐  insert   ┌─────────┐  pub  ┌─────────┐
   │card │ ─────────►   │/events  │ ─────────► │event-    │ ─────────►│access_  │ ─────►│Redis    │
   │swipe│              │ 200 OK  │            │process   │           │events   │       │pub/sub  │
   └─────┘  ◄────────── └─────────┘            └──────────┘           └─────────┘       └────┬────┘
                                                                                              │
                                                                                              ▼
                                                                                       ┌─────────┐
                                                                                       │Socket.IO│
                                                                                       │ rooms   │
                                                                                       └────┬────┘
                                                                                            │
                                                                                            ▼
                                                                                       Browsers / apps
```

---

## 2. The Receiver: Why 200 OK Fast Matters

Hikvision devices **retry aggressively** on non-2xx responses or timeouts. A slow receiver can:

- duplicate events
- saturate the receiver
- cascade into queue overload
- in pathological cases, exhaust the device's local event buffer and *lose* events when newer ones overwrite older ones

So:

1. The receiver does the **minimum possible** before responding:
   - parse content-type
   - validate `X-Device-Token` (or mTLS cert)
   - persist the raw body (small INSERT)
   - enqueue an `event-process` job
   - return `200 OK`
2. All semantic parsing happens in the worker.
3. The receiver runs in its own deployment (own container, own pool) so an API outage doesn't break event ingestion.

Target: **p95 < 100 ms, p99 < 250 ms** from request received to `200` sent.

---

## 3. Receiver Implementation Sketch

```ts
@Controller()
export class ReceiverController {
  @Post('/hikvision/events')
  @SkipBodyValidation()          // we accept arbitrary XML/JSON
  async receive(
    @Headers('x-device-token') token: string,
    @Query('d') deviceId: string,
    @Body() rawBody: string | Buffer,
    @Headers('content-type') contentType: string,
  ) {
    const device = await this.deviceAuth.verify(deviceId, token);
    if (!device) throw new UnauthorizedException();

    // Compute a dedup key from device + payload hash + event time (best-effort)
    const dedupKey = await this.dedup.computeKey(device.id, rawBody, contentType);

    const eventId = await this.db.access_events.insert({
      tenant_id: device.tenant_id,
      device_id: device.id,
      event_type: 'unprocessed',
      event_time: new Date(),
      raw_payload: { contentType, body: rawBody.toString('utf8') },
      dedup_key: dedupKey,
    });

    // Fire-and-forget enqueue
    this.queue.add('event-process', { eventId, deviceId: device.id }, { jobId: dedupKey });

    return { ok: true };          // → HTTP 200
  }
}
```

Notes:
- The `dedup_key` collision (UNIQUE index in DB + BullMQ `jobId`) ensures a retried delivery becomes a no-op.
- The DB insert is tiny and fast (JSONB body).
- The handler never awaits anything on the device-facing side beyond the DB.

---

## 4. Event Processing Worker

```ts
worker.process('event-process', async (job) => {
  const evt = await db.access_events.findUnique({ where: { id: job.data.eventId } });
  if (evt.event_type !== 'unprocessed') return; // idempotency

  const parsed = parsePayload(evt.raw_payload);  // XML/JSON → normalized DTO
  const user   = await resolveUserByEmployeeNo(evt.tenant_id, parsed.employeeNo);
  const door   = await resolveDoor(evt.device_id, parsed.doorIndex);

  await db.access_events.update({
    where: { id: evt.id },
    data: {
      event_type:    classify(parsed),        // 'access_granted', 'access_denied', ...
      event_subtype: parsed.subtype,
      event_time:    parsed.eventTime ?? evt.event_time,
      user_id:       user?.id,
      door_id:       door?.id,
      employee_no:   parsed.employeeNo,
    },
  });

  // Pub/Sub fan-out
  await redis.publish(`events:${evt.tenant_id}`, JSON.stringify({
    id: evt.id,
    type: classify(parsed),
    deviceId: evt.device_id,
    doorId: door?.id,
    userId: user?.id,
    employeeNo: parsed.employeeNo,
    eventTime: parsed.eventTime,
  }));
});
```

Classification taxonomy (minimum viable):

| `event_type` | Meaning |
|--------------|---------|
| `access_granted`  | Valid credential, door unlocked by policy |
| `access_denied`   | Credential invalid / no permission / out-of-schedule |
| `door_opened`     | Door physically opened |
| `door_closed`     | Door physically closed |
| `door_held_open`  | Held open longer than allowed |
| `forced_entry`    | Opened without an unlock command |
| `tamper`          | Device tamper alarm |
| `device_offline`  | Synthetic: device missed heartbeat |
| `device_online`   | Synthetic: device came back |

---

## 5. Realtime Fan-Out (Socket.IO)

### 5.1 Server

```ts
io.adapter(createAdapter(redisPub, redisSub));   // horizontal scale

io.use(authMiddleware);                          // JWT on connect

io.on('connection', (socket) => {
  const { tenantId, role, allowedSites } = socket.data.session;

  socket.join(`tenant:${tenantId}`);
  for (const siteId of allowedSites) {
    socket.join(`tenant:${tenantId}:site:${siteId}`);
  }
});

// Bridge Redis pub → Socket.IO rooms
sub.psubscribe('events:*');
sub.on('pmessage', (_pattern, channel, payload) => {
  const tenantId = channel.split(':')[1];
  const event = JSON.parse(payload);
  io.to(`tenant:${tenantId}`).emit('event', event);
});
```

### 5.2 Rooms / Channels

- `tenant:<id>` — all events in tenant
- `tenant:<id>:site:<id>` — site-scoped
- `tenant:<id>:device:<id>` — device-scoped
- `user:<id>:sync-status` — personal updates for an admin (e.g., their resync request finished)

### 5.3 Client (browser)

```ts
const socket = io('/ws', { auth: { token: accessToken } });
socket.on('event', (e) => store.dispatch(eventReceived(e)));
socket.on('disconnect', (reason) => /* show banner */);
```

The client MUST reconnect automatically (Socket.IO does this by default) and reconcile by polling `/api/v1/events?from=<lastSeen>` after reconnect to plug any gap.

---

## 6. Push vs Pull

Most Hikvision devices support **HTTP listening** (push). Some older firmwares don't. For those, an `event-poll` worker periodically calls `pullEvents(since, limit)` per device and inserts the results.

The platform detects mode during capability discovery:

```ts
device.metadata.eventMode === 'push' | 'pull'
```

Both paths converge at the same `access_events` row → same Redis channel → same dashboard. Consumers don't care which mode is in use.

---

## 7. Deduplication Strategy

A device retry should not create a duplicate event. Two layers protect us:

1. **At the receiver:** the `dedup_key` is a hash of `(device_id, content_hash, time_bucket)`. A `UNIQUE` partial index on `access_events.dedup_key` causes the second INSERT to error; the receiver catches that specific error and still returns 200.
2. **At the worker:** `event-process` is idempotent — re-running it on an already-processed row is a no-op.

---

## 8. Backpressure Handling

If the receiver gets overwhelmed:

- Nginx applies a per-source-IP rate limit (`limit_req_zone`).
- If the queue depth exceeds a threshold, the receiver still returns 200 but logs a `WARN`. We never reject the device — that would just cause retries.
- A circuit-breaker on the DB connection pool sheds load by short-writing only `(device_id, raw_payload)` and deferring even minimal validation to the worker.

---

## 9. Acceptance Checklist (Events & Realtime)

- ☐ Receiver returns 200 in under 100 ms p95 under 500 events/sec
- ☐ Receiver authenticated per device (mTLS or token)
- ☐ Duplicate POSTs result in exactly one event row
- ☐ Worker correctly classifies a representative sample of real device payloads (XML + JSON)
- ☐ Redis adapter enables Socket.IO horizontal scale (verified with 2+ pods)
- ☐ Clients receive events within 500 ms p95 from swipe
- ☐ Client reconnect + gap-fill works after a 60-second network outage
- ☐ Push-mode devices configured automatically at registration
- ☐ Pull-mode devices polled with bounded windows (no unbounded loops)
- ☐ Dashboards show throughput, p95, error rate, dedup hit rate
