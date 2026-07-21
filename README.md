# 🌊 Ocean Command — one operational picture for offshore work

> A local-first command platform that joins offshore assets, vessels, people and scheduled work into an auditable operational picture — without requiring paid external data providers.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-0d3641?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Next.js](https://img.shields.io/badge/Next.js-16-0d3641?logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![Fastify](https://img.shields.io/badge/Fastify-5-0d3641?logo=fastify&logoColor=white)](https://fastify.dev/) [![PostGIS](https://img.shields.io/badge/PostGIS-16-0d3641?logo=postgresql&logoColor=white)](https://postgis.net/) [![Status: Phase 5 complete](https://img.shields.io/badge/status-phase_5_complete-27b3a9)](./ROADMAP.md) [![License](https://img.shields.io/badge/license-Apache--2.0-0d3641)](./LICENSE)

**Project status:** executable locally. Phase 5 simulated meteocean windows and alerts are complete; no hosted deployment or live weather provider is claimed.

---

## The problem

Offshore coordination is fragmented across vessel tracking, people-on-board lists, asset registers and schedules. A change in one system can affect another operation without a clear, attributable path back to the decision.

Ocean Command starts with a narrower promise: create a reliable shared view of the operation, preserve tenant boundaries and record every authenticated change. It is not a safety authority and does not replace qualified human approval.

## The solution

Ocean Command is a modular TypeScript monorepo with a Next.js command center, a Fastify API and PostgreSQL/PostGIS as the operational source of truth. It currently provides:

- Multi-tenant organizations, Argon2id credentials, short-lived `httpOnly` JWT sessions and backend-enforced roles.
- Offshore assets, areas, equipment, vessels, position history, voyages, personnel, competencies and POB lifecycle.
- Tenant-scoped GeoJSON operational map and a local MapLibre style with no mandatory external map provider.
- Operational activities, dependency-cycle prevention, schedule-conflict detection and an interactive status timeline.
- Simulated weather observations, six-hour forecasts, meteocean impact review and operational windows. Conditions beyond 16 kn wind or 2.5 m waves generate a high simulated alert and identify upcoming affected activities.
- Immutable-style audit events for authenticated domain changes, Docker Compose infrastructure, CI and a simulated local seed.

## What makes the data trustworthy enough to use

| Common failure | Ocean Command behaviour |
| --- | --- |
| A tenant can accidentally see another organization | Every protected query is scoped by `organization_id`; ownership is checked again in domain routes. |
| Demo data is confused with live operations | The seed marks its organization and records as `SIMULATED`; it is documented as development-only. |
| A schedule silently forms a circular dependency | Recursive dependency validation rejects a new cycle with `409 Conflict`. |
| A schedule overlap is invisible | The timeline flags active overlapping work windows on the same asset. |
| A weather restriction is detached from work planning | The meteocean impact endpoint and dashboard surface upcoming activities on the affected asset, and alerts carry their IDs. |
| A frontend authorization check is bypassed | Authorization is validated in the Fastify API; the dashboard never accesses PostgreSQL directly. |

These are implemented controls, not a claim of operational certification. Production still requires secrets management, TLS termination, token revocation and a complete permission matrix.

## Architecture at a glance

```text
Browser
  │  Next.js Command Center (map + timeline)
  ▼
Fastify API ── identity, RBAC, audit, operational modules
  │
  ├── PostgreSQL + PostGIS ── tenant-scoped operational source of truth
  ├── Redis ── local infrastructure for upcoming asynchronous work
  └── MinIO ── local object-storage-compatible service

Simulator / Worker ── replaceable local integration points
```

| Layer | Technology | Role |
| --- | --- | --- |
| Web | Next.js 16, React 19, MapLibre | Authenticated command center, local operational map and timeline |
| API | Fastify 5, Zod | Validation, authentication, RBAC and tenant-scoped endpoints |
| Data | PostgreSQL 16, PostGIS | Operational records, geospatial coordinates and audit trail |
| Local infra | Docker Compose, Redis, MinIO | Reproducible self-hosted development environment |
| Workspace | pnpm, Turborepo, TypeScript | Modular builds, checks and shared contracts |

## Quick start

Requires Node 22+, pnpm 11+ and Docker Compose.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
make docker-up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000`. The simulated local account is:

```text
email:    demo@ocean-command.local
password: OceanCommandDemo!2026
```

The credentials are intentionally limited to a local development database. Change or remove them before exposing any environment.

## Verify the platform

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate
pnpm db:seed
```

`GET http://localhost:4000/ready` verifies PostgreSQL readiness. The workspace permits native builds only for the reviewed dependencies `argon2`, `esbuild` and `sharp`.

## API surface

| Domain | Examples |
| --- | --- |
| Identity | register, login/logout, current user, tenant users and audit |
| Assets | assets, areas and equipment lifecycle |
| Marine | vessels, position history, voyages and operational GeoJSON |
| Personnel | people, competencies, certifications and POB lifecycle |
| Operations | activities, timeline and cycle-safe activity dependencies |
| Meteocean | simulated observations and forecasts, impact queries and operational windows |

See [API.md](./API.md) for the current routes, [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions and [SECURITY.md](./SECURITY.md) for disclosure guidance.

## Roadmap

- **Phase 0** — Foundation, Docker Compose, health checks and CI ✅
- **Phase 1** — Identity, multi-tenancy, RBAC and audit ✅
- **Phase 2** — Assets, vessels, personnel, POB and operational map ✅
- **Phase 3** — Activities, scheduling, dependencies and resource constraints — in progress
- **Phase 4** — Server-Sent Events, position history and simulator updates
- **Phase 5** — Simulated weather, forecasts, operational windows and meteocean alerts ✅
- **Phases 6–7** — Alert lifecycle, deterministic rules and operational graph
- **Phases 8–10** — Offline support, production hardening and command-center expansion

The full implementation state is maintained in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) and [ROADMAP.md](./ROADMAP.md). Contributions are welcome; read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) first.

## License

Licensed under [Apache-2.0](./LICENSE).
