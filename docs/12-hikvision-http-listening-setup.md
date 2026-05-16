# 12 — Hikvision HTTP Listening: Setup Procedure

This document is the operational how-to for pointing a Hikvision device at our event receiver. It is the concrete procedure that underpins the architecture described in [`07-event-processing-realtime.md`](./07-event-processing-realtime.md).

> **Where this fits:** Our platform's receiver endpoint (`POST /hikvision/events`) is the "HTTP host" the device pushes to. Setting that linkage is a per-device operation that the middleware automates at registration time, but operators also need to be able to do it manually for troubleshooting and bench setup.

---

## 1. Concept

When an alarm or event is triggered on a Hikvision device **and** the device's alarm/event linkage is configured, the device uploads alarm/event information automatically to an HTTP host. The platform's job is to:

1. Stand up that HTTP host (our receiver — see doc 07).
2. Tell the device where to post.
3. Trust the device's push and verify the channel.

There are two ways to configure the device-side linkage:

- **Method 1 — Web UI** (manual, used for one-off bench setup).
- **Method 2 — ISAPI** (programmatic, used by the platform).

Both configure the *same* underlying device setting. ISAPI is what the platform uses in production; the web UI is a fallback when ISAPI calls fail or when verifying the device's current configuration during incident triage.

---

## 2. Express / NestJS Receiver — the "HTTP host"

The receiver runs as part of `apps/receiver` (see doc 09 §4). Conceptually it is exactly an Express webhook endpoint that the camera's internal software (running at the device's IP) posts to. The camera's HTTP-listening config is a one-way pointer at our endpoint — the device does the pushing.

Receiver endpoint contract (full spec in doc 04 §8):

| Property | Value |
|----------|-------|
| URL path | `/hikvision/events?d=<deviceId>` |
| Method | `POST` |
| Auth | `X-Device-Token: <per-device-token>` (or mTLS) |
| Content-Types accepted | `application/json`, `application/xml`, `multipart/form-data` |
| Response | `200 OK` within 100 ms p95 |
| Body persisted | Raw, into `access_events.raw_payload` |

⚠️ The receiver MUST respond `200 OK` quickly. Hikvision devices retry aggressively on non-200 or timeout — see [Field Notes §2 in doc 13](./13-hikvision-gotchas-and-field-notes.md) and the architectural note in [doc 07 §2](./07-event-processing-realtime.md).

---

## 3. Method 1 — Web UI Configuration (manual, for bench / troubleshooting)

### Step 1: Log into the device
Open `http://<device-ip>` in a browser. Log in as the device admin.

### Step 2: Open the HTTP Listening page
Navigate: **Configuration → Network → Advanced Settings → HTTP Listening**.

The page has a table titled **HTTP Data Transmission** with columns:
`Destination IP or Host Name | URL | Protocol | Port | Test`.

### Step 3: Fill in the row

| Field | Value (production) | Value (local dev) |
|-------|--------------------|-------------------|
| Destination IP or Host Name | `events.smartaccess.<your-domain>` | `<your-laptop-ip>` |
| URL | `/hikvision/events?d=<deviceId>` | same |
| Protocol | `HTTP` (or `HTTPS` if certs are configured) | `HTTP` |
| Port | `443` for HTTPS, `80` for HTTP, or the receiver port directly | `8088` (or whatever you bound) |

Save the row.

### Step 4: Click **Test**
The device performs a probe POST. A successful test shows a **"The service is available"** dialog. A failure means the device cannot reach the host — check VPN routing, firewall, and that the receiver is bound to all interfaces.

### Step 5: Verify a real event arrives
Trigger any configured event (e.g., a face capture, a card swipe, a tamper). The receiver should log the inbound POST and write a row to `access_events`. Confirm with:

```sql
SELECT id, device_id, event_type, received_at
FROM access_events
WHERE device_id = '<uuid>'
ORDER BY received_at DESC
LIMIT 5;
```

### Step 6: Bench verification with NetAssist (optional)
If you want to see the raw payload before standing up the receiver, point the device at a TCP listener like NetAssist:

1. NetAssist → TCP Server → bind your local IP and the chosen port (e.g., 8088).
2. Configure the device's HTTP Listening to point at that IP/port.
3. Trigger an event.
4. NetAssist shows the raw HTTP request body. This is what your receiver will see.

Two payload shapes you can expect on the wire:

- **Face capture / Access events** typically arrive as `application/json` with fields like `ipAddress`, `portNo`, `protocol`, `macAddress`, `channelID`, `dateTime`, `activePostCount`, `eventType`, `eventState`, `eventDescription`, and an `AccessControllerEvent`/`FaceCapture` array containing per-event data and optional base64 imagery.
- **TMPA / temperature / generic alarms** typically arrive as `application/xml` shaped like `<EventNotificationAlert>` with `<ipAddress>`, `<portNo>`, `<protocol>`, `<macAddress>`, `<channelID>`, `<dateTime>`, `<activePostCount>`, `<eventType>`, `<eventState>`, `<eventDescription>`, plus event-specific child elements (e.g., `<DetectionRegionList>` for region-based events).

Both must be accepted by the receiver. See doc 07 §4 (Event Processing Worker) for the classification taxonomy.

---

## 4. Method 2 — ISAPI Configuration (programmatic, what the platform does)

This is what `HikvisionDriver.configureHttpPush()` (doc 05 §5) does under the hood.

### Step 1: Read current HTTP host configuration

```
GET /ISAPI/Event/notification/httpHosts
Auth: HTTP Digest
```

Response (XML, abbreviated):

```xml
<HttpHostNotificationList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <HttpHostNotification version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <id>1</id>
    <url>/</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>XML</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>0.0.0.0</ipAddress>
    <portNo>80</portNo>
    <userName></userName>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>
```

Use this to confirm there is one (or more) host slot available and to read back current settings before overwriting.

### Step 2: Write the configuration

```
PUT /ISAPI/Event/notification/httpHosts
Auth: HTTP Digest
Content-Type: application/xml
```

Body:

```xml
<HttpHostNotificationList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <HttpHostNotification version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <id>1</id>
    <url>/hikvision/events?d=&lt;deviceId&gt;</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>XML</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>10.x.x.x</ipAddress>
    <portNo>8088</portNo>
    <userName></userName>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>
```

> Replace `<deviceId>` with the device's UUID in the platform DB; URL-encode the angle brackets in the actual request.

A successful response is `200 OK` with `<ResponseStatus>` `<statusCode>1</statusCode>` `<statusString>OK</statusString>`.

### Step 3: Test the connection from the device

```
POST /ISAPI/Event/notification/httpHosts/1/test
Auth: HTTP Digest
```

Successful response:

```xml
<HttpHostTestResult version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <errorDescription>ok</errorDescription>
</HttpHostTestResult>
```

If `errorDescription` is anything other than `ok`, the device could not reach our receiver. Common causes:
- VPN peer not established
- Firewall blocking the device → receiver path
- Wrong port
- Receiver bound to localhost instead of all interfaces (very common in dev)

### Step 4: Validate end-to-end with a real event
Trigger an event on the device and verify a row appears in `access_events`, and a corresponding job in `event-process`. See doc 07 §4.

---

## 5. Per-Device Token (Auth at the Receiver)

Hikvision's stock HTTP-listening config does NOT include a secret header. Our deployment layers one on:

- **Option A (preferred)**: put the device's per-device token in the URL path or query string:
  `https://events.smartaccess/hikvision/events?d=<deviceId>&t=<token>`
  The receiver validates `t` and rotates it weekly. Tokens are stored hashed in `devices.metadata`.
- **Option B (high security)**: use mTLS. Our internal CA issues a per-device cert, loaded into the device's TLS trust store (if firmware supports it — many do via the **Configuration → Network → Advanced Settings → HTTPS** page).
- **Option C (network-only)**: rely solely on the WireGuard tunnel for authenticity. Receiver only listens on the VPN interface. Acceptable for low-risk deployments.

Whichever option is chosen, the receiver writes the authenticated `device_id` onto the event row — never trust the `ipAddress` / `macAddress` fields inside the payload as identity.

---

## 6. What to Configure on the Device for Useful Events

Configuring the HTTP host is necessary but not sufficient. The device also needs the **event linkage** turned on per event source. Common ones:

| Event source | Where in web UI (typical) | ISAPI |
|--------------|---------------------------|-------|
| Card swipe / Access event | Configuration → Access Control → Event | `/ISAPI/AccessControl/event/...` |
| Face capture | Configuration → Smart → Face Capture | `/ISAPI/Smart/FaceCapture/...` |
| Line crossing / Intrusion | Configuration → Smart → respective feature | `/ISAPI/Smart/LineDetection/...` etc. |
| Tamper | Configuration → Event → Basic Event → Video Tampering | `/ISAPI/System/Video/inputs/channels/<n>/tamperDetection` |
| Door status | Configuration → Access Control → Door Parameters | `/ISAPI/AccessControl/Door/...` |

For each, the **"Notify Surveillance Center"** or **"Upload to HTTP"** linkage must be enabled or events will be detected on-device but not pushed. The platform's capability discovery step (doc 05 §4) records which events are enabled.

⚠️ See [Field Notes §5 in doc 13](./13-hikvision-gotchas-and-field-notes.md) — smart events have to be enabled per channel, with regions drawn, before they will fire.

---

## 7. Troubleshooting Quick Table

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| Device "Test" button shows error | Network path broken | Ping device→host over VPN; check Nginx/receiver bind address |
| Test passes but no real events arrive | Event linkage not configured | Check per-event "Notify Surveillance Center" or upload-to-HTTP toggles |
| Events arrive but receiver returns 400 | Content-type or auth misconfigured | Receiver logs; check `X-Device-Token` or mTLS path |
| Events arrive then stop after some time | Device buffer flushed; receiver was slow | Receiver p95 metric; queue depth alarm |
| Duplicate events in DB | Receiver was slow → device retried | Verify dedup_key index is present and used |
| Garbled non-ASCII in payload | Older firmware using GB2312 | See [Field Notes §7 in doc 13](./13-hikvision-gotchas-and-field-notes.md) |
| Different fields than docs say | Firmware variation | See [Field Notes §6 in doc 13](./13-hikvision-gotchas-and-field-notes.md); check `device_capabilities` |

---

## 8. Acceptance Checklist (Per-Device HTTP Listening Setup)

When the platform onboards a device, it MUST verify all of the following before marking the device fully operational:

- ☐ `GET /ISAPI/Event/notification/httpHosts` succeeds (proves Digest auth works)
- ☐ `PUT /ISAPI/Event/notification/httpHosts` written with our receiver URL, IP, port
- ☐ `POST /ISAPI/Event/notification/httpHosts/1/test` returns `errorDescription: ok`
- ☐ A synthetic event triggered on the device appears in `access_events` within 5 s
- ☐ A duplicate-payload simulation results in exactly one row (dedup works)
- ☐ Receiver token is present in URL or mTLS cert is loaded
- ☐ The reconciler periodically re-reads `httpHosts` and re-PUTs if drifted (devices lose this config on factory reset)
