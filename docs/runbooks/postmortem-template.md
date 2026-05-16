# Postmortem Template

> Copy this file to `docs/runbooks/postmortems/YYYY-MM-DD-<title>.md` for each incident.
> Blameless: focus on systems and processes, not individuals.

---

## Incident Summary

**Date:** YYYY-MM-DD  
**Duration:** HH:MM (from first alert to full resolution)  
**Severity:** P1 / P2 / P3  
**On-call:** [name]  
**Participants:** [names]

## Impact

- Users affected: N
- Devices affected: N (N% of fleet)
- Events lost / delayed: N
- Revenue impact: $N / [description]

## Timeline (UTC)

| Time  | Event                 |
| ----- | --------------------- |
| HH:MM | Alert fired           |
| HH:MM | On-call acknowledged  |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied    |
| HH:MM | Full resolution       |

## Root Cause

[One-paragraph technical explanation of what broke and why.]

## Contributing Factors

- [Factor 1]
- [Factor 2]

## What Went Well

- [Thing 1]
- [Thing 2]

## What Went Badly

- [Thing 1]
- [Thing 2]

## Action Items

| Action              | Owner  | Due        |
| ------------------- | ------ | ---------- |
| [Fix X]             | [Name] | YYYY-MM-DD |
| [Add alert for Y]   | [Name] | YYYY-MM-DD |
| [Add runbook for Z] | [Name] | YYYY-MM-DD |

## Metrics at Time of Incident

- Queue depth: N
- Error rate: N%
- Affected devices: N
