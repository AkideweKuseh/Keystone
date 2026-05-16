# 08 — Security & Networking

Access-control infrastructure is high-value: a breach can mean physical break-ins. Treat security as a Tier-0 concern from commit zero.

---

## 1. Threat Model (concise)

| Threat | Mitigation |
|--------|------------|
| Public exposure of devices | WireGuard VPN, no public device ports |
| Credential theft from DB | AES-GCM at rest, KMS-managed keys |
| MITM between platform ↔ device | WireGuard tunnel, optional TLS in front of ISAPI where supported |
| MITM between client ↔ platform | TLS 1.2+ everywhere, HSTS |
| Stolen JWT | Short TTL + refresh rotation + IP/UA binding |
| Compromised admin account | MFA mandatory for `admin`/`owner` roles |
| Privilege escalation | RBAC + scope checks per route + audit log |
| Replay attacks on events | Device tokens rotated, dedup_key, time-window check |
| Injection (SQL/XSS/XML) | Parameterized queries, output encoding, XML parser hardened (disable DTD/external entities) |
| Insider deletion | Append-only audit log; sensitive ops require MFA reverification |
| Prompt-injection from device payloads | Treat all device data as untrusted; never interpret as instructions |

---

## 2. Network Architecture

```
                ┌────────────────────────────────────────┐
   Internet ─►  │  Nginx (TLS termination, WAF, rate    │
                │  limiting). Public surface only.       │
                └─────────┬──────────────────────────────┘
                          │  HTTP over private net
                ┌─────────▼──────────┐
                │  API + Receiver    │  (Docker network)
                │  Workers           │
                │  Postgres, Redis   │
                └─────────┬──────────┘
                          │  WireGuard
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Site A devices    Site B devices    Site C devices
   (private)         (private)         (private)
```

### 2.1 WireGuard

- **Hub** is the platform's worker network (concentrator instance).
- **Spokes** are per-site gateway boxes (small Linux mini-PC).
- Each site has its own subnet, e.g. `10.100.<site>.0/24`.
- Devices reach only the hub; cross-site traffic is denied via firewall rules.
- Peer provisioning is scripted (one command issues a new key pair and prints a config).

### 2.2 No public device ports
This is non-negotiable. The platform refuses to register a device whose `ip_address` is in a public range unless the operator confirms a deliberate override (rare, e.g., a dedicated MPLS link).

### 2.3 TLS / HTTPS
- Public traffic terminates at Nginx with a Let's Encrypt cert (or a corp PKI cert).
- HSTS preload, modern cipher suite list, OCSP stapling.
- mTLS supported on the receiver endpoint for high-security deployments.

---

## 3. Identity & Authentication

### 3.1 Admin users (humans)
- Argon2id password hashing (`memoryCost ≥ 64 MB`).
- MFA: TOTP (mandatory for `owner`/`admin`).
- JWT access token TTL: **15 min**. Refresh token TTL: **7 days**, rotated on use.
- Refresh tokens stored hashed in DB with `device_fingerprint`. Revocable.
- Account lockout after 5 failed attempts, exponential cooldown.

### 3.2 API keys (machines)
- 32-byte random, displayed once, stored as bcrypt hash.
- Scoped (e.g., `events:read`, `users:write`).
- Rate-limited per key.
- Rotatable; revocation is immediate.

### 3.3 Devices
- Each device has a short-lived push token (`X-Device-Token`) rotated weekly.
- For high-security deployments: client cert (mTLS) signed by our internal CA.

---

## 4. Authorization (RBAC)

| Role | Can |
|------|-----|
| `owner` | Everything within their tenant, incl. billing, role grants |
| `admin` | Manage devices, users, groups, view audit log |
| `operator` | Unlock doors (MFA-recently-verified), view live events |
| `viewer` | Read-only: users, devices, events, reports |

Implementation:
- Every route declares required scopes via a `@Scopes('users:write')` decorator.
- Guard rejects with `403 FORBIDDEN` if the JWT's scopes are insufficient.
- Sensitive operations (door unlock, mass user delete) require **MFA-recently-verified** within the last 5 minutes; otherwise prompt step-up.

---

## 5. Secrets Management

| Secret | Storage |
|--------|---------|
| DB password | env, injected by orchestrator (Docker secrets / K8s Secret) |
| JWT signing keys | KMS-backed; never on disk in plaintext |
| Device passwords | AES-GCM encrypted in `devices.password_encrypted`; data key wrapped by KMS |
| API key plaintext | Shown once at creation; never persisted |
| TLS private keys | Mounted from a secrets volume; tight file permissions |

The application loads secrets at boot via a `SecretsProvider` that supports:
- `env` (dev)
- `aws-kms`
- `hashicorp-vault`
- `gcp-kms`

No environment-specific code in domain libs — the provider is injected.

---

## 6. Data Protection

- **At rest:** Postgres data volume encrypted (`luks` or cloud-managed). S3 bucket SSE-KMS.
- **In transit:** TLS everywhere internet-facing. WireGuard for device-facing.
- **PII minimization:** store only necessary fields. Face images stored as object keys, never inlined in DB.
- **Right to erasure:** `DELETE /api/v1/users/:id?hard=true` triggers a workflow that deletes user, credentials, face images, and pseudonymizes historical events (`user_id → NULL`, `employee_no → 'redacted-<hash>'`). Audit-logged.

---

## 7. Input Validation & Injection Defenses

- All HTTP inputs validated by Zod / class-validator schemas at the controller boundary.
- All DB access via parameterized queries (Prisma/TypeORM enforce this).
- XML parser configured to **disable** external entities, DTDs, and includes (XXE prevention). Use `fast-xml-parser` with safe options or `libxmljs` with appropriate flags.
- File uploads (face images): MIME sniff, max size 2 MB, dimension check, re-encode through `sharp` (drops EXIF + sanitizes).
- Outgoing HTTP (drivers): timeouts, response-size cap, no redirects to unknown hosts.

---

## 8. Audit Logging

Every action that mutates state OR exercises a privilege MUST write to `audit_log`:

- Login / logout / MFA challenge
- User CRUD
- Device CRUD
- Permission grants / revokes
- Door unlock (with door, user who unlocked, justification optional)
- API key creation / revocation
- Role changes

Audit log is **append-only** at the DB level (app role lacks `UPDATE`/`DELETE`). Exports to immutable S3 monthly.

---

## 9. Operational Security

- **Least privilege everywhere.** The app role can `SELECT/INSERT/UPDATE` on most tables but only `INSERT` on `audit_log`.
- **Separation of duties.** Engineers don't have prod DB shell access; ops engineers don't push code; reviewers can't merge their own PRs.
- **Dependency hygiene:** Renovate / Dependabot enabled; `npm audit` in CI; SBOM published per release.
- **Secret scanning:** `gitleaks` in pre-commit and CI.
- **SAST:** ESLint security plugin + Semgrep rules in CI.
- **DAST:** OWASP ZAP baseline scan against staging on every release.
- **Pen test:** annually by an external firm; quarterly internal red-team exercises.

---

## 10. Incident Response

- **Detection:** Alertmanager paging based on metrics (auth failure spike, sync failure spike, DLQ growth, etc.).
- **Runbooks** in `docs/runbooks/`:
  - `db-failover.md`
  - `redis-failover.md`
  - `compromised-admin-account.md`
  - `mass-device-offline.md`
  - `key-rotation.md`
- **Comms:** an incident channel template (Slack/Teams), on-call rotation in PagerDuty, status page.
- **Postmortems:** blameless, within 7 days of resolution.

---

## 11. Compliance Posture (typical asks)

| Control area | How we satisfy |
|--------------|----------------|
| SOC 2 Security | Audit log, access reviews, change management, MFA, encryption |
| SOC 2 Availability | SLOs, HA Postgres, runbooks, backup tests |
| GDPR | Data minimization, right to erasure, lawful basis recorded |
| ISO 27001 | Documented policies, risk register, supplier review |

---

## 12. Security Acceptance Checklist

- 🔒 ☐ No device exposed to public internet (verified by external scan)
- 🔒 ☐ WireGuard peers documented and rotated quarterly
- 🔒 ☐ All passwords in DB are encrypted with AES-GCM, key in KMS
- 🔒 ☐ MFA enforced for `owner`/`admin` roles
- 🔒 ☐ JWT TTLs configured (15m access, 7d refresh)
- 🔒 ☐ Refresh tokens rotate on use; revocation list honored
- 🔒 ☐ RBAC scopes enforced on every route (proven by test)
- 🔒 ☐ XML parser hardened against XXE
- 🔒 ☐ Face uploads re-encoded and EXIF stripped
- 🔒 ☐ Audit log append-only at DB level
- 🔒 ☐ Secrets scanner in CI
- 🔒 ☐ Dependency scan in CI
- 🔒 ☐ Backups encrypted and restore drill performed quarterly
- 🔒 ☐ Pen test scheduled annually
- 🔒 ☐ Incident runbooks written and rehearsed
