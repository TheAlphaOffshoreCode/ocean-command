# Ocean Command

Unified Offshore Operations Command Platform. Ocean Command creates one operational picture for offshore assets, people and work. This first release delivers the executable Fase 0–1 foundation: monorepo, local infrastructure, identity, organization isolation, RBAC and audit trail.

## Run locally

```bash
cp .env.example .env
make setup
make docker-up
make db-migrate
make dev
```

Open `http://localhost:3000`, create an organization and use `GET http://localhost:4000/ready` to check the API. The provided data and endpoints are not a safety authority; offshore operational decisions require qualified human approval.

## Demonstration data

Run `pnpm db:seed` after migrations to load an idempotent, explicitly simulated scenario. Sign in with `demo@ocean-command.local` and `OceanCommandDemo!2026`; use it only in a local development database. The Command Center renders its operational markers with a local MapLibre style, so the core demonstration does not rely on a paid or external map API.

## Verify

```bash
pnpm install --frozen-lockfile
make lint
make typecheck
make test
make build
```

The workspace permits native build scripts only for the reviewed dependencies required by the platform (`argon2`, `esbuild`, and `sharp`).

See [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [API.md](API.md), and [docs/adr](docs/adr).
