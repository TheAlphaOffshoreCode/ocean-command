# Implementation status

Updated: 2026-07-21

## Completed

- Fase 0: pnpm/Turborepo workspace, Next.js web, Fastify API, Compose services (PostGIS, Redis, MinIO), health/readiness, environment template, Make targets, basic CI and core documentation.
- Fase 1: organization registration, Argon2id credentials, JWT cookie session, administrator/operations/viewer roles, tenant-scoped user administration and immutable-style audit records.
- Fase 2: tenant-scoped lifecycle for offshore assets, areas, equipment, vessels and positions, voyages, people, competencies, certifications and POB. The local seed creates an explicitly simulated demo organization, and the authenticated web Command Center renders the tenant-scoped operational map with MapLibre.
- Fase 3 (in progress): tenant-scoped operational activities with status, priority, risk, schedule and audit trail; dependency creation prevents cycles; a timeline endpoint reports basic overlapping-schedule conflicts for the same asset.
- Fase 5: tenant-scoped simulated observations and six-hour forecasts, configurable operational windows, a Command Center meteocean panel and impact queries for scheduled activities. Simulated conditions above 16 kn wind or 2.5 m waves create a high operational alert with the affected activity IDs.

## Validation

- `pnpm install` and `pnpm install --frozen-lockfile`: passed. The workspace lockfile is committed and permits native scripts only for `argon2`, `esbuild`, and `sharp`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`: passed. The API suite has two passing tests; packages without suites use Vitest's explicit `--passWithNoTests` option until coverage is added.
- `docker compose config --quiet`: passed. PostgreSQL/PostGIS, Redis and MinIO started healthy.
- `pnpm db:migrate`: passed and is idempotent; a second execution does not reapply `001_identity.sql`.
- `GET /ready` against the running PostgreSQL database returned `200` with `database: available`.
- `git diff --check`: passed.

## Risks and next work

- Automated endpoint coverage is still limited; expand it with activities, scheduling and alert scenarios in Phase 3.
- Production needs secret management, TLS termination, refresh-token/session revocation, full permission matrix and database row-level security defense in depth.
- Next: complete the alert lifecycle and deterministic operational rules in Phase 6 while extending the operational graph.
