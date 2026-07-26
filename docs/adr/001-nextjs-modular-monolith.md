# ADR-001 — Next.js modular monolith as the application architecture

* **Status:** Accepted
* **Date:** 2026-07-26
* **Phase:** 0

## Context

Ocean Command needs a data-dense, interactive operations UI *and* a server side that enforces
tenant isolation, RBAC and domain rules. It is built by one developer, must run at near-zero
cost, and must read as professional engineering under review by tech leads. Expected load for
the foreseeable future: a handful of concurrent users and a demo dataset.

## Options considered

**A. Separate SPA + standalone API (React/Vite + Fastify or NestJS).**
Clean transport boundary, backend reusable by other clients. Costs two deployments, two
dependency trees, a hand-maintained HTTP contract, duplicated types or a codegen step, and
CORS/auth plumbing. Buys independent scaling that this workload will never need.

**B. Next.js with Server Components and Server Actions — one deployable.**
Server-rendered data-heavy pages without a client fetch layer, one type system end to end, one
deploy target with a real free tier. Trade-off: it is a framework-coupled architecture, and the
seam between "page" and "domain" must be enforced by discipline rather than by a network hop.

**C. Microservices per module** (fleet, operations, weather…).
Rejected without much deliberation: distributed transactions, service discovery and N deploys,
for a system whose entire dataset fits comfortably in one Postgres instance. This would be
architecture as decoration.

## Decision

**Option B — Next.js 16 (App Router) as a modular monolith**, with an enforced internal
structure: `presentation → application → domain`, infrastructure at the edge, feature modules
that expose a public `index.ts` and never reach into each other.

The seam that B does not give for free is bought explicitly:

* domain logic in `lib/domain`, pure, importing nothing;
* no Prisma or provider call outside the application/infrastructure layers;
* ESLint `no-restricted-imports` enforcing both rules;
* every server action following the same pipeline (session → Zod → authorize → domain →
  transaction+audit → revalidate).

## Consequences

**Positive.** One repository, one deploy, one type system. Server Components remove an entire
client data-fetching layer for read-heavy pages. Free-tier hosting is straightforward. A feature
module can later be extracted into a service because its boundary is already explicit.

**Negative.** Coupling to Next.js conventions; an App Router major version would be a real
migration. Layer discipline depends on lint rules and review, not on a compiler. Server Actions
are less explicit than an HTTP contract, so `API.md` documents them as if they were one.

**Revisit if:** a second client (mobile, partner integration) needs the same domain, or a module
develops a workload profile — heavy AIS ingestion, for instance — that starves the web process.
