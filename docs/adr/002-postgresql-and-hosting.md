# ADR-002 — PostgreSQL with Prisma, on free-tier managed hosting

* **Status:** Accepted
* **Date:** 2026-07-26
* **Phase:** 0

## Context

The domain is unambiguously relational: vessels own assets, operations reference vessels and
locations, alerts reference all of them, and the audit trail must be transactionally consistent
with the data it describes. Running cost must be near zero. The schema will change on almost
every phase, so migration ergonomics matter as much as query performance.

## Options considered

**Database.** PostgreSQL versus MySQL versus SQLite. PostgreSQL wins on native enums, partial
indexes (required for alert deduplication), `jsonb` for audit diffs and organization settings,
window functions for analytics, and PostGIS as a later option. SQLite is tempting for a demo but
has no meaningful concurrency story and no free-tier managed equivalent worth deploying.

**ORM.** Prisma versus Drizzle versus raw SQL.
*Prisma:* best-in-class schema-as-source-of-truth and migration workflow, excellent generated
types, weaker at exotic SQL. *Drizzle:* closer to SQL, lighter runtime, but migrations and
relational queries need more hand-holding. *Raw SQL:* maximum control, and a hand-written
mapping layer that would consume the time this project should spend on the domain.

**Hosting.** Neon versus Supabase versus self-hosted. Neon: generous free Postgres, branching
per preview environment, pooled connections for serverless. Supabase: also free, but bundles
auth/storage/realtime this architecture deliberately owns itself — adopting it would make the
provider abstraction in ADR-004 pointless.

## Decision

**PostgreSQL 17 + Prisma 7**, Docker Compose locally, **Neon** free tier for deployed
environments, **Vercel** free tier for the application.

Boundaries set now, because the ORM should not become the architecture:

* Prisma types are **not** the domain types. Domain functions take plain structures; the
  application layer maps between them.
* Raw SQL is allowed, with tagged templates, where it is genuinely better — analytics
  aggregates, in particular. Each use carries a comment saying why.
* Constraints Prisma cannot express (CHECKs, partial unique indexes) are written by hand into
  migrations and covered by tests, not left to application code.

## Consequences

**Positive.** Zero cost. Schema-first workflow with reviewable migrations. Type safety from
database to component. Neon branching gives each PR a real database. Partial indexes and `jsonb`
are available exactly where the design needs them.

**Negative.** Prisma's client is heavy on serverless cold starts — mitigated by a singleton and
Neon's pooled endpoint. Neon's free tier suspends idle databases, so the first request after
idling is slow; acceptable for a demo, and disclosed in the README rather than hidden. Vendor
migration is a connection-string change, so the lock-in is low.

**Revisit if:** cold starts become the dominant latency, or an always-on worker (AIS ingestion)
is needed — at which point a small always-on host replaces the serverless assumption.
