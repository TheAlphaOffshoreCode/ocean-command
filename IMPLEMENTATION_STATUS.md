# Implementation status

Updated: 2026-07-20

## Completed

- Fase 0: pnpm/Turborepo workspace, Next.js web, Fastify API, Compose services (PostGIS, Redis, MinIO), health/readiness, environment template, Make targets, basic CI and core documentation.
- Fase 1: organization registration, Argon2id credentials, JWT cookie session, administrator/operations/viewer roles, tenant-scoped user administration and immutable-style audit records.

## Validation

- `docker compose config --quiet`: passed.
- `git diff --check`: passed.
- Dependency installation, typecheck, tests, migration and build: blocked. `pnpm install` reaches the workspace but repeatedly stalls while fetching the Windows `@next/swc-win32-x64-msvc` binary. The npm registry itself responds to `npm ping`; no lockfile was produced. Do not treat the application build as validated until this fetch completes.

## Risks and next work

- Endpoint coverage is intentionally limited to identity; assets and operations are Fase 2+.
- Production needs secret management, TLS termination, refresh-token/session revocation, full permission matrix and database row-level security defense in depth.
- Next: complete `pnpm install`, then run `make docker-up`, `make db-migrate`, `make test`, `make typecheck` and `make build` before adding the asset/vessel/personnel modules.
