# ADR-003 — Better Auth with database sessions; authorization owned by the application

* **Status:** Accepted
* **Date:** 2026-07-26
* **Phase:** 0

## Context

The system needs authentication (who is this?), tenant resolution (which organization?) and
authorization (what may they do?). Four roles, multi-organization membership planned, and an
audit requirement that every mutation is attributable. Sessions must be revocable: a compromised
operator account must lose access immediately, not at token expiry.

## Options considered

**A. Auth.js / NextAuth v5.** The default answer for Next.js and a large ecosystem. But on
2026-07-26 the `latest` tag on npm is still `next-auth@4.24.15`; v5 remains `5.0.0-beta.32`
— verified against the registry, not assumed. v4 does not fit App Router and Server Actions
well, and building the platform's identity layer on a years-long beta is avoidable risk.

**B. Better Auth (`better-auth@1.6.25`, stable).** TypeScript-first, database-session by
default, Prisma adapter, Argon2 support, plugins for organizations and admin. Younger project,
smaller ecosystem.

**C. Hand-rolled sessions** (`jose` + cookies + Argon2). Full control, no dependency — and the
obligation to get rate limiting, rotation, timing-safe comparison, CSRF and verification flows
right, forever. Authentication is the wrong place to demonstrate independence.

## Decision

**Option B — Better Auth with server-side session rows**, plus a rule that limits the blast
radius of the choice:

> The library authenticates. **The application authorizes.**

Roles, permissions and tenant scope live in `lib/auth/permissions.ts` and `TenantContext`, not
in the library's plugin configuration. Better Auth answers "who is this user?"; every "may they
do this?" is our own `authorize(ctx, permission, resource)`.

Session tokens are opaque and stored in the database. No JWT: statelessness is worthless here
and revocation is not.

## Consequences

**Positive.** A stable dependency rather than a beta. Immediate revocation and a queryable
session list. Because authorization is ours, replacing the auth library later touches sign-in,
session lookup and the user table — not a single permission check. OAuth providers are
configuration when they are wanted.

**Negative.** Smaller community than Auth.js; some integrations may need to be written. A
database read per request for the session — negligible at this scale, and it is what makes
revocation and live role changes correct. Being a young library, breaking changes are more
likely; the version is pinned exactly and upgrades are deliberate.

**Revisit if:** the project needs enterprise SSO (SAML/OIDC federation) that the library does not
cover, or Auth.js v5 reaches stable *and* offers something this setup lacks. Neither would
change the authorization design.
