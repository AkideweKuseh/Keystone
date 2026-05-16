# Performance Baseline & Tuning Guide

## Connection Pool Sizing

| Process                                | `connection_limit` | Rationale                                         |
| -------------------------------------- | ------------------ | ------------------------------------------------- |
| API app                                | 25                 | 100 req/s × ~250ms avg = ~25 concurrent           |
| Worker (user-sync, concurrency 20)     | 30                 | sync concurrency + headroom                       |
| Worker (event-process, concurrency 30) | 35                 | event concurrency + headroom                      |
| Receiver                               | 10                 | fast-path only, short lived                       |
| **Total**                              | **100**            | Leaves headroom for `max_connections=150` default |

Configure via `DATABASE_URL`: `?connection_limit=N&pool_timeout=30`

For production, consider `PgBouncer` in transaction mode in front of Postgres to allow more app connections than PG can handle directly.

## Indexes Inventory

All indexes are defined in `prisma/schema.prisma`. Key covering indexes:

| Table              | Index                          | Hot path                        |
| ------------------ | ------------------------------ | ------------------------------- |
| `devices`          | `(tenant_id, site_id)`         | Device listing by site          |
| `devices`          | `(status)`                     | Health-check + reconciler       |
| `users`            | `(tenant_id, status)`          | User listing                    |
| `device_user_sync` | `(sync_status)`                | Reconciler: pending/failed rows |
| `access_events`    | `(tenant_id, event_time DESC)` | Events API list                 |
| `access_events`    | `(device_id, event_time DESC)` | Events API filter by device     |
| `audit_log`        | `(tenant_id, created_at DESC)` | Audit query                     |
| `refresh_tokens`   | `(token_hash)` UNIQUE          | Auth: token lookup              |

## Slow Query Strategy

1. Enable `pg_stat_statements` in production:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
   ```
2. Weekly query: `SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;`
3. Any query > 50 ms p95 gets a Jira ticket to add index or rewrite.

## Postgres Configuration (production tuning)

```conf
max_connections = 200          # PgBouncer in front reduces effective load
shared_buffers = 4GB           # ~25% of RAM
effective_cache_size = 12GB    # ~75% of RAM
work_mem = 64MB                # per sort/hash operation
maintenance_work_mem = 512MB   # VACUUM, CREATE INDEX
checkpoint_completion_target = 0.9
wal_buffers = 16MB
random_page_cost = 1.1         # SSD
effective_io_concurrency = 200 # SSD
```

## access_events Partitioning

`access_events` should be partitioned monthly for large deployments (> 1M events/month). A worker job creates the next month's partition and drops partitions > 12 months old.

Partition creation SQL (example for 2026-06):

```sql
CREATE TABLE access_events_2026_06
  PARTITION OF access_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE INDEX ON access_events_2026_06 (tenant_id, event_time DESC);
CREATE INDEX ON access_events_2026_06 (device_id, event_time DESC);
CREATE UNIQUE INDEX ON access_events_2026_06 (dedup_key) WHERE dedup_key IS NOT NULL;
```
