# Implementation status

Updated: 2026-07-21

## Completed

- Fase 0: pnpm/Turborepo workspace, Next.js web, Fastify API, Compose services (PostGIS, Redis, MinIO), health/readiness, environment template, Make targets, basic CI and core documentation.
- Fase 1: organization registration, Argon2id credentials, JWT cookie session, administrator/operations/viewer roles, tenant-scoped user administration and immutable-style audit records.
- Fase 2 (in progress): tenant-scoped CRUD for offshore assets, hierarchical asset areas and equipment, plus vessel CRUD/positions and personnel/competency/POB creation with audit records. Voyages, certification assignment, disembark, complete personnel CRUD, seed data and the initial map remain pending.

## Validation

- `pnpm install` and `pnpm install --frozen-lockfile`: passed. The workspace lockfile is committed and permits native scripts only for `argon2`, `esbuild`, and `sharp`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`: passed. The API suite has two passing tests; packages without suites use Vitest's explicit `--passWithNoTests` option until coverage is added.
- `docker compose config --quiet`: passed. PostgreSQL/PostGIS, Redis and MinIO started healthy.
- `pnpm db:migrate`: passed and is idempotent; a second execution does not reapply `001_identity.sql`.
- `GET /ready` against the running PostgreSQL database returned `200` with `database: available`.
- `git diff --check`: passed.

## Risks and next work

- Endpoint coverage is intentionally limited to identity; assets and operations are Fase 2+.
- Production needs secret management, TLS termination, refresh-token/session revocation, full permission matrix and database row-level security defense in depth.
- Next: Fase 2 — add tenant-scoped assets, vessels and personnel modules with API coverage, audit events and user-facing workflows.
