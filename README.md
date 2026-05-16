# Smart Access Middleware Platform — Implementation Documentation

> Vendor-abstraction middleware and synchronization engine for Hikvision (and future multi-vendor) access-control devices.

This documentation set is the engineering blueprint for building the platform end-to-end. It is organized so that each concern lives in its own file, and each file can be read independently by the team member responsible for it.

---

## 📂 Documentation Index

| # | File | Audience | Purpose |
|---|------|----------|---------|
| 00 | [README.md](./README.md) | Everyone | This index |
| 01 | [01-architecture-overview.md](./01-architecture-overview.md) | Architects, Tech Leads | System architecture, components, data flow |
| 02 | [02-tech-stack-and-rationale.md](./02-tech-stack-and-rationale.md) | Architects, DevOps | Technology choices and *why* |
| 03 | [03-database-schema.md](./03-database-schema.md) | Backend engineers, DBAs | Full PostgreSQL schema, indexes, migrations |
| 04 | [04-api-specification.md](./04-api-specification.md) | Backend + Frontend | REST endpoints, payloads, error contracts |
| 05 | [05-device-integration-isapi.md](./05-device-integration-isapi.md) | Backend engineers | ISAPI driver layer, vendor abstraction |
| 06 | [06-sync-engine.md](./06-sync-engine.md) | Backend engineers | Queue design, workers, reconciliation |
| 07 | [07-event-processing-realtime.md](./07-event-processing-realtime.md) | Backend + Frontend | Event ingestion, WebSocket fan-out |
| 08 | [08-security-and-networking.md](./08-security-and-networking.md) | DevOps, Security | WireGuard, auth, secrets, hardening |
| 09 | [09-deployment-and-devops.md](./09-deployment-and-devops.md) | DevOps | Docker, Nginx, CI/CD, environments |
| 10 | [10-implementation-roadmap-checklist.md](./10-implementation-roadmap-checklist.md) | Project managers, Engineers | Phase-by-phase build checklist |
| 11 | [11-testing-strategy.md](./11-testing-strategy.md) | QA, Engineers | Unit, integration, E2E, acceptance criteria |
| 12 | [12-hikvision-http-listening-setup.md](./12-hikvision-http-listening-setup.md) | Field engineers, Backend | Step-by-step Web-UI and ISAPI setup for device → receiver push |
| 13 | [13-hikvision-gotchas-and-field-notes.md](./13-hikvision-gotchas-and-field-notes.md) | Backend engineers | Hard-won Hikvision quirks: Digest auth, firmware variance, encoding, RTSP, etc. |

---

## 🎯 Platform Goals at a Glance

- Eliminate dependency on **Hikvision OpenAPI / HikCentral** licensing
- Communicate **directly with devices** via ISAPI
- Provide a **vendor-abstracted** driver layer (Hikvision today; Suprema, Dahua, ZKTeco tomorrow)
- Own **all user, device, and event data** in our own PostgreSQL
- Deliver **eventual consistency** through a queue-driven sync engine
- Stream **realtime events** to dashboards and mobile apps via WebSockets
- Operate **multi-site** with a secure WireGuard mesh

---

## 🧭 Recommended Reading Order

1. **New to the project?** → Read `01` → `02` → `10` (roadmap).
2. **Building the backend?** → Read `03` → `04` → `05` → `06` → `07`, then `13` before touching the Hikvision driver.
3. **Onboarding a device on the bench or troubleshooting push events?** → `12`.
4. **Running it in production?** → Read `08` → `09`.
5. **Verifying it works?** → Read `11`.

---

## 🏷️ Conventions Used in This Doc Set

- **MUST / SHOULD / MAY** follow RFC 2119 semantics.
- ✅ = acceptance criterion (must pass to mark a task done)
- ☐ = open checklist item
- 🔒 = security-sensitive item
- ⚠️ = known risk or gotcha
- All code samples are illustrative, not copy-paste production code.

---

## 📌 Versioning

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2026-05-15 | Initial architecture & implementation plan |
