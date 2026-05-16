# ADR 0005 — Isolated Event Receiver (Separate App)

**Status:** Accepted  
**Date:** 2026-05-15

## Context

Hikvision devices retry aggressively on non-200 responses. If the main API is slow or restarting, devices could flood retries, create duplicates, and exhaust their local buffers.

## Decision

The event receiver (`apps/receiver`) is a **separate NestJS application** from the API (`apps/api`). Its only job is:

1. Validate the per-device token.
2. INSERT the raw body into `access_events` (with dedup key).
3. Enqueue an `event-process` job.
4. Return `200 OK`.

All semantic parsing happens in the `event-process` worker.

## Consequences

- API deploys/restarts do not affect event ingestion availability.
- Receiver can be scaled independently of the API (different load profile).
- Receiver has no dependency on NestJS Guards, auth middleware, or Swagger — keeps it minimal and fast.
- Adds one more process to operate, but the isolation benefit outweighs that.

## Alternatives rejected

- **Receiver as a route in the main API:** a slow API affects event ingestion; a NestJS restart drops in-flight requests; shared module initialization adds latency.
