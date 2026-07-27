# Ocean Command — Decision Log

Significant decisions, the alternative that was actually competitive, and why it lost.
Full reasoning for the structural ones lives in [`adr/`](./adr/).

---

## Architecture Decision Records

| ADR | Decision | Status |
| --- | --- | --- |
| [001](./adr/001-nextjs-modular-monolith.md) | Next.js 16 modular monolith, layered, feature modules | Accepted |
| [002](./adr/002-postgresql-and-hosting.md) | PostgreSQL 17 + Prisma 7, Neon + Vercel free tiers | Accepted |
| [003](./adr/003-authentication.md) | Better Auth with database sessions; authorization owned by the app | Accepted |
| [004](./adr/004-provider-architecture.md) | Provider interface per external capability | Accepted |
| [005](./adr/005-multi-tenancy.md) | Shared schema, required `TenantContext` | Accepted |
| [006](./adr/006-geospatial.md) | Decimal coordinates + Leaflet; PostGIS/MapLibre deferred with triggers | Accepted |
| [007](./adr/007-domain-rules-engine.md) | Pure, configurable, explainable domain rules | Accepted |

---

## Technology choices

| Area | Chosen | Version | Runner-up | Why the runner-up lost |
| --- | --- | --- | --- | --- |
| Framework | Next.js (App Router) | 16.2.12 | Remix / SPA + API | One deploy, one type system, Server Components suit read-heavy pages ([ADR-001](./adr/001-nextjs-modular-monolith.md)). |
| Language | TypeScript `strict` | 5.9 | TypeScript 7.0.2 | **Revised in Phase 1.** 7.0.2 is the current release, but `eslint-config-next` and the type-aware lint rules are built against 5.x, and an identity/tooling break at the foundation phase costs more than the compiler speed gains. `any` is a lint error; `noUncheckedIndexedAccess` on. Revisit when the ESLint toolchain follows. |
| UI runtime | React | 19.2.8 | — | Required by Next 16. |
| Styling | Tailwind CSS | 4.3.3 | CSS Modules | Density and consistency at speed; tokens keep it from becoming soup. |
| Components | Written in-house, shadcn-style | — | shadcn/ui CLI, MUI, Mantine | **Revised in Phase 1.** The shell needed a button, a panel, a dropdown and three state components; pulling in a generator and a component library for four files buys nothing, and shadcn's own premise is that you own the code. Radix primitives are added one at a time where accessibility is hard (the dropdown). MUI's Material identity is wrong for a command center. |
| Icons | Lucide | latest | — | Consistent stroke weight; tree-shakeable. |
| ORM | Prisma | 7.9.0 | Drizzle | Migration workflow and schema-as-truth matter more here than SQL proximity ([ADR-002](./adr/002-postgresql-and-hosting.md)). |
| Database | PostgreSQL | 17 | MySQL, SQLite | Partial indexes, native enums, `jsonb`, PostGIS as a later option. |
| Auth | Better Auth | 1.6.25 | Auth.js v5 | Auth.js v5 is still `5.0.0-beta.32` on npm; stable `next-auth` is 4.x ([ADR-003](./adr/003-authentication.md)). |
| Validation | Zod | 4.4.3 | Valibot | Ecosystem, `zod-to-json-schema` for AI tool definitions, shared client/server contracts. |
| Maps | Leaflet + react-leaflet (adopted phase 2) | 1.9.4 / 5.0.0 | MapLibre GL 6 | No key, no bill, small bundle; MapLibre has a written adoption trigger ([ADR-006](./adr/006-geospatial.md)). |
| Basemap | CARTO dark raster tiles | — | Mapbox, Google | Free, no key, and dark by default — matches the product's visual identity. |
| Charts | Recharts (adopted phase 4) | 3.10.1 | visx, Chart.js | Declarative, composable, adequate for operational time series; visx costs build time this project should not spend. |
| Tests | Vitest + Testing Library | 4.1.10 | Jest | Native ESM/TS, materially faster; Playwright for E2E in Phase 10. |
| Client state | Server Components + `useState`; TanStack Query only where polling exists | 5.101.4 | Redux, Zustand everywhere | Most state is server state. A global store here would mostly cache what the server already owns. |
| Logging | Pino | latest | winston | Structured JSON, low overhead. |
| Package manager | npm | 11 | pnpm | **Revised in Phase 1.** pnpm needs `corepack enable`, which fails with `EPERM` on this machine because it writes shims into `C:\Program Files\nodejs` — so pnpm would require an elevated shell for every contributor on Windows. npm 11 has a deterministic lockfile and workspaces, and pnpm's disk savings do not pay for a package manager that needs administrator rights to exist. |
| Password hashing | `@node-rs/argon2` | 2.0.2 | Better Auth's built-in scrypt | Argon2id is OWASP's first recommendation; the package ships prebuilt binaries, so there is no compile step. Plugged into Better Auth through `emailAndPassword.password.hash/verify`. |

**Versions verified against the npm registry on 2026-07-26**, not recalled. All are current
majors, which is itself a risk (risk #10 in `ARCHITECTURE.md`): they are pinned exactly and the
third-party dependency count is kept deliberately small.

---

## Product and domain decisions

| # | Decision | Reasoning |
| --- | --- | --- |
| P1 | Data provenance (`REAL / SIMULATED / DEMO`) is a **column**, not a UI label. | A demo that presents simulated positions as AIS truth destroys the credibility it exists to build. Making it schema-level means it cannot be forgotten in a component. |
| P2 | Scores and verdicts are always returned **with their breakdown**. | An operations room does not act on an unexplained number; it overrides it, then stops looking at it. |
| P3 | Weather verdicts are **computed, never stored**. | A stored verdict silently outlives the threshold that produced it. Only inputs are persisted. |
| P4 | Acknowledging an alert ≠ resolving it, and they carry different permissions. | Ownership and closure are different acts; conflating them is what makes alert trails meaningless. |
| P5 | Status changes go through explicit transition tables, server-side. | A status field the UI can set to anything is not a workflow — and it makes the audit trail unreliable. |
| P6 | Audit rows are written **inside** the mutation's transaction. | An audit trail that can disagree with the data is worse than none, because it is trusted. |
| P7 | Reference entities are archived, never deleted. | They are referenced by immutable operational history; a hard delete would corrupt the record of what happened. |
| P8 | Ocean AI ships as an explicit `NullAIProvider` until Phase 9. | A visible "not configured" state is honest; a canned fake answer is a lie in the product's most impressive-looking feature. |
| P9 | AI tools are read-only and tenant-scoped in the first release. | An LLM that can cancel an offshore operation is not a feature. |
| P10 | Last known position is denormalised onto `Vessel`. | The fleet map must not scan a growing history table on every render; the write is in the same transaction as the history append. |
| P11 | One open alert per source, enforced by a partial unique index **and** by reconciliation in the rules. | A rule evaluated every 15 minutes would otherwise create 96 alerts a day and train people to ignore the alert panel. Proved by a test that runs the rules 96 times. |
| P12 | Foreign-tenant ids return 404, not 403. | A 403 confirms the record exists. |
| P13 | Desktop-first, with tablet and mobile usable but not co-equal. | This is a command center; compromising the dense desktop view to suit a phone would damage the primary use case. |
| P14 | SSE/WebSockets deferred until polling is measured to be a problem. | Adding a streaming transport before there is load to justify it is complexity without a reason. |
| P15 | Rule-raised alerts are **auto-resolved** when their condition clears. | Deduplication stops the panel filling from the front; without auto-resolution it fills from the back with conditions that ended yesterday. |

---

## Decisions deliberately deferred

| Question | Deferred to | Trigger |
| --- | --- | --- |
| PostgreSQL Row-Level Security | Phase 10 | Application-level isolation proven by tests first; RLS added only with a test proving it engages. |
| PostGIS | Later | Geofencing, track geometry or polygon queries ([ADR-006](./adr/006-geospatial.md)). |
| MapLibre / vector tiles | Later | Measured rendering problems or vector styling requirements. |
| Real-time transport (SSE) | Phase 8 | Polling measured as insufficient. |
| Weather window grid (all operation types against the forecast horizon) | Phase 8 | The per-operation panel already answers "can we work now, and when does that change"; a full grid belongs with the analytics views. |
| Real AIS provider | Post-v1 | A feed with acceptable cost and coverage; interface already fits. |
| Predictive maintenance | Post-v1 | Enough `MaintenanceRecord` history for a model to be more than decoration. |
| Background job runner | Post-v1 | Weather refresh outgrows scheduled route handlers. |
| E-mail / Slack notifications | Post-v1 | A user who is not looking at the screen needs to be reached. |

Recording the trigger, and not only the deferral, is what stops "later" from meaning "never" —
or from meaning "next week, out of curiosity".

---

## Log

| Date | Decision |
| --- | --- |
| 2026-07-26 | Phase 0 closed: ADRs 001–007 accepted, reference schema and domain rules specified, roadmap fixed. Project started from scratch — no code or design carried over from any previous attempt. |
| 2026-07-26 | **Phase 1 delivered.** Three decisions were revised against reality, each recorded in the table above with its evidence: pnpm → npm (corepack `EPERM`), TypeScript 7 → 5.9 (lint toolchain), PostgreSQL image pinned exactly (a floating tag restarted the container against a data directory the newer server refused to open). Two design points survived contact with the code and are worth noting: Better Auth stores the credential on `Account`, not `User`, so `User.passwordHash` was dropped; and `Membership` had to join `TENANT_MODELS` — the registry test caught that omission, which would have let one organization list another's members. |
| 2026-07-26 | **Phase 5 delivered.** The alert rules **auto-resolve** as well as raise: a condition that clears closes its alert with a note. Deduplication alone would still leave a panel full of conditions that ended yesterday — the same noise problem from the other direction. `OperationCounter` was generalised into `SequenceCounter` with a `kind` column so alerts and incidents share the atomic allocator rather than copying its concurrency argument into new tables; the migration carries existing rows over, because the operation sequence had to continue where it left off. |
| 2026-07-26 | **Phase 4 delivered.** Three decisions. A limit is reached **at** its value, not past it — a published 20-knot limit means 20 knots is already marginal, which is how a vessel's operating manual reads, and rounding it the other way is how a stand-down becomes an argument. A missing metric is **missing**, never zero: absent wave height makes the verdict `degraded` and says so, because treating "we do not know the sea state" as "the sea is flat" is the most dangerous rounding this product could make. And forecast horizons are **replaced, not merged** on refresh: a forecast issued now supersedes the one from an hour ago, and it turns 48 upserts per location into two statements. |
| 2026-07-26 | Tests and CI pin `WEATHER_PROVIDER=mock` and `AIS_PROVIDER=mock`. The weather suite initially ran against live Open-Meteo, failed twice, then passed with no code change — a flaky suite is worse than a slow one, and CI should not call somebody's free service on every push. |
| 2026-07-26 | **Phase 3 delivered.** One decision was forced by a failing test: operation codes were allocated by reading the highest code and retrying on conflict, which **fails at ten concurrent creates** because each retry round only lets one caller through. Replaced by an `OperationCounter` row per (organization, year) incremented in one upsert — the narrowest lock that solves it, since different organizations and different years never contend. Two smaller ones: the lifecycle lives in an explicit transition table that the UI reads to decide which buttons to show, so the interface cannot offer a move the server refuses; and schedule overlap uses a **half-open** comparison, because back-to-back operations handing over at 18:00 are normal and flagging them would make the check cry wolf on every well-planned schedule. |
| 2026-07-26 | **Phase 2 delivered.** Three decisions worth recording. The position-recording rule from DATABASE.md §7 was wrong as specified ("50 m **or** 60 s" stores everything, since the 60 s branch is always true); it is now 50 m of movement or a 15-minute heartbeat. AIS tracking eligibility lives in the **domain**, not the provider — a provider that knows a vessel is alongside is a provider that has grown business logic, and walking an FPSO across the basin is the detail that tells a domain reader nobody checked. And the one legitimate cross-tenant read (iterating organizations for the scheduled sync) is a **named function in `lib/db/system.ts`** rather than an ESLint exception for the cron directory: "this case is special" per feature directory is how a tenant boundary erodes. |
| 2026-07-26 | Reference schema validated with `prisma@7.9.0 validate`. Two consequences worth recording: Prisma 7 **removed `url` from the `datasource` block**, so the connection string moves to `prisma.config.ts` (Migrate) and to a **driver adapter** (`@prisma/adapter-pg` + `pg`) passed to `PrismaClient`; and the schema is verified to parse rather than assumed to. Documenting a schema that does not compile would be the same failure this project criticises elsewhere. |
