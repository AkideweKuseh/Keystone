# Runbook: Stand Up a Keystone Branch

**Goal:** get Keystone running on a branch PC, connected to that branch's
Hikvision doors, in ~10 minutes. One PC per branch. See ADR 0006 for the model.

## Prerequisites

- A **dedicated, always-on** Windows PC on the branch LAN (not a shared
  front-desk PC — if it sleeps, syncing stops). A mini-PC is ideal.
- **Docker Desktop** (or Docker Engine via WSL2) installed and running.
- The Keystone repo on the box (git clone, or a copied folder).
- Network: the PC can reach the branch's terminals (`ping <device-ip>`, device
  web UI loads) and has outbound internet to the gym database.

## Steps

### 1. Create the branch config

From the repo root:

```powershell
Copy-Item .env.branch.example .env.branch
notepad .env.branch
```

Fill in, at minimum:

- `BRANCH_ID` / `BRANCH_NAME` — must match this branch's id in the gym platform.
- Every `CHANGE_ME` secret (Postgres password, JWT secrets, MinIO password).
- `DEVICE_SECRET_KEY` — keep the same value across restarts, or previously
  stored device passwords can't be decrypted.

(The `GYM_DATABASE_URL` block is for the gym poller, added in a later slice —
leave it until then.)

### 2. Start it

Double-click **`infra\launcher\Keystone-Start.bat`** (or run
`infra\launcher\keystone-start.ps1`). It:

- checks Docker is running,
- verifies `.env.branch` exists (creates it from the template and stops if not),
- brings up the stack (first run builds images — a few minutes),
- waits for the API health check, then opens the dashboard.

First run only, seed the admin account:

```powershell
docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.branch `
  exec api node node_modules/.bin/ts-node prisma/seed.ts
```

Log in at `http://localhost:<DASHBOARD_PORT>` (default 3002) with the seeded
admin.

### 3. Open the receiver port for device push

The terminals POST events to the receiver. Allow it through Windows Firewall
(PowerShell **as Administrator**), using the `RECEIVER_PORT` from `.env.branch`:

```powershell
New-NetFirewallRule -DisplayName "Keystone receiver" -Direction Inbound `
  -Protocol TCP -LocalPort 4002 -Action Allow
```

### 4. Register this branch's devices

In the dashboard → **Devices → Register Device**, add each terminal (vendor
`hikvision`, its LAN IP, port 80, admin credentials). Confirm each goes
**online**. Then configure each device's HTTP Listening to push events to
`http://<this-PC-LAN-IP>:<RECEIVER_PORT>/hikvision/events?d=<device-id>`
(see `docs/guides/bench-testing-real-device.md`).

## Everyday operations

| Action                  | How                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Start / reconcile       | `Keystone-Start.bat` (safe to re-run)                                                        |
| Stop (keep data)        | `Keystone-Stop.bat`                                                                          |
| View API logs           | `docker compose -f infra/compose/docker-compose.prod.yml --env-file .env.branch logs -f api` |
| Update to a new version | `git pull`, then `keystone-start.ps1 -Rebuild`                                               |
| Wipe local data (rare)  | `keystone-stop.ps1 -Wipe` (DESTROYS the local DB)                                            |

## Troubleshooting

| Symptom                           | Likely cause / fix                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Launcher: "Docker is not running" | Start Docker Desktop, retry                                                             |
| Launcher stops at config step     | Fill in `.env.branch`, re-run                                                           |
| API never healthy                 | First-run build/migration still going — check `logs -f api`                             |
| Devices stay offline              | Wrong credentials, or PC can't reach the device (see `docs/runbooks/device-offline.md`) |
| Events not arriving               | Receiver firewall rule missing, or device HTTP Listening not configured                 |

## Notes

- **Resilience:** if the WAN or gym DB is down, doors keep working (enrollment
  lives on the device) and Keystone catches up when connectivity returns.
- **Updates across branches:** the launcher builds locally today. Once CI
  publishes images to a registry, switch the launcher to pull prebuilt images
  so branch boxes don't compile.
