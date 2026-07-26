# Ocean Command — Roadmap

Legend: ✅ Implemented · 🚧 In Development · 🔜 Planned

**Current state: Phases 0 to 4 complete.** The application runs, four roles sign in, every mutation
is audited, the fleet is on a chart with simulated AIS, operations move through an enforced lifecycle,
and **real** weather from Open-Meteo drives per-operation-type window verdicts. Risk starts at phase 5.

---

## Rules of the roadmap

1. **A phase ships a vertical slice** — schema, server logic, UI and tests for one capability.
   No phase leaves a screen that reads data nobody can write, or an endpoint no screen calls.
2. **Definition of done, identical for every phase:** `lint`, `typecheck`, `test` and `build`
   all green; migrations applied and re-runnable; seed still works; README status table updated
   to what is actually true.
3. **Phases are ordered by dependency, not by excitement.** The map is more fun than the audit
   log; the audit log is in Phase 1 because retrofitting it means rewriting every mutation.
4. **A phase can be cut, never faked.** If something is dropped, it moves to a later phase in
   this document and the README says `Planned` — it never appears as done.

---

## Phase 0 — Architecture ✅

*Understand the domain, decide the structure, write it down before writing code.*

* Product analysis: which offshore failure each module addresses.
* Architecture: modular monolith, layers, dependency rule, module graph.
* Domain model and full reference schema, indexes and constraints.
* Domain rules specified: risk matrix, weather-window limits, readiness formulas.
* Auth, RBAC matrix, multi-tenancy and threat model.
* Provider strategy for AIS, weather, AI, storage, notifications.
* Technology decisions recorded as ADRs, including the options rejected.
* Test, CI/CD and observability strategy.
* Documents: `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `API.md`, `ROADMAP.md`,
  `DECISIONS.md`, `adr/001`–`adr/006`.

**Delivered.** No code, by design — the quality gate applies from Phase 1, when there is
something to lint.

---

## Phase 1 — Foundation ✅

*A person can sign in, see an empty but real command center, and every action is audited.*

Delivered:

* Next.js 16 + React 19 + TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`), ESLint, Prettier.
* Tailwind 4 with **design tokens first**: the command-center palette, density scale and typography
  were decided before any screen, so the product does not converge on a default admin look
  (risk #9 in `ARCHITECTURE.md`).
* PostgreSQL 17 via Docker Compose. Schema in `prisma/schema.prisma`, two migrations — the second
  carries the CHECK constraints and the partial unique index Prisma cannot express — and an
  idempotent `db:seed`.
* Better Auth: sign-in, database-backed sessions, **Argon2id** (`@node-rs/argon2`) plugged in
  through `emailAndPassword.password`, sign-out, rate limiting (5 sign-in attempts / 15 min).
* `TenantContext`, `authorize()`, the permission matrix, and a protected route group.
* `forTenant(ctx)` — a Prisma extension that injects the tenant on reads and writes, and refuses
  operations that cannot carry a tenant filter. ESLint bans the raw client outside `lib/db`.
* `withAudit()` — mutation and audit row in one transaction.
* Zod-validated `env.ts`, Pino logger with redaction, typed error hierarchy, security headers, and
  a nonce-based CSP in middleware.
* Application shell: top bar, permission-filtered module navigation, user menu, `DEMO DATA`
  marker, and the shared `Loading` / `Empty` / `Error` components.
* Tests: the RBAC matrix, `authorize()` including the 404-not-403 rule, tenant isolation against a
  real database, audit-on-mutation with rollback and redaction, and a registry test that reads the
  schema and fails if a tenant-owned model is not scoped.
* CI: lint → typecheck → test (PostgreSQL service) → build, plus migration-drift check and secret
  scan.

**Acceptance — met, and verified against a running instance on 2026-07-26:**

* All four seeded roles sign in through the real Better Auth flow (HTTP 200) and land on a shell
  that matches their permissions: Viewer 10, Operator 17, Operations Manager 30, Administrator 36.
  Only the Administrator sees the Administration module.
* `/command-center` without a session redirects to `/sign-in` (307).
* A wrong password and an unknown e-mail return the **same** 401 and message — no enumeration
  oracle. The sixth attempt in 15 minutes returns 429.
* 26 tests pass, including tenant isolation against a real PostgreSQL: another organization cannot
  read, update or delete a record by id, and a `create` that names a foreign `organizationId` is
  overruled to the caller's own.
* Both migrations apply to an empty database; all 10 CHECK constraints and the partial unique index
  exist; the seed is idempotent.

**Deferred from this phase, deliberately:** shadcn/ui was not adopted — the shell needed a button,
a panel, a dropdown and three state components, so they were written directly (which is what
shadcn is: code you own) rather than pulling in a generator and a component library for four
files. Leaflet and Recharts arrive with the modules that use them. Organization switching is not
built: the field and the server-side plumbing exist, but with one organization per seeded user
there is nothing to switch between, and shipping the UI now would mean shipping it untested.

**Two things this phase changed in the plan**, both recorded in
[DECISIONS.md](./DECISIONS.md): pnpm was replaced by npm (corepack cannot install its shims
without administrator rights on this machine), and TypeScript was pinned to 5.9 instead of 7.0
because the ESLint toolchain is not built against 7 yet.

---

## Phase 2 — Fleet Command ✅

*"What is happening with my fleet?"*

* Vessel CRUD (administrator), IMO checksum and MMSI validation, archive instead of delete.
* Fleet list: server-side filter by type/status/search, sorting, pagination.
* `MockAISProvider`: deterministic movement, `source: SIMULATED`, position history with the
  50 m/60 s persistence rule.
* Fleet map (Leaflet, dark basemap): status-coloured markers, selection, side panel, popup,
  fit-to-bounds. Isolated client component, dynamically imported.
* Vessel detail page with tabs; `Overview` fully implemented, remaining tabs render an
  `EmptyState` that names the phase that fills them — visible honesty rather than a dead tab.
* `VesselCard`, `StatusBadge`, `DataTable`, `MapPanel`.

**Acceptance — met, verified against a running instance on 2026-07-26:**

* 8 seeded vessels render in the fleet view; the header reads "6 of 8 vessels reporting", and the
  two that are not are exactly the ones the domain excludes: OC Guardian (alongside for
  maintenance) and OC Titan (an FPSO on station).
* Positions advance between syncs — `-25.13686,-43.37130` → `-25.13649,-43.37029` for OC Atlantic.
* Every position carries `SIMULATED` in the database and a "Simulated" badge in the UI; six badges
  for six reporting vessels.
* The recording rule suppresses redundant history: two back-to-back syncs recorded **0** new fixes
  while still refreshing the denormalised position.
* `/api/cron/ais-sync` returns 401 without its token and 200 with it, and refuses to run at all
  (503) when `CRON_SECRET` is unset in production.
* 66 tests pass, including a fleet-query isolation suite: another organization sees an empty fleet
  and cannot open a vessel by id.

**Two defects this phase found, both by exercising it rather than reading it:**

1. The fleet page passed only vessels *with a position*, so the vessel list hid the rest — a hull
   that had never reported vanished from its own fleet. The map skips them; the list must not.
2. `shouldRecordFix` had to be written against a corrected rule. DATABASE.md §7 specified "50 m
   **or** 60 s elapsed", which stores everything, since the 60 s branch is true on every poll. The
   implemented rule is: 50 m of movement, or a 15-minute heartbeat while stationary.

**Deferred deliberately:** no generic `DataTable` was extracted — one table does not justify the
abstraction, and inventing it now would mean designing for callers that do not exist. Vessel
create/edit forms are not built: the actions, validation and audit exist and are tested, but an
administrator CRUD screen belongs with the admin module, and shipping a form now would mean shipping
it untested. Clustering waits for a fleet large enough to need it.

**Not verified:** the "still behaves after 20 minutes open" criterion. The map is confined to one
component, markers are keyed and Leaflet layers are managed by react-leaflet, but a long-running
soak test needs a browser session — Playwright is phase 10, so this remains an untested claim
rather than a passed one.

---

## Phase 3 — Operations Center ✅

*"What is happening with my operations?"*

* Operation CRUD with code generation (`OP-2026-0042`).
* Status machine with the allowed-transition table; illegal transitions rejected server-side;
  every transition writes an `OperationEvent`.
* Views: list with filters, timeline (planned vs. actual), and per-vessel schedule.
* Vessel double-booking detection on overlapping operations.
* Vessel detail → `Operations` tab.
* Global activity feed reading `OperationEvent` (the first consumer of the events table).
* Tests: every legal and illegal transition, code generation under concurrency.

**Acceptance — met, exercised against the database on 2026-07-26:**

```text
initial:  PLANNED       actualStart=null
→ PREPARING             actualStart=null   actualEnd=null
→ READY                 actualStart=null   actualEnd=null
→ IN_PROGRESS           actualStart=21:38  actualEnd=null
→ COMPLETED             actualStart=21:38  actualEnd=21:38
COMPLETED → PLANNED refused: "Completed is a final status. Create a new
operation instead of reopening this one."
4 events recorded
```

* `/operations` renders the 20 seeded operations, reports 4 under way and 4 delayed, and draws
  plan-versus-actual bars against a now line.
* The detail page for an operation that is `IN_PROGRESS` offers exactly **Suspended** and
  **Completed** — the buttons come from the same transition table the server enforces, so the UI
  cannot offer a move the action refuses.
* The vessel's Operations tab lists that vessel's three operations; the activity feed appears on
  both the operations page and the Command Center.
* 118 tests, including every legal and illegal transition, the timestamp rules, half-open window
  comparison, and a tenant-isolation suite for the operations queries.

**The test that changed the implementation.** Codes were allocated by reading the highest existing
code and retrying on conflict. With ten concurrent creates that **failed**: each retry round only
lets one caller through, so the worst case needs as many attempts as there are callers — it breaks
exactly when the product is busy. Replaced by an `OperationCounter` row per (organization, year)
incremented in a single upsert, which serialises only the allocation. The test now runs **twenty**
concurrent creates and gets twenty contiguous codes.

**Known limitation, stated rather than implied.** The double-booking check runs inside the writing
transaction, but PostgreSQL's default isolation still lets two concurrent transactions each read a
clear schedule and both commit. Closing that needs an exclusion constraint over a time range; until
then the check catches the case that actually happens (a person planning against a schedule they can
see) and not a simultaneous double insert.

**Deferred:** create and edit forms for operations. The actions, validation, scheduling rules and
audit exist and are tested; what is missing is a planning screen, and it belongs with the admin
module rather than bolted onto a read-only view.

---

## Phase 4 — Environmental Intelligence ✅

*"Does the environment allow us to continue?"*

* `WeatherProvider` interface; Open-Meteo implementation (forecast + marine endpoints); mock
  implementation for tests and offline work.
* Persist observations and forecasts with provider and source; scheduled refresh per location;
  serve from the database and show staleness when a refresh fails.
* **Weather Window engine** (pure, unit-tested first): per-operation-type limits →
  `Favorable | Marginal | Unsafe` **with the breaching metrics**.
* Weather page: current conditions per location, forecast charts (Recharts), window timeline
  showing when an operation type becomes workable.
* Weather verdict surfaced on the operation and vessel views.
* Tests written before the implementation, exactly at each threshold boundary.

**Acceptance — met, verified end to end on 2026-07-26 against live Open-Meteo data:**

Real conditions at Santos Basin SB-14 (5 kn, 1.72 m, 18.1 NM) on a cargo operation, then the same
operation with the wind raised to 31 kn:

```text
before:  Favorable   "All metrics within limits"
after:   Unsafe      "Wind 31 kn against limit 28 kn"
                     "Gusts 38 kn against limit 33 kn"
                     "Changes to favorable at 23:00Z"
```

The last line is beyond the criterion: it comes from the stored forecast, so the panel says not only
that work is stopped but when it can resume.

* Live refresh stored **6 observations and 288 forecast hours** across the six locations, every row
  tagged `REAL` / `open-meteo`, with visibility converted from Open-Meteo's metres to nautical miles.
* With today's real sea, five of six locations read **Marginal for crew transfer** (1.6–1.9 m against
  a 1.5 m marginal limit) and the Vitória anchorage reads Favorable — the same water, different
  answers per operation type, which is the point of the module.
* 163 tests: 20 on the window engine written **before** the implementation (confirmed failing first),
  13 on the providers, and 11 integration tests covering the write path and the tenant boundary.

**Two defects this phase produced, both worth recording:**

1. `refreshWeather` used `upsert`, which the tenant-scoped client refuses — an upsert addresses its
   row by unique key alone and Prisma will not accept the organization filter beside it. The guard
   caught it at runtime, but **no test did**, because every weather test wrote its fixtures with
   `create` and never exercised the service. There is now a test for the write path.
2. The suite talked to the real Open-Meteo, so it failed twice and then passed with no code change.
   Tests and CI now force the deterministic mocks: a flaky suite is worse than a slow one, and CI
   should not hammer somebody's free service on every push.

**Deferred:** the "weather window timeline" showing when each operation type becomes workable across
the horizon. The per-operation panel already answers "can we work now, and when does that change";
a full grid of types against hours belongs with the analytics views in phase 8.

---

## Phase 5 — Risk & Alerts 🔜

*"What could go wrong?" and "What needs action?"*

* **Risk Engine**: score, level bands, configurable thresholds; risk CRUD; interactive 5×5
  matrix with drill-down; mitigation actions.
* **Alert Center**: lifecycle Unread → Acknowledged → Resolved, assignment, `AlertEvent`
  history, filters by type/severity/status.
* Alert generation from domain rules: weather breach (Phase 4), operation delay, critical risk
  opened. Deduplication via the partial unique index — one open alert per source.
* Alert badge in the shell with client-side polling.
* Tests: matrix boundaries (4/5, 9/10, 16/17), deduplication under repeated evaluation, RBAC on
  acknowledge vs. resolve.

**Acceptance:** an evaluation loop that runs 96 times produces one open weather alert, not 96;
an operator can acknowledge it and cannot resolve it.

---

## Phase 6 — Asset Monitoring 🔜

*"Which equipment is causing problems?"*

* Asset CRUD, criticality, operating hours, maintenance records.
* Health rollup per vessel; overdue-maintenance detection raising alerts.
* Asset views: fleet-wide health board, per-vessel tab, asset history.
* **Vessel Readiness Score** implemented and exposed with its full breakdown — this phase is
  where the score becomes real, because assets are its heaviest input.
* Tests: score formula, band boundaries, degraded input handling.

**Acceptance:** setting a critical asset to `FAILURE` lowers its vessel's readiness score by
exactly the documented contribution — `severity 25 × criticality 2 = 50` off the asset sub-score,
which is `0.30 × 50 = 15` points off the total — and the UI names that asset as the cause.

Note the band does **not** necessarily change: a vessel at 100 drops to 85, which is still the
bottom of `Ready`. That is the formula behaving correctly, not a bug, and the acceptance test
asserts the arithmetic rather than a band transition. A test that asserted "band moves" would
either fail honestly or push someone to inflate the asset weight to make it pass — which is how
a scoring model gets corrupted to satisfy its own test.

---

## Phase 7 — Incident Management 🔜

* Incident reporting with vessel/operation/asset context, categories, severities.
* Investigation workflow, probable cause, corrective actions with owners and due dates.
* Status machine; closing blocked while corrective actions remain open.
* Incident history on vessel and operation pages.

**Acceptance:** an incident cannot be closed while a corrective action is open, and the refusal
explains which one.

---

## Phase 8 — Analytics & Command Center 🔜

* SQL-aggregated indicators: operations completed/cancelled/delayed, fleet availability,
  downtime, incident frequency by category, asset utilisation, alert response time.
* **Operational Readiness Score** at organization level and the Operational Status panel.
* Command Center assembled from every module's read model: status panel, KPI cards, fleet map,
  active operations, critical alerts, risk overview, environmental conditions, asset health,
  activity feed.
* Global search / command palette (Ctrl+K) across vessels, operations, assets, alerts,
  incidents.
* Performance pass: query plans, index verification, bundle analysis, Lighthouse.
* Server-Sent Events **only if** measurement shows polling is a real problem.

**Acceptance:** the Command Center renders under the performance budget with the full seed
loaded, and every number on it links to the records that produced it.

---

## Phase 9 — Ocean AI 🔜

* `AIProvider` implementation over a real LLM; the null provider stays the default.
* Read-only, tenant-scoped tools: `getFleetStatus`, `getActiveOperations`,
  `getWeatherExposedOperations`, `getCriticalAlerts`, `getAssetFailureHistory`,
  `getOperationalSummary`.
* Chat UI with streaming, suggested questions, and **tool-call citations under every answer**.
* Per-organization quota and cost logging; graceful degradation when unconfigured.
* Tests: tool schemas, tenant scoping of tool execution, behaviour when the provider fails.

**Acceptance:** "Which vessels require attention?" returns an answer whose every claim maps to a
cited tool result, and the same question asked from another organization's session cannot see
the first organization's vessels.

---

## Phase 10 — Production Readiness 🔜

* Playwright E2E on the critical paths; accessibility audit (keyboard, focus, contrast, ARIA).
* Health and readiness endpoints, token-protected metrics, `ErrorTracker` interface with a
  no-op default.
* Append-only database grants on `AuditLog`; RLS evaluated as a backstop.
* Backup and restore procedure, verified by an actual restore.
* Deployment (Vercel + Neon), preview environments, migration-drift check in CI.
* Documentation pass: screenshots, `API.md` finalised, ADRs updated with real consequences.

---

## Beyond v1 (not scheduled)

Real AIS integration · geofencing and safety zones with PostGIS · predictive maintenance on
`MaintenanceRecord` + operating-hours history · shift handover reports · mobile-first operator
view · webhook/e-mail notifications · public read-only status page for clients · full multi-org
self-service onboarding.

Each of these is written down precisely so it does **not** get built early. Scope discipline is
the main risk to this project (risk #2 in `ARCHITECTURE.md`).
