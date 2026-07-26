# Ocean Command

**Offshore Operations Intelligence Platform**

A digital command center for offshore operations: vessels, operations, environmental conditions,
assets, risks, alerts and incidents in one operational picture, with the decision rules written
down and testable.

---

## Current state — read this first

**Phase 0 (Architecture) is complete. There is no application code in this repository yet.**

This is a deliberate first step, not an unfinished one. Phase 0 produced the domain model, the
schema, the decision rules, the security model and the roadmap, so that Phase 1 starts from a
design instead of discovering it mid-implementation.

| Deliverable | Status |
| --- | --- |
| Product analysis and module scope | ✅ [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Architecture, layers, module graph, provider strategy | ✅ [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Domain model, reference schema, indexes, constraints | ✅ [DATABASE.md](docs/DATABASE.md) |
| Risk / weather-window / readiness formulas | ✅ [ARCHITECTURE.md §5](docs/ARCHITECTURE.md) |
| Auth, RBAC matrix, multi-tenancy, threat model | ✅ [SECURITY.md](docs/SECURITY.md) |
| Internal API contracts | ✅ [API.md](docs/API.md) |
| Technology decisions, alternatives rejected | ✅ [DECISIONS.md](docs/DECISIONS.md) + [ADRs](docs/adr/) |
| Roadmap with per-phase acceptance criteria | ✅ [ROADMAP.md](docs/ROADMAP.md) |
| Application, database, UI | 🔜 Phase 1 |

Nothing below is described as working unless this table says it is. The status column is updated
when a phase actually passes its gate — never in advance.

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

Next.js 16 · React 19 · TypeScript 7 (strict) · Tailwind 4 · shadcn/ui · PostgreSQL 17 ·
Prisma 7 · Better Auth · Zod 4 · Leaflet · Recharts · Vitest · pnpm.

Every choice, and the alternative it beat, is in [DECISIONS.md](docs/DECISIONS.md).
Running cost of the MVP is zero: free tiers and open source only.

## Getting started

Nothing to run yet — Phase 1 creates the application. When it exists, this section will carry the
real commands, verified, and not before.

## Quality gate

From Phase 1 onward, no phase is considered done until all of these pass in CI:

```
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

Phase 0 Architecture ✅ · 1 Foundation · 2 Fleet Command · 3 Operations · 4 Environmental
Intelligence · 5 Risk & Alerts · 6 Asset Monitoring · 7 Incidents · 8 Analytics & Command Center ·
9 Ocean AI · 10 Production Readiness.

Details and acceptance criteria per phase: [ROADMAP.md](docs/ROADMAP.md).
