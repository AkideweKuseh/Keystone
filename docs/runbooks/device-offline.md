# Runbook: Device Offline Alert

**Alert:** `device_reachable{device_id="..."} == 0` for > 30 min  
**Severity:** Warning (single device) / Critical (> 20% of fleet)

## Diagnosis

1. Check device status in DB:
   ```sql
   SELECT id, name, ip_address, status, last_seen_at FROM devices WHERE id = '<device_id>';
   ```
2. Check health-check worker logs for the device:
   ```
   grep 'device_id=<id>' /var/log/worker.log | tail -50
   ```
3. Ping the device IP from the WireGuard concentrator:
   ```bash
   ping -c 5 <device_ip>
   ```
4. Check WireGuard peer status: `wg show`

## Resolution

| Root cause                   | Action                                                      |
| ---------------------------- | ----------------------------------------------------------- |
| WireGuard peer down          | Re-establish VPN on site gateway; check `wg-quick up wg0`   |
| Device rebooted              | Wait 2–3 min for device to boot; health-check auto-recovers |
| Device IP changed            | Update device record via `PATCH /api/v1/devices/:id`        |
| Device power outage          | Coordinate with on-site staff                               |
| Credential changed on device | `PATCH /api/v1/devices/:id` with new password               |

## Recovery Verification

- `GET /api/v1/devices/:id` shows `status: "online"`
- Reconciler auto-enqueues any pending user-sync jobs within 5 min
