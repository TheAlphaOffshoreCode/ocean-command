# ADR-005 — Shared-database multi-tenancy enforced by a required tenant context

* **Status:** Accepted
* **Date:** 2026-07-26
* **Phase:** 0

## Context

Ocean Command may become a SaaS product serving several maritime operators. Even the MVP needs
two organizations, if only so that tenant isolation can be tested. Vessel positions and incident
reports are commercially and legally sensitive: a cross-tenant leak is the worst failure this
system can have.

Tenancy cannot be added later. It determines every primary access path, every unique constraint
and every index.

## Options considered

**A. Database per tenant.** Strongest isolation, and unworkable here: N migrations per release,
N connections, no cross-tenant analytics, and a cost model incompatible with a free tier.

**B. Schema per tenant.** Weaker than A, still multiplies migration and connection management,
and Prisma has no first-class support for it.

**C. Shared schema with `organizationId` on every tenant-owned table.** One migration, one
connection pool, trivial to operate — and the isolation guarantee moves into application code,
which is exactly where mistakes happen. A single forgotten `where` clause is a breach.

## Decision

**Option C, with the guarantee made structural rather than remembered.**

1. **`organizationId` is non-nullable** on every tenant-owned table and is the **first column of
   every composite index**.
2. **Unique constraints are tenant-scoped:** `@@unique([organizationId, imo])`. Two operators
   may legitimately track the same vessel.
3. **`TenantContext` is a required parameter,** not ambient state. Every query and action takes
   it as its first argument. Forgetting the tenant becomes a type error instead of a silent leak.
4. **No mutation accepts `organizationId` from the client.** It comes from the server session,
   always.
5. **The raw Prisma client is unreachable outside `lib/db`,** enforced by ESLint. Data access
   goes through helpers that inject the filter.
6. **Foreign ids return 404, not 403.** A 403 confirms the record exists.
7. **One isolation test per query module,** seeded with two organizations. These tests are not
   optional and not deletable.

PostgreSQL Row-Level Security was considered as a database-level backstop. It is **not** in the
MVP: with a pooled serverless connection, setting a per-request session variable reliably needs
wiring that is easy to get subtly wrong — and RLS that is silently not applied is worse than no
RLS, because it invites relaxing the application-level checks. It is a Phase 10 candidate,
evaluated with a test that proves it engages.

## Consequences

**Positive.** One schema, one migration path, cheap to run. Cross-tenant analytics remain
possible for the platform owner. The design is already SaaS-shaped: adding a tenant is inserting
a row. The `Membership` table means a user can join a second organization without a data model
change.

**Negative.** Isolation depends on application discipline, so the controls above are load-bearing
rather than nice-to-have. Every query carries an extra predicate — negligible given the index
order. A `DELETE` bug can touch multiple tenants' rows in one statement, which is why deletion is
narrow and audited.

**Revisit if:** a customer contractually requires physical isolation, at which point option A
becomes a per-customer deployment of the same codebase — possible precisely because the tenant
boundary is already explicit everywhere.
