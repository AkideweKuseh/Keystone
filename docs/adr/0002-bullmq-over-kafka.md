# ADR 0002 — BullMQ over Kafka for Job Queue

**Status:** Accepted  
**Date:** 2026-05-15

## Context

Device sync jobs need retries, delays, priorities, rate limiting, and dead-letter handling. Two candidates: BullMQ (Redis-backed) and Kafka (log-based).

## Decision

Use **BullMQ 5+** backed by **Redis 7+**.

## Consequences

- Retries, backoff, DLQ, repeatable jobs, and concurrency control out of the box.
- Single additional stateful component (Redis already used for pub/sub).
- No event replay beyond job TTL — acceptable at current scale.
- If event throughput exceeds ~50k/s, revisit Kafka for the event pipeline.

## Alternatives rejected

- **Kafka:** replay semantics and partitioning are valuable but add operational complexity not justified below 50k events/s.
- **PostgreSQL SKIP LOCKED queue (pg-boss):** avoids Redis dependency but no built-in rate limiting or DLQ.
