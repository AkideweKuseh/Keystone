# ADR 0003 — Vendor Driver Abstraction Interface

**Status:** Accepted  
**Date:** 2026-05-15

## Context

The platform starts with Hikvision but must support Suprema, Dahua, ZKTeco in the future. Without a strict abstraction boundary, every vendor bleeds into domain logic.

## Decision

Define a **`AccessDeviceDriver` TypeScript interface** (`libs/drivers/core`). All vendor implementations live under `libs/drivers/<vendor>/` and are the only files that may import vendor SDKs or know vendor-specific protocols. Domain code and workers interact only with the interface.

## Consequences

- Adding a new vendor requires no changes outside `libs/drivers/<vendor>/`.
- All tests run against `MockDriver` — real-device tests are isolated to nightly bench jobs.
- The `DriverRegistry` provides a per-device factory; switching vendor is a DB field change.
- Interface versioning becomes important if methods must evolve.

## Alternatives rejected

- **Vendor-specific worker branches:** simpler short-term, catastrophic long-term — every shared feature requires parallel implementations.
- **OpenAPI/protocol adapter:** not enough control over Hikvision Digest auth edge cases.
