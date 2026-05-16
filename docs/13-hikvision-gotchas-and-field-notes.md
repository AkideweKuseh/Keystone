# 13 — Hikvision Field Notes & Gotchas

A condensed catalogue of sharp edges that come up in real Hikvision integration work. Most of this is invisible from the official docs but burns a weekend the first time you hit it. Every engineer touching the driver layer (doc 05) should read this once.

> If you discover a new gotcha, add it here. This document is the team's collective memory.

---

## 1. ISAPI uses HTTP **Digest** auth, not Basic

The first request comes back `401 Unauthorized` with a `WWW-Authenticate: Digest` header. You compute the response (MD5 of credentials + nonce + URI etc.) and retry.

If your HTTP client doesn't handle Digest automatically:

| Language / client | What you need |
|-------------------|---------------|
| Node.js | `digest-fetch`, or hand-roll the Digest dance |
| Python `requests` | `requests.auth.HTTPDigestAuth(user, pw)` |
| Go `net/http` | A Digest auth round-tripper (no built-in) |
| `curl` | `--digest -u user:pass` (NOT `-u user:pass` alone — that's Basic) |

**Symptom of getting this wrong:** every request returns 401 forever. You'll be sure your password is wrong. It isn't.

The platform's `HikvisionDriver` HTTP client handles this in one place — application code never sees the 401/retry.

---

## 2. Event subscription — pick the right pattern, don't mix them up

There are two completely different ways to get events. They serve different needs.

### 2a. Alert stream (long-poll, server-sent)

```
GET /ISAPI/Event/notification/alertStream
```

The device **keeps the connection open** and pushes `multipart/mixed` chunks as events occur. Each part is XML (and sometimes a JPEG part for image events). You parse the multipart boundaries and pull each chunk out as it arrives.

- ✅ Works without configuring the device to know about your server.
- ✅ Good for development and one-off observers.
- ❌ One held-open socket per device — doesn't scale well.
- ❌ Reconnect logic is on you.
- ⚠️ Do NOT close the socket between events. It's a stream, not a series of requests.

### 2b. HTTP listener (push, device-initiated)

The device POSTs to your server. Configure via:
- **Web UI:** Configuration → Network → Advanced Settings → HTTP Listening
- **ISAPI:** `PUT /ISAPI/Event/notification/httpHosts` (see doc 12)

Body is typically `multipart/form-data` with an XML or JSON part and optional image parts, or a single JSON/XML body for simpler events.

- ✅ Scales — no held-open sockets on our side.
- ✅ Easier to put behind a load balancer.
- ✅ The platform's chosen mode.
- ❌ Requires reachability from device → us (hence VPN; see doc 08).

### What NOT to do

Do not poll `/ISAPI/Event/triggers` expecting live events — **that endpoint is for configuration**, not delivery. People reach for it because the name is suggestive. It's a trap.

---

## 3. SDK vs ISAPI — know what you're trading

We made the conscious decision to use **ISAPI only** for this platform. Here is why, and what we give up.

### HCNetSDK (Hikvision's binary SDK)

- ✅ More features. Smart events come through with richer detail. Two-way audio works. Some PTZ behaviors only available here.
- ❌ Official builds are **x86 / x86_64** only, Windows or Linux.
- ❌ No official **ARM** support. Some folks get aarch64 working unofficially; mileage varies and there is zero vendor support if it breaks.
- ❌ No official **macOS** support.
- ❌ Deployment pain: native `.so`/`.dll`, requires careful container packaging.
- ❌ Hard to scale horizontally — the SDK manages stateful per-device connections.
- ❌ Couples our build to a vendor binary.

### ISAPI (HTTP)

- ✅ Plain HTTP, works anywhere — any language, any architecture, any OS.
- ✅ Easy to containerize and scale.
- ✅ Mocking and testing are straightforward.
- ✅ Aligns with our vendor-abstraction goal (doc 05).
- ❌ Missing some smart-event detail.
- ❌ A few advanced features (notably two-way audio, certain PTZ) are not available.

**Rule of thumb:** if you don't need the SDK, don't use the SDK.

If we ever need a feature only the SDK exposes, we will add a minimal sidecar service that wraps just that capability — not rebuild the whole driver on SDK.

---

## 4. RTSP URLs — easy to get wrong

We don't stream video in this platform (out of scope, doc 01 §7), but engineers will be asked about RTSP often enough that the format belongs here.

```
rtsp://<user>:<pass>@<ip>:554/Streaming/Channels/<channel-id>
```

Channel-ID encoding:

| Value | Meaning |
|-------|---------|
| `101` | Channel 1, main stream |
| `102` | Channel 1, sub-stream |
| `103` | Channel 1, third stream (if supported) |
| `201` | Channel 2, main stream |
| `202` | Channel 2, sub-stream |
| ... | pattern continues |

⚠️ **URL-encode the password** if it contains special characters. A single `@` in a password will silently break the URL parser — the host portion will be wrong and you'll get cryptic connection failures. Same for `:`, `/`, `?`, `#`, `%`, etc. Use `encodeURIComponent` in JS, `urllib.parse.quote` in Python.

---

## 5. Smart events must be enabled **per channel**

Line crossing, intrusion detection, region entrance, face detection, etc. **will not fire just because the device supports them**. For each smart event on each channel you must:

1. Enable the feature on that channel.
2. Draw the detection region(s) / line(s) — without geometry, nothing triggers.
3. Configure the linkage to upload to HTTP (otherwise the event fires internally but isn't pushed).

In the web UI: Configuration → Smart → <feature> → per-channel.
Via ISAPI: PUT the relevant XML to `/ISAPI/Smart/<feature>/<channel>/...`.

**Symptom of getting this wrong:** capability discovery says the device supports the feature, but no events ever arrive. Always check linkage and geometry before assuming a bug.

The platform records per-channel feature state in `device_capabilities.raw` after discovery so we can surface "supported but not enabled" cases in the admin UI.

---

## 6. Firmware behavior varies — a LOT

Same model number, two firmware versions → two different sets of quirks. We have observed:

- Different valid values for the same XML enum.
- Endpoints that return JSON on newer firmware and XML on older (sometimes via `?format=json`, sometimes always XML regardless).
- Field names that change spelling (`employeeNo` vs `employeeNoString` on certain access-control models).
- Endpoints that 404 on older firmware and require a different path.
- Response envelopes that differ (with/without `<ResponseStatus>` wrappers).

### How we cope

- **Capability discovery on every device** (doc 05 §4). The result is stored in `device_capabilities` and consulted before each call.
- **Driver code paths gated on capabilities**, not on model strings. Model strings are unreliable; capability probes don't lie.
- **JSON-first with XML fallback**: try the JSON path; on `400`/`501`/`415` fall back to XML on the same logical endpoint.
- **Test against the actual firmware in production.** The bench device must match — or at least cover the matrix of — the firmware versions deployed in the field.
- **Official docs lag reality**, especially on newer smart features. When docs and the device disagree, the device is the source of truth.

⚠️ When we update firmware on a fleet, **rerun capability discovery** for every affected device. There's a `device:rediscover` job for this.

---

## 7. Character encoding gotcha

Newer firmware is **UTF-8** end to end. Older devices sometimes return **GB2312** in XML — most commonly visible in `<name>` fields for users or channels with non-ASCII characters (often Chinese).

**Symptom:** mojibake in user lists or channel names — characters like `ä¸­æ–‡` instead of proper text.

### How we handle it

- The driver's HTTP client inspects `Content-Type` headers; if `charset=` is missing, it sniffs the XML prolog (`<?xml version="1.0" encoding="GB2312"?>`).
- If GB2312 is declared, the client transcodes to UTF-8 before parsing.
- The transcoder is `iconv-lite` or equivalent — it MUST support GB2312, GBK, Big5, and UTF-8 at minimum.
- We always store UTF-8 in PostgreSQL.

If you see mojibake bug reports, encoding is the first place to look.

---

## 8. Quick Recap: Things to Check Before Filing a Bug

When something doesn't work with a Hikvision device, walk this list before opening a ticket:

1. **Auth type** — is the client using Digest, not Basic?
2. **Reachability** — can the platform's worker actually reach the device IP/port? VPN up?
3. **Capability** — does this device's `device_capabilities` row claim the feature is supported?
4. **Linkage** — is the event configured to upload to HTTP / notify center?
5. **Geometry** — for smart events, are regions/lines drawn on the channel?
6. **Firmware** — has firmware changed since last successful run? Has `device:rediscover` been re-run?
7. **Encoding** — does the response declare GB2312? Are we transcoding it?
8. **Format negotiation** — did the JSON path fail? Did we fall back to XML?
9. **Receiver liveness** — for push events, did the device's `/test` succeed? Is the receiver returning 200 fast enough?
10. **Token / cert** — for push events, is the per-device token current and valid?

---

## 9. Reference: Endpoints We Actively Use

Cross-listed with doc 05 §3.3, with the gotchas annotated:

| Operation | Endpoint | Gotcha |
|-----------|----------|--------|
| Identity | `GET /ISAPI/System/deviceInfo` | First call we make; if Digest is broken, this fails first |
| HTTP host config | `GET / PUT /ISAPI/Event/notification/httpHosts` | Sometimes the device has multiple slots; we always write to id=1 unless that's taken |
| Test push | `POST /ISAPI/Event/notification/httpHosts/1/test` | Returns `ok` even if event linkage is broken — only proves network path |
| Alert stream | `GET /ISAPI/Event/notification/alertStream` | Hold the connection open. We only use this for diagnostic tools, not the main path |
| User upsert | `POST /ISAPI/AccessControl/UserInfo/Record` | JSON works on newer firmware (`?format=json`); XML always works |
| Card upsert | `POST /ISAPI/AccessControl/CardInfo/Record` | Some firmwares reject if user doesn't exist yet — upsert user first |
| Face upload | `POST /ISAPI/Intelligent/FDLib/FaceDataRecord` | Multipart; some firmwares cap at 200 KB per image |
| Door unlock | `PUT /ISAPI/AccessControl/RemoteControl/door/{n}` | XML body. JSON variant exists on some firmwares but is inconsistent |
| Event query (pull) | `POST /ISAPI/AccessControl/AcsEvent` | Time-bounded. Use small windows; large ranges error out or truncate silently |

---

## 10. Field-Notes Acceptance Checklist

When you write a new driver method or fix a Hikvision-specific bug, before merging:

- ☐ Have you confirmed the behavior on at least two firmware versions (or noted that you couldn't)?
- ☐ Is the call gated on `device_capabilities` rather than hardcoded by model?
- ☐ If you added a new endpoint, is it listed in §9 above and in doc 05 §3.3?
- ☐ If the response format can differ, do you handle both JSON and XML paths?
- ☐ If the field is text, is it correctly decoded as UTF-8 (with GB2312 fallback)?
- ☐ If it's an event-related change, did you re-run the receiver smoke test?
- ☐ Did you update this document if you found a new sharp edge?
