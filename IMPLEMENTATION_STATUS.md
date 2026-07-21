# Implementation status

Updated: 2026-07-21

## Completed

- Fase 0: pnpm/Turborepo workspace, Next.js web, Fastify API, Compose services (PostGIS, Redis, MinIO), health/readiness, environment template, Make targets, basic CI and core documentation.
- Fase 1: organization registration, Argon2id credentials, JWT cookie session, administrator/operations/viewer roles, tenant-scoped user administration and immutable-style audit records.
- Fase 2: tenant-scoped lifecycle for offshore assets, areas, equipment, vessels and positions, voyages, people, competencies, certifications and POB. The local seed creates an explicitly simulated demo organization, and the authenticated web Command Center renders the tenant-scoped operational map with MapLibre.
- Fase 3: tenant-scoped activities with status, priority, risk, schedule, audit trail, dependency-cycle prevention, timeline conflicts and resource-conflict queries. Invalid rescheduling is rejected before persistence.
- Fase 4: tenant-scoped operational map, authenticated organization-scoped SSE with heartbeat and cleanup, and simulated vessel position ticks. Activity creation, updates and deletion, manual and simulated vessel positions, and meteocean updates now publish domain events consumed by the Command Center.
- Fase 5: tenant-scoped simulated observations and six-hour forecasts, configurable operational windows, a Command Center meteocean panel and impact queries for scheduled activities. Simulated conditions above 16 kn wind or 2.5 m waves create a high operational alert with the affected activity IDs.
- Fase 6: tenant-scoped alert lifecycle with prioritized listing, detail history, active-user assignment, acknowledgement, resolution and controlled reopening. Every lifecycle transition is persisted in `alert_events`, audited and emitted as `alert.updated` over the authenticated SSE stream.
- Fase 7: PostgreSQL operational graph synchronizes assets, vessels, activities and alerts into tenant-scoped nodes and relations. It provides impact traversal, cycle prevention, a `/graph` visual route, and configurable deterministic weather rules that create explainable alerts.
- Fase 8: the authenticated Command Center now connects map, activity timeline, meteocean conditions, operational graph and a dedicated `/alerts` console. The console provides status/severity filters, priority indicators, lifecycle controls, alert audit history and authenticated SSE refreshes for `alert.created` and `alert.updated` events.
- Fase 9: the browser registers a minimal service worker for the local application shell, persists the authenticated Command Center snapshot in IndexedDB, and shows a clear online/offline state. Activity status changes made without connectivity are placed in a persistent local queue and replayed after reconnecting; server conflicts remain explicitly marked for human review rather than being overwritten.
- Fase 10: separate API and web Dockerfiles, a Helm chart with readiness/liveness probes and external secret references, structured request logs, request/trace correlation headers, protected Prometheus metrics, and guarded PostgreSQL backup/restore scripts are available. The production runbook documents immutable images, TLS, secret rotation and recovery drills.

## Validation

- `pnpm install` and `pnpm install --frozen-lockfile`: passed. The workspace lockfile is committed and permits native scripts only for `argon2`, `esbuild`, and `sharp`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`: passed. The API suite has two passing tests; packages without suites use Vitest's explicit `--passWithNoTests` option until coverage is added.
- `docker compose config --quiet`: passed. PostgreSQL/PostGIS, Redis and MinIO started healthy.
- `pnpm db:migrate`: passed and is idempotent; a second execution does not reapply `001_identity.sql`.
- `GET /ready` against the running PostgreSQL database returned `200` with `database: available`.
- `git diff --check`: passed.

## Risks and next work

- Automated endpoint coverage is still limited; expand it with activity, scheduling, alert and stream scenarios in subsequent phases.
- Production needs secret management, TLS termination, refresh-token/session revocation, full permission matrix and database row-level security defense in depth.
- The initial ten-phase roadmap is complete. Future work should be prioritized from operational feedback and formal security review findings.
