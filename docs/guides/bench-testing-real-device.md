# Bench Testing Guide — Real Hikvision Device

> Step-by-step procedure for testing the platform against a real Hikvision access-control
> device on the bench: registration, capability discovery, remote unlock, event push, and
> user/card sync. Companion docs: 05 (driver), 12 (HTTP listening), 13 (gotchas).
>
> ⚠️ Never commit real device IPs, passwords, or serial numbers to the repo (CLAUDE.md rule 8).
> They live only in the database, entered at runtime.

---

## Part A — Start the platform

Do these in order. Each step says how to verify before moving on.

### A1. Start Docker infrastructure (Postgres, Redis, MinIO)

Docker Desktop must be running first. Then, from the repo root:

```powershell
pnpm dev:up
```

Verify all three containers are healthy:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}"
# expect: compose-postgres-1, compose-redis-1, compose-minio-1 all "Up"
```

### A2. Apply database migrations (first run / after pulling new migrations)

```powershell
pnpm prisma migrate deploy
```

Expect `No pending migrations to apply` or a list of applied migrations. If the DB is
empty (fresh volume), also seed the admin account:

```powershell
pnpm prisma db seed
# prints: admin: admin@localhost / changeme123
```

### A3. Start the four applications

Open **two terminals** in the repo root:

```powershell
# Terminal 1 — API + worker + receiver together
pnpm dev:all

# Terminal 2 — dashboard
pnpm dev:dashboard
```

What each process is:

| Process   | Port | Purpose                                                                             |
| --------- | ---- | ----------------------------------------------------------------------------------- |
| api       | 3000 | REST API (`/api/v1/...`), Swagger UI at `/docs`, Socket.IO                          |
| worker    | —    | Executes queued jobs: user sync, capability discovery, health checks, event parsing |
| receiver  | 3001 | Accepts event pushes from devices at`POST /hikvision/events`                        |
| dashboard | 5173 | Web UI (Vite dev server)                                                            |

### A4. Verify everything is up

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health        # -> status ok
Invoke-RestMethod http://localhost:3000/api/v1/health/ready  # -> db + redis ok
Start-Process http://localhost:5173                          # dashboard opens, login page
```

The worker terminal should show `Workers started: 7 queues active`.
The receiver has no `/health` route — seeing `Mapped {/hikvision/events, POST}` in its
startup log is the confirmation it's listening.

Log into the dashboard with **admin@localhost / changeme123**.

---

## Part B — Real-device test procedure

### B0. Network prerequisites (do this before anything else)

The PC and the device must be able to reach each other **in both directions**:
PC → device for ISAPI commands (unlock, sync), device → PC for event push.

1. **Find the device's IP.** Factory default is often `192.168.1.64`. If unknown, use
   Hikvision's SADP tool on the same LAN to discover it.
2. **Confirm PC → device:**

   ```powershell
   ping <DEVICE-IP>
   Start-Process http://<DEVICE-IP>    # device web login page must load
   ```

   If the web page doesn't load, nothing else will work. Fix the network first
   (same subnet, or a route between subnets).

3. **Find the PC's LAN IP** (the one on the _same network as the device_, not a
   virtual adapter):

   ```powershell
   ipconfig
   ```

   Ignore `172.x` addresses belonging to WSL/Hyper-V virtual switches. Note the IPv4
   of the physical Ethernet/Wi-Fi adapter — call it `<PC-IP>` from here on.

4. **Open Windows Firewall for the receiver port** (device → PC pushes land on 3001).
   Run PowerShell **as Administrator**:
   ```powershell
   New-NetFirewallRule -DisplayName "SAM receiver 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
   ```
5. **Know the device admin credentials.** The same username/password you use for the
   device's web UI. If the device is new/inactive, activate it first via SADP or the
   web UI and set an admin password.

### B1. Get an API token

All API calls need a JWT. In a PowerShell terminal:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/auth/login `
  -ContentType 'application/json' `
  -Body '{"email":"admin@localhost","password":"changeme123"}'
$H = @{ Authorization = "Bearer $($login.access_token)" }
```

`$H` is now a reusable auth header. Tokens expire after **15 minutes** — if a later call
returns 401, just re-run this block.

### B2. Register the device

This stores the device in Postgres (password encrypted at rest) and automatically queues
two jobs: **capability discovery** and a **health check**. The worker runs both against
the device over ISAPI with HTTP Digest auth.

```powershell
$body = @{
  name      = 'Bench Reader'
  vendor    = 'hikvision'
  ipAddress = '<DEVICE-IP>'
  port      = 80
  username  = 'admin'
  password  = '<DEVICE-ADMIN-PASSWORD>'
} | ConvertTo-Json

$dev = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/devices `
  -Headers $H -ContentType 'application/json' -Body $body
$dev
```

Save two values from the response:

```powershell
$dev.id          # device UUID — used in every later call
$dev.pushToken   # receiver auth token — used in B5
```

(Dashboard alternative: **Devices → Register Device**, fill the same fields.)

### B3. Confirm the platform can talk to the device

Give the worker ~10 seconds, then:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/devices/$($dev.id)" -Headers $H
```

What to look for:

- `status` should become **`online`** (health check passed).
- `model`, `serialNumber`, `firmwareVersion` populated (capability discovery read
  `/ISAPI/System/deviceInfo`).
- `capabilities` listing what the device supports.

**If `status` stays `offline` / fields stay null:**

| Symptom in worker terminal | Cause                                             | Fix                                                           |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| 401 Unauthorized           | Wrong device username/password                    | Re-register with correct creds (or PATCH the device)          |
| timeout / ECONNREFUSED     | Wrong IP/port, or device blocks the PC            | Verify B0 step 2; check device's "IP address filter" settings |
| device locked              | Too many failed logins — device lockout (~30 min) | Wait, then retry with correct password (doc 13)               |

### B4. Send a remote unlock command 🔓

This is the core test. Unlock is the **only synchronous device call** in the platform —
the API thread calls the driver directly, which sends
`PUT /ISAPI/AccessControl/RemoteControl/door/1` with body
`<RemoteControlDoor version="2.0"><cmd>open</cmd></RemoteControlDoor>`.

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/devices/$($dev.id)/unlock" `
  -Headers $H -ContentType 'application/json' -Body '{"door_index":1}'
```

**Expected:** `status: ok` with `device_response_ms`, and the physical relay clicks /
door strike releases. Most single-door terminals use `door_index: 1`; multi-door
controllers number them 1..N.

(Dashboard alternative: **Devices** page → **Unlock** button on the device row.)

**If it fails:**

- `500` + worker/api log shows Digest failure → wrong credentials.
- `403` from device → the device account lacks remote-control permission; use admin.
- OK response but no physical action → check `door_index`, and that the lock wiring/relay
  is actually connected (test from the device's own web UI: Access Control → Door → Open).

### B5. Configure the device to push events to the receiver

On the **device web UI** (`http://<DEVICE-IP>`):

1. Go to **Configuration → Network → Advanced Settings → HTTP Listening**
   (some firmwares: "Alarm Server" / "Event Server").
2. Fill the row:
   - **Destination IP or Host Name**: `<PC-IP>`
   - **URL**: `/hikvision/events?d=<DEVICE-UUID>` ← the `$dev.id` from B2
   - **Protocol**: `HTTP`
   - **Port**: `3001`
3. Save, then click **Test**. Expect **"The service is available"**.
   - Test fails → firewall rule from B0.4 missing, wrong `<PC-IP>` (virtual adapter?),
     or receiver not running.
4. Enable event linkage so events are actually pushed (necessary — doc 12 §6):
   **Configuration → Event → Access Control Event** (or Smart → Face Capture, etc.)
   → enable **"Notify Surveillance Center"** / **"Upload to Alarm Center"** for each
   event type you want.

**Known gap (token auth):** the receiver authenticates pushes via an `x-device-token`
header equal to the device's `pushToken`. The driver's programmatic path sets it via
ISAPI `additionalHeaders`, but many firmwares ignore custom headers, and the web-UI
method can't set headers at all. If real pushes get **401** in the receiver log,
disable token checking for the bench device:

```powershell
docker exec -it compose-postgres-1 psql -U app -d sam -c "UPDATE devices SET push_token = NULL WHERE id = '<DEVICE-UUID>';"
```

(Token check is skipped when `push_token` is NULL. Confirm the behavior on your firmware
and record it in doc 13.)

### B6. Trigger a real event and verify the full pipeline

1. At the device: present a card / face / press the doorbell — anything with linkage
   enabled in B5.4.
2. **Receiver terminal** logs an inbound `POST /hikvision/events`.
3. The event row is written and queued; the worker parses it. Verify via API:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/v1/events?limit=5" -Headers $H
   ```
4. Dashboard **Events** page shows it live (Socket.IO push, no refresh needed).
5. Raw payload inspection (useful for firmware quirks):
   ```powershell
   docker exec -it compose-postgres-1 psql -U app -d sam -c "SELECT id, event_type, received_at FROM access_events ORDER BY received_at DESC LIMIT 5;"
   ```

### B7. Sync a user + card to the device

Creating a user queues a sync job for every non-disabled device in the tenant; the worker
creates the person on the device and then pushes any active card credentials.

1. **Create the user:**
   ```powershell
   $user = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/users `
     -Headers $H -ContentType 'application/json' `
     -Body '{"employeeNo":"BENCH001","firstName":"Bench","lastName":"Tester"}'
   $user.id
   ```
2. **Attach a card** (no REST endpoint yet — insert directly; card number = the number
   printed on / encoded in your test card):
   ```powershell
   docker exec -it compose-postgres-1 psql -U app -d sam -c "INSERT INTO user_credentials (user_id, type, card_number) VALUES ('$($user.id)', 'card', '<CARD-NUMBER>');"
   ```
3. **Re-trigger sync** so the card is pushed (step 1's sync ran before the card existed):
   ```powershell
   Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/users/$($user.id)/resync" -Headers $H
   ```
4. **Check sync status:**

   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/v1/users/$($user.id)/sync-status" -Headers $H
   # expect syncStatus: synced for the bench device
   ```

   Failures: `GET /api/v1/sync/failures`, plus the worker terminal log.

5. **Physical test:** swipe that card at the device → door opens **without** the
   platform in the loop (credential lives on-device now), and the swipe event flows
   back through B6's pipeline.
6. **Verify on-device** (optional): device web UI → User Management should list
   `BENCH001`.

### B8. Cleanup / shutdown

- Remove the bench user from the device: `DELETE /api/v1/users/<id>` (queues removal
  sync), or delete via device web UI.
- Soft-delete the device record: `DELETE /api/v1/devices/<id>`.
- Stop apps: `Ctrl+C` in both terminals. Stop containers: `pnpm dev:down`
  (data volumes persist).

---

## Quick reference — known bench issues

| Issue                           | Detail                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Seeded "Lobby Mock" unlock 500s | Its password was encrypted under an old`DEVICE_SECRET_KEY`; register fresh devices instead |
| JWT expires                     | 15-minute TTL — re-run the B1 login block                                                  |
| Device push 401 at receiver     | Firmware ignores`additionalHeaders` → NULL the `push_token` (B5)                           |
| Device account lockout          | ~30 min lockout after repeated bad Digest logins — don't retry-loop wrong creds            |
| Events detected but not pushed  | Per-event "Notify Surveillance Center" linkage not enabled (B5.4)                          |
