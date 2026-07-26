# Ocean Command

**Offshore Operations Intelligence Platform**

A digital command center for offshore operations: vessels, operations, environmental conditions,
assets, risks, alerts and incidents in one operational picture, with the decision rules written
down and testable.

---

## Current state — read this first

**Phases 0 (Architecture) and 1 (Foundation) are complete.** You can run the application, sign in
as any of four roles, and every mutation is audited. The operational modules — fleet, operations,
weather, risk, alerts, assets, incidents — are **not built yet**; they are phases 2 to 8.

| Capability | Status |
| --- | --- |
| Architecture, domain model, decision rules, threat model | ✅ [docs/](docs/) |
| PostgreSQL schema — 24 tables, 2 migrations, CHECK constraints, partial unique index | ✅ |
| Authentication — e-mail/password, Argon2id, database sessions, rate limiting | ✅ |
| RBAC — 4 roles, 36 permissions, one matrix, checked server-side | ✅ |
| Multi-tenancy — `TenantContext` required by every data access | ✅ |
| Audit trail — written inside the mutation's transaction | ✅ |
| Application shell — navigation filtered by role, `DEMO DATA` marker | ✅ |
| Deterministic idempotent seed — 2 organizations, one user per role | ✅ |
| Fleet, operations, weather, risk, alerts, assets, incidents, analytics | 🔜 Phases 2–8 |
| Ocean AI | 🔜 Phase 9 |
| E2E tests, metrics, deployment | 🔜 Phase 10 |

Nothing is described as working unless this table says it is, and the Command Center says the same
thing on screen: its Operational Status panel reports **"not computable yet"** rather than a green
light, because three of the four inputs to that score do not exist before phase 6.

### Verified on 2026-07-26

```text
lint       ✓ no errors
typecheck  ✓ no errors
test       ✓ 26 passed (5 files)
build      ✓ 6 routes
```

Plus, against a real PostgreSQL 17: both migrations apply to an empty database, all 10 CHECK
constraints and the partial unique index exist, the seed is idempotent (run twice → same counts),
and all four seeded roles sign in and receive a shell that matches their permissions — a Viewer
sees 10 permissions and no Administration module, an Operator 17 with `alert:acknowledge` but not
`alert:resolve`, a Manager 30, an Administrator 36.

---

## The problem

An offshore operations room runs on fragments: an AIS screen, a weather site, a spreadsheet of
planned operations, a risk register nobody opens during the operation it refers to, and a
WhatsApp group. The duty coordinator's real job is to reconcile those fragments continuously and
answer one question:

> *What needs my attention right now, and can we keep operating?*

The cost of getting it wrong is not a bad report. It is a crew transfer attempted in a closing
weather window, a crane failure discovered when the cargo is already on the deck, or a critical
alert that everyone saw and nobody owned.

## The approach

Ocean Command consolidates the picture and makes the judgement calls **explicit, configurable
and auditable**:

* **Weather windows** are evaluated against per-operation-type limits and return
  `Favorable / Marginal / Unsafe` *with the metrics that caused the verdict*.
* **Risk** uses a standard 5×5 matrix with the score computed server-side, never accepted from a
  form.
* **Readiness scores** (per vessel, per organization) combine weather, asset health, open risks
  and unresolved alerts through a documented, weighted formula — and always return the
  contribution of each factor.
* **Every status change** goes through an explicit transition table and writes an audit row in
  the same transaction as the change.

No number appears in this product without a way to see what produced it. An operations room does
not act on an unexplained score; it overrides it once and then stops looking at it.

## Deliberate limits

* **Vessel positions are simulated.** A real AIS feed costs money and is not in the MVP. Every
  position carries `source: SIMULATED` in the database and is labelled as such in the UI, and
  swapping in a real feed is one implementation of an existing interface.
* **Weather is real** (Open-Meteo, free, no key) but cached in our own tables and served from
  there, with staleness shown when a refresh fails.
* **Ocean AI ships disabled** until Phase 9, as an explicit "not configured" state rather than a
  canned answer. When it lands, its tools are read-only and tenant-scoped: an LLM that can cancel
  an offshore operation is not a feature.
* **Threshold defaults are plausible demonstration values**, not values from any vessel's
  operations manual. They are configurable per organization.
* **Demo data is labelled `DEMO DATA` in the interface.** Vessels, operators and coordinates are
  fictional; basin names are real geography and no operation is attributed to a real company.

## Modules

| Module | The question it answers |
| --- | --- |
| Command Center | What needs my attention? |
| Fleet Command | What is happening with my fleet? |
| Operations Center | What is happening with my operations? |
| Environmental Intelligence | Does the environment allow us to continue? |
| Risk Center | What could go wrong? |
| Alert Center | What requires action? |
| Asset Monitoring | Which equipment is causing problems? |
| Incident Management | What happened, and why does it keep happening? |
| Analytics | What do the numbers say over time? |
| Ocean AI | Explain the picture to me. |

Every module exists because a specific coordination failure offshore costs money or safety; the
mapping is in [ARCHITECTURE.md §1](docs/ARCHITECTURE.md).

## Architecture in one paragraph

A single Next.js application structured as a modular monolith:
`presentation → application → domain`, with infrastructure at the edge. Domain rules are pure
functions that import nothing and are unit-tested first. Every external system — AIS, weather,
LLM, storage, notifications — sits behind a provider interface, so none of them is reachable from
a component. Multi-tenancy is enforced by a `TenantContext` that every query and action must
accept, making a forgotten tenant filter a type error rather than a data leak.

## Stack

Next.js 16 · React 19 · TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) · Tailwind 4 ·
PostgreSQL 17 · Prisma 7 · Better Auth · Argon2id · Zod 4 · Vitest · npm.
Leaflet and Recharts arrive with the modules that need them (phases 2 and 8).

Every choice, and the alternative it beat, is in [DECISIONS.md](docs/DECISIONS.md) — including
three decisions revised during phase 1 because the environment disagreed with the plan.
Running cost is zero: free tiers and open source only.

## Getting started

Requires Node 22+ and Docker.

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm install
docker compose up -d          # PostgreSQL 17 on port 5433
npx prisma migrate deploy     # or `npm run db:migrate` while developing
npm run db:seed               # idempotent — safe to re-run
npm run dev                   # http://localhost:3000
```

### Demo access

Seeded accounts, **development only**, all with the password `OceanCommand2026!`:

| E-mail | Role |
| --- | --- |
| `admin@oceancommand.demo` | Administrator |
| `manager@oceancommand.demo` | Operations Manager |
| `operator@oceancommand.demo` | Operator |
| `viewer@oceancommand.demo` | Viewer |

Sign in as more than one to see the same page grant different access. These accounts exist only in
a database you seeded yourself, in an organization flagged `isDemo`, which is what puts the
`DEMO DATA` marker in the header.

A second organization, `northern-marine`, is seeded with one user and no data. It is not a demo of
anything: it exists so the tenant-isolation tests can *prove* that one organization cannot read
another's records instead of asserting it.

## Quality gate

No phase is considered done until all of these pass in CI:

```text
lint  ·  typecheck  ·  unit + integration tests  ·  build  ·  secret scan
```

Plus, specifically: migrations apply cleanly to an empty database, the seed remains idempotent,
and the tenant-isolation and RBAC tests pass. Those two suites are not optional and not
deletable.

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, modules, domain rules, providers, performance, testing, risks |
| [DATABASE.md](docs/DATABASE.md) | Domain model, full Prisma reference schema, constraints, seed plan |
| [SECURITY.md](docs/SECURITY.md) | Authentication, RBAC matrix, tenant isolation, threat model |
| [API.md](docs/API.md) | Query, server-action and route-handler contracts |
| [ROADMAP.md](docs/ROADMAP.md) | Phases 0–10 with acceptance criteria |
| [DECISIONS.md](docs/DECISIONS.md) | Decision log and index of the [ADRs](docs/adr/) |

## Roadmap

Phase 0 Architecture ✅ · 1 Foundation ✅ · 2 Fleet Command · 3 Operations · 4 Environmental
Intelligence · 5 Risk & Alerts · 6 Asset Monitoring · 7 Incidents · 8 Analytics & Command Center ·
9 Ocean AI · 10 Production Readiness.

Details and acceptance criteria per phase: [ROADMAP.md](docs/ROADMAP.md).
