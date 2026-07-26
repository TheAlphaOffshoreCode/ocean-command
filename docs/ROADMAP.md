# Ocean Command — Roadmap

Legend: ✅ Implemented · 🚧 In Development · 🔜 Planned

**Current state: Phase 0 complete. No application code exists yet.**

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

## Phase 1 — Foundation 🔜

*A person can sign in, see an empty but real command center, and every action is audited.*

* Next.js 16 + React 19 + TypeScript 7 (`strict`, `noUncheckedIndexedAccess`), ESLint, Prettier.
* Tailwind 4 + shadcn/ui, **design tokens first**: the command-center palette, density scale and
  typography are decided before any screen, so the product does not converge on a default admin
  look (risk #9 in `ARCHITECTURE.md`).
* PostgreSQL via Docker Compose locally, Neon for deployment. Prisma schema from `DATABASE.md`,
  first migration, `db:seed`.
* Better Auth: sign-in, sessions, password hashing, sign-out, rate limiting.
* `TenantContext`, `authorize()`, permission matrix, protected route group.
* `lib/db` tenant-scoped access helpers; ESLint rule banning the raw Prisma client elsewhere.
* Audit log helper wired into a transaction wrapper used by every mutation.
* Zod-validated `env.ts`, structured logger, typed error hierarchy, security headers.
* Application shell: top navigation, sidebar, user menu, organization switcher, `DEMO DATA`
  banner, and the shared state components (`Loading`, `Empty`, `Error`).
* Tests: RBAC matrix, tenant isolation on the first query module, audit-on-mutation.
* CI: lint → typecheck → test (with a Postgres service) → build, plus secret scan.

**Acceptance:** four seeded users sign in and land on a shell whose navigation reflects their
role. An operator's forbidden action fails server-side even when the request is forged by hand.

---

## Phase 2 — Fleet Command 🔜

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

**Acceptance:** 8 seeded vessels appear on the map, positions advance on refresh, every one is
labelled as simulated, and the map still behaves after 20 minutes open.

---

## Phase 3 — Operations Center 🔜

*"What is happening with my operations?"*

* Operation CRUD with code generation (`OP-2026-0042`).
* Status machine with the allowed-transition table; illegal transitions rejected server-side;
  every transition writes an `OperationEvent`.
* Views: list with filters, timeline (planned vs. actual), and per-vessel schedule.
* Vessel double-booking detection on overlapping operations.
* Vessel detail → `Operations` tab.
* Global activity feed reading `OperationEvent` (the first consumer of the events table).
* Tests: every legal and illegal transition, code generation under concurrency.

**Acceptance:** an operator moves an operation Planned → Preparing → In Progress → Completed,
each step timestamped, attributed and visible in the feed; Completed → Planned is refused.

---

## Phase 4 — Environmental Intelligence 🔜

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

**Acceptance:** raising forecast wind above a type's unsafe limit turns that operation's verdict
Unsafe on the operation page, and the UI names the metric that caused it.

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

**Acceptance:** setting a critical asset to `FAILURE` lowers its vessel's readiness score, moves
its band, and the UI shows exactly which asset caused the drop.

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
