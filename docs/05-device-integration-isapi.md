# 05 — Device Integration & ISAPI Driver Layer

This document defines the vendor abstraction, the Hikvision ISAPI implementation, and how we deal with the well-known reality that firmware behavior varies wildly across models.

---

## 1. The Driver Interface

`libs/drivers/core/AccessDeviceDriver.ts`

```ts
export interface AccessDeviceDriver {
  // Identity & health
  getDeviceInfo(): Promise<DeviceInfo>;
  ping(): Promise<HealthSnapshot>;

  // Capability discovery
  discoverCapabilities(): Promise<DeviceCapabilities>;

  // User management (on-device)
  upsertUser(user: DeviceUserPayload): Promise<void>;
  deleteUser(employeeNo: string): Promise<void>;
  listUsers(opts?: ListOpts): Promise<DeviceUserPayload[]>;

  // Credentials
  upsertCard(employeeNo: string, card: CardPayload): Promise<void>;
  upsertFace(employeeNo: string, image: Buffer): Promise<void>;
  deleteCard(employeeNo: string, cardNumber: string): Promise<void>;

  // Doors
  unlockDoor(doorIndex: number, durationSec?: number): Promise<void>;
  lockDoor(doorIndex: number): Promise<void>;

  // Events (pull mode — push handled by event receiver)
  pullEvents(since: Date, limit: number): Promise<DeviceEvent[]>;
}
```

Important properties of the interface:

- **No HTTP, XML, or vendor terms leak** into the signature.
- All inputs/outputs are domain DTOs.
- All methods are async and MUST throw `DriverError` subclasses with stable codes:
  - `DriverError.Unreachable`
  - `DriverError.Timeout`
  - `DriverError.AuthFailed`
  - `DriverError.UnsupportedFeature`
  - `DriverError.BadResponse`
  - `DriverError.RateLimited`
  - `DriverError.Conflict`
  - `DriverError.Internal`

The sync engine maps these to retry policies (see `06-sync-engine.md` §5).

---

## 2. Driver Selection

```ts
const driver = driverRegistry.resolve(device);
// internally:
// switch (device.vendor) {
//   case 'hikvision': return new HikvisionDriver(device, deps);
//   case 'mock':      return new MockDriver(device, deps);
// }
```

The registry caches one driver instance per device id. Drivers are stateless aside from the HTTP client and credentials.

---

## 3. HikvisionDriver

### 3.1 Construction

```ts
new HikvisionDriver({
  ip, port, username, password,    // password decrypted just-in-time
  timeoutMs, capabilities          // from device_capabilities row
}, { logger, metrics, tracer });
```

### 3.2 HTTP Layer

- **Digest Authentication** (Hikvision requires it).
- Single `got`-based client with:
  - `digest-fetch` or a hand-rolled Digest handler
  - per-request timeout (`DEVICE_REQUEST_TIMEOUT_MS`)
  - connection reuse (keep-alive)
  - automatic content negotiation: try JSON (`?format=json` or `Accept: application/json`), fall back to XML
  - response size cap to avoid memory issues

### 3.3 Endpoint Map (Hikvision ISAPI)

| Operation | Method | Path | Notes |
|-----------|--------|------|-------|
| Device info | GET | `/ISAPI/System/deviceInfo` | Discovery, identification |
| Capabilities | GET | `/ISAPI/AccessControl/UserInfo/capabilities` | Used to populate `device_capabilities` |
| Upsert user | POST | `/ISAPI/AccessControl/UserInfo/Record?format=json` | JSON-capable firmwares |
| Upsert user (legacy) | POST | `/ISAPI/AccessControl/UserInfo/Record` | XML fallback |
| Delete user | PUT | `/ISAPI/AccessControl/UserInfoDetail/Delete?format=json` | Body lists `employeeNo`s |
| List users | POST | `/ISAPI/AccessControl/UserInfo/Search?format=json` | Paginated |
| Add/Update card | POST | `/ISAPI/AccessControl/CardInfo/Record?format=json` | |
| Upload face | POST | `/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json` | Multipart |
| Door unlock | PUT | `/ISAPI/AccessControl/RemoteControl/door/{doorIndex}` | XML body `<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>` |
| Event search | POST | `/ISAPI/AccessControl/AcsEvent?format=json` | Time-bounded query |
| Capabilities (alarm push) | GET | `/ISAPI/Event/notification/httpHosts/capabilities` | For configuring HTTP listening |
| Configure HTTP push | PUT | `/ISAPI/Event/notification/httpHosts` | Tell device to push to our receiver |

> ⚠️ The exact path and body shape vary by firmware. Always check `device_capabilities` before choosing a path. When in doubt, the driver tries the JSON path first and falls back to XML on `400`/`501`.

### 3.4 Example: `unlockDoor`

```ts
async unlockDoor(doorIndex: number, durationSec = 5): Promise<void> {
  const body = `
    <RemoteControlDoor version="2.0">
      <cmd>open</cmd>
    </RemoteControlDoor>`;
  try {
    await this.http.put(
      `/ISAPI/AccessControl/RemoteControl/door/${doorIndex}`,
      { body, headers: { 'Content-Type': 'application/xml' } }
    );
  } catch (err) {
    throw this.translateError(err);  // → DriverError.*
  }
}
```

### 3.5 Example: `upsertUser` (JSON path)

```ts
async upsertUser(u: DeviceUserPayload): Promise<void> {
  const body = {
    UserInfo: {
      employeeNo: u.employeeNo,
      name: `${u.firstName} ${u.lastName}`.trim(),
      userType: 'normal',
      Valid: {
        enable: true,
        beginTime: u.validFrom ?? '2000-01-01T00:00:00',
        endTime:   u.validTo   ?? '2037-12-31T23:59:59',
      },
      doorRight: u.doorIndexes.join(','),
      RightPlan: u.doorIndexes.map(idx => ({ doorNo: idx, planTemplateNo: '1' })),
    }
  };
  await this.http.post('/ISAPI/AccessControl/UserInfo/Record?format=json', { json: body });
}
```

---

## 4. Capability Discovery

When a device is registered:

1. `getDeviceInfo` → record model + firmware.
2. Probe known endpoints with `HEAD`/`OPTIONS` or capability endpoints.
3. Detect JSON support by attempting a benign JSON query.
4. Write the result into `device_capabilities`.

The sync engine consults this row before selecting a code path. If discovery fails, the device is marked `degraded` and re-attempted hourly.

---

## 5. Push Configuration on Device

After registration, the platform configures the device to push events to our receiver:

```ts
await driver.configureHttpPush({
  url: `https://events.smartaccess.internal/hikvision/events?d=${deviceId}`,
  token: deviceShortLivedToken,    // verified at receiver via X-Device-Token
  events: ['AccessControllerEvent', 'AlarmEvent', 'DoorStatus'],
});
```

⚠️ Devices retry aggressively on non-200. The receiver MUST `200` as fast as possible (see `07-event-processing-realtime.md`).

---

## 6. Error Translation

```ts
private translateError(err: unknown): DriverError {
  if (err is timeout)               return new DriverError.Timeout();
  if (err is ECONNREFUSED/EHOSTUNREACH) return new DriverError.Unreachable();
  if (statusCode === 401 || 403)    return new DriverError.AuthFailed();
  if (statusCode === 404)           return new DriverError.UnsupportedFeature();
  if (statusCode === 409)           return new DriverError.Conflict();
  if (statusCode === 429)           return new DriverError.RateLimited();
  if (statusCode >= 500)            return new DriverError.BadResponse();
  return new DriverError.Internal(err);
}
```

---

## 7. MockDriver

`libs/drivers/mock/MockDriver.ts` exists so we can:

- Run integration tests without hardware.
- Demo the platform with simulated devices.
- Reproduce error conditions deterministically (configure it to fail every Nth call, etc.).

Tests MUST run against MockDriver in CI. A nightly job runs the same tests against a physical Hikvision unit on a dev bench.

---

## 8. Adding a New Vendor (Suprema example)

1. Create `libs/drivers/suprema/`.
2. Implement `AccessDeviceDriver` against Suprema's BioStar / G-SDK.
3. Add `'suprema'` to the `vendor` `CHECK` constraint (migration).
4. Add capability probes that make sense for Suprema.
5. Add integration tests using a mock or sandbox device.
6. Register in `driverRegistry`.
7. Update the dashboard's "register device" form vendor dropdown.

The rest of the platform requires no changes. That is the whole point.

---

## 9. Acceptance Checklist (Driver Layer)

- ☐ `AccessDeviceDriver` interface compiles with `strict: true`, no `any`.
- ☐ `HikvisionDriver` passes the full integration test suite against MockDriver.
- ☐ All error paths map to a `DriverError` subclass — never raw exceptions.
- ☐ HTTP Digest auth verified against a physical Hikvision device.
- ☐ JSON path used when capability says yes; XML fallback exercised.
- ☐ Capability discovery populates `device_capabilities` correctly.
- ☐ Push configuration writes a per-device token that the receiver validates.
- ☐ Door unlock confirmed end-to-end on a physical device.
- ☐ MockDriver supports configurable failure injection for testing.
