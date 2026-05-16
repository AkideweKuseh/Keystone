# Contributing

## Branch naming

```
feat/<phase>-<short-name>   — new feature
fix/<short-name>            — bug fix
chore/<short-name>          — tooling, deps, docs
```

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api): add device registration endpoint
fix(sync): handle null capability response from firmware < 2.0
chore(deps): upgrade bullmq to 5.3
```

Scope should be the lib or app name: `api`, `worker`, `receiver`, `domain`, `drivers`, `persistence`, `queue`, `auth`, `audit`, `shared`.

## Pull requests

- Title matches the commit message format
- Description covers: **What changed / Why / How verified**
- Link the relevant `docs/` section
- All CI checks must be green before review

## Definition of done

Before opening a PR, verify every item in the checklist (also in `CLAUDE.md §5.3`):

- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green, coverage ≥ 80% on touched `libs/`
- [ ] New endpoint → OpenAPI updated + integration test added
- [ ] New env var → documented in `.env.example`
- [ ] Schema change → migration forward + rollback both work
- [ ] Docs updated if behavior visibly changed

## Hard rules (see `CLAUDE.md §3` for full list)

- No `any` without `// FIXME(any): <reason>`
- No vendor-specific code outside `libs/drivers/<vendor>/`
- Every device mutation goes through the queue (except door unlock)
- Every job has a deterministic idempotency key
- Receiver returns 200 OK in under 100 ms
- No real device credentials in the repo, ever
