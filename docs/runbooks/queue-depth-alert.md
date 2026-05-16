# Runbook: Queue Depth Alert

**Alert:** Queue depth > 1000 for 10 min on any BullMQ queue  
**Severity:** Warning

## Diagnosis

```bash
# Check queue depths via Redis CLI (from worker container or VPN)
redis-cli -u "$REDIS_URL" llen 'bull:user-sync:wait'
redis-cli -u "$REDIS_URL" llen 'bull:event-process:wait'

# Or via BullMQ dashboard (if deployed)
# Or via GET /api/v1/sync/status
```

Check worker logs for errors or stalls:

```bash
grep -i 'error\|failed\|timeout' /var/log/worker.log | tail -100
```

## Resolution

| Root cause                 | Action                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| Worker crash               | Restart worker service; jobs are not lost (persisted in Redis)          |
| Too many devices offline   | Normal accumulation; jobs retry; check device-offline alert             |
| Worker concurrency too low | Scale worker replicas; increase `SYNC_CONCURRENCY` env var              |
| Redis OOM                  | Check `redis-cli info memory`; increase Redis max memory or add replica |
| DLQ growing                | See `dlq-growth.md` runbook                                             |

## Recovery Verification

- Queue depth returns to < 100 within 30 min of resolution
- `sync_jobs_completed_total` metric trending up
