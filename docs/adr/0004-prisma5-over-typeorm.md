# ADR 0004 — Prisma 5 over TypeORM

**Status:** Accepted  
**Date:** 2026-05-16

## Context

The spec listed "Prisma (or TypeORM)" as ORM options. Prisma 7 was the latest release at implementation time but introduced breaking API changes (datasource URL moved to `prisma.config.ts`, adapter-based client) that caused migration engine auth failures against PostgreSQL 16 in the Docker dev environment.

## Decision

Use **Prisma 5.x** (specifically 5.22.0) — the latest stable LTS-equivalent that has stable migration tooling and well-understood PostgreSQL 16 compatibility.

## Consequences

- Stable migration engine with proven PostgreSQL 16 + Docker compatibility.
- Schema-in-file (traditional `datasource { url }`) pattern works without adapter wrapping.
- Prisma 7 migration guide should be revisited when it reaches stable/LTS designation.
- TypeORM rejected because Prisma's type safety, `prisma format`, and migration DX are superior.
