# Ocean Command — Security Architecture

> Status: **Phase 1 — enforced.** The control status table in §11 says what is implemented and
> what is not, including the gaps. Nothing here is described as active unless that table agrees.

---

## 1. Assets worth protecting

Ranked by what an attacker would actually want, and by what would hurt the operator most:

1. **Cross-tenant operational data** — vessel positions, operations schedules and incident
   reports of another organization. Position data reveals commercial activity; incident data is
   legally sensitive. *This is the highest-value target in the system.*
2. **Account credentials and sessions** — an operator session can change operation status and
   acknowledge critical alerts.
3. **Audit trail integrity** — an attacker who can edit `AuditLog` erases their own presence.
4. **Provider secrets** — API keys for weather/AIS/LLM providers.
5. **Availability of the Command Center** — a blank command center during an operation is an
   operational impact, not merely an outage.

---

## 2. Authentication

**Library: Better Auth (`better-auth`, 1.6.25 stable).** Chosen over Auth.js v5, whose stable
channel is still `next-auth@4` while v5 remains at `5.0.0-beta.32` — verified on npm, not
assumed. Betting the authentication layer on a long-running beta is the kind of dependency risk
that is cheap to avoid at Phase 0. See [ADR-003](./adr/003-authentication.md).

| Control | Decision |
| --- | --- |
| Method | E-mail + password for the MVP; OAuth (GitHub/Google) is a drop-in later. |
| Password hashing | Argon2id (memory-hard). Never bcrypt-with-defaults, never SHA-anything. |
| Password policy | Minimum 12 characters (enforced). No forced rotation, no composition rules — they push people to `Password1!`. A common-password check is intended and **not yet implemented** — see §11. |
| Session | Opaque token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. Server-side `Session` rows, so revocation is immediate. No JWT: a stateless token cannot be revoked when a coordinator's account is compromised mid-shift. |
| Session lifetime | 8 hours (one shift) with sliding renewal every hour. No absolute cap yet: Better Auth's `expiresIn`/`updateAge` express the sliding window, and a hard ceiling needs its own check. |
| Rate limiting | 5 failed sign-ins per account per 15 min, plus per-IP limiting on the auth routes. Generic error message — never "user not found". |
| Sign-out | Deletes the session row; all tabs lose access on the next request. |

**Never in the token or cookie:** role, organization id, permissions. They are read from the
database on every request. A cookie that carries `role=ADMINISTRATOR` is a cookie someone will
eventually try to forge, and a user demoted mid-session must lose access immediately.

---

## 3. Tenant context

Every authenticated request resolves exactly one context, server-side:

```ts
type TenantContext = {
  userId: string
  organizationId: string
  role: Role
  isDemo: boolean
}
```

Rules, all of them hard:

* `getTenantContext()` is the **only** way to obtain it. It reads the session cookie, loads the
  active `Membership`, and throws `AuthenticationError` if absent.
* **No server action or query accepts `organizationId` as a parameter.** If a function needs a
  tenant, it takes a `TenantContext`. This makes tenant confusion a type error rather than a
  code-review outcome.
* Users belonging to several organizations pick an active one; the choice is stored server-side
  in the session row, **not** in a client-writable cookie.
* Every data-access helper in `lib/db` requires a `TenantContext` in its first parameter and
  injects `organizationId` into the `where` clause. ESLint forbids importing the raw Prisma
  client outside `lib/db`.

---

## 4. Authorization (RBAC)

A single permission matrix in `lib/auth/permissions.ts`. Permissions are
`resource:action` strings; roles map to permission sets. Checks are always server-side —
`authorize(ctx, 'operation:update', resource)` — and the UI merely *reflects* them by hiding
controls the user cannot use.

| Permission | Administrator | Operations Manager | Operator | Viewer |
| --- | :-: | :-: | :-: | :-: |
| `dashboard:read`, `fleet:read`, `operation:read`, `weather:read`, `risk:read`, `alert:read`, `asset:read`, `incident:read`, `analytics:read` | ✓ | ✓ | ✓ | ✓ |
| `operation:create`, `operation:update` | ✓ | ✓ | — | — |
| `operation:transition` (start / suspend / complete) | ✓ | ✓ | ✓ | — |
| `operation:delete`, `operation:cancel` | ✓ | ✓ | — | — |
| `vessel:create`, `vessel:update`, `vessel:archive` | ✓ | — | — | — |
| `vessel:status_update` | ✓ | ✓ | ✓ | — |
| `alert:acknowledge`, `alert:assign` | ✓ | ✓ | ✓ | — |
| `alert:resolve` | ✓ | ✓ | — | — |
| `risk:create`, `risk:update` | ✓ | ✓ | — | — |
| `risk:close`, `risk:accept` | ✓ | ✓ | — | — |
| `asset:create`, `asset:update` | ✓ | ✓ | — | — |
| `asset:status_update`, `asset:log_reading` | ✓ | ✓ | ✓ | — |
| `incident:create` | ✓ | ✓ | ✓ | — |
| `incident:investigate`, `incident:close` | ✓ | ✓ | — | — |
| `document:upload` | ✓ | ✓ | ✓ | — |
| `user:*`, `organization:*`, `integration:*` | ✓ | — | — | — |
| `audit:read` | ✓ | ✓ (read-only) | — | — |
| `ai:query` | ✓ | ✓ | ✓ | ✓ |

Two deliberate shapes in this matrix:

* **Operators record reality; managers change the plan.** An operator can start, suspend and
  complete an operation and report an incident — that is their job at 03:00 — but cannot
  reschedule or cancel one.
* **Acknowledging is not resolving.** Any operator can take ownership of an alert; declaring it
  resolved is a supervisory act. That distinction is what makes the alert trail meaningful.

**Object-level checks.** Role permission is necessary, not sufficient: `authorize()` also
verifies the target record belongs to `ctx.organizationId`. A valid id from another tenant must
return **404, not 403** — a 403 confirms the record exists, which is itself a leak.

---

## 5. Input validation

* Every server action and route handler parses its input with **Zod** before anything else. The
  parsed value is used; the raw input is never touched again.
* Validation lives in `features/*/schemas/` and is shared with the client form, so client and
  server enforce the same contract from one definition. Client validation is UX; server
  validation is the control.
* Domain invariants that Zod cannot express (status transitions, `plannedEnd > plannedStart`,
  risk score consistency) are checked in the domain layer, then again by database constraints.
* Ids are validated as ids and then resolved **within the tenant scope** — the ownership check
  is what stops IDOR, not the format check.
* Uploads: extension and MIME allow-list, size cap, randomly generated storage key, never the
  user-supplied filename on disk, and files served through an authorizing route handler — never
  from a public bucket path.

---

## 6. Common web risks and the specific control

| Risk | Control in this system |
| --- | --- |
| Broken access control / IDOR | `TenantContext` required by every query; object-level ownership check; 404 for foreign ids; per-module isolation tests. |
| SQL injection | Prisma parameterises everything. `$queryRaw` is allowed only with tagged templates, and any use requires a comment justifying it. |
| XSS | React escapes by default. `dangerouslySetInnerHTML` is banned by ESLint. A strict Content-Security-Policy with per-request nonces (no `unsafe-inline`). |
| CSRF | `SameSite=Lax` cookies plus Next.js server-action origin verification; no state-changing GET requests. |
| Session hijacking | `httpOnly` + `Secure` cookies, HSTS, session rotation on privilege change, server-side revocation. |
| Mass assignment | Zod schemas are explicit allow-lists; Prisma is never fed a request body. |
| Secrets in the client | `env.ts` parses server and client variables in two separate objects; only `NEXT_PUBLIC_*` reaches the browser. CI greps the build output for known secret patterns. |
| Enumeration | Generic auth errors; constant-ish response timing on sign-in; no "e-mail already registered" on public forms. |
| Denial of wallet | Provider calls are cached in the database and rate-limited per organization — an LLM or weather endpoint hit in a loop is a cost incident. |
| Dependency risk | Dependabot, `pnpm audit` in CI, and a deliberately small dependency list. |
| Log leakage | Structured logs with a redaction list (password, token, cookie, authorization). Errors returned to the client carry a correlation id, never a stack trace. |

**Security headers** (`next.config.ts` + middleware): `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/microphone/geolocation, and
a CSP whose only external origins are the basemap tile host and the weather API.

---

## 7. Audit

Every mutation writes an `AuditLog` row **inside the same transaction** as the change. If the
audit write fails, the change rolls back — an audit trail that can silently disagree with the
data is worse than none, because it is trusted.

Recorded: actor, organization, action (`operation.status_changed`), entity type and id,
before/after diff (with sensitive fields redacted), IP, user agent, timestamp.

`AuditLog` is append-only: no update or delete path exists in the application, and the
application database role is granted only `INSERT` and `SELECT` on that table (Phase 10).
Administrators can read the trail; nobody can edit it through the product.

---

## 8. Secrets and configuration

* `src/config/env.ts` parses `process.env` with Zod at startup. A missing or malformed variable
  **fails the boot**, rather than surfacing as `undefined` in production three days later.
* `.env` is git-ignored; `.env.example` documents every variable with a description and whether
  it is required. Secret scanning runs in CI on every push.
* Rotation: provider keys are read from the environment only, never persisted in the database,
  so rotation is a redeploy.

| Variable | Required | Purpose |
| --- | :-: | --- |
| `DATABASE_URL` | ✓ | PostgreSQL connection (pooled). |
| `DIRECT_DATABASE_URL` | ✓ | Unpooled connection for migrations. |
| `BETTER_AUTH_SECRET` | ✓ | Session token signing. Minimum 32 bytes. |
| `BETTER_AUTH_URL` | ✓ | Canonical application URL. |
| `AIS_PROVIDER` | — | `mock` (default) \| future real provider. |
| `WEATHER_PROVIDER` | — | `open-meteo` (default) \| `mock`. |
| `AI_PROVIDER` | — | `null` (default) \| `openai` \| `anthropic` — Phase 9. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Only when the AI provider is enabled. |
| `METRICS_TOKEN` | — | Protects `/api/metrics`. **If unset in production, the route is not registered at all** — a metrics endpoint that fails open is a monitoring-shaped information leak. |

---

## 9. Ocean AI security (Phase 9)

* Tools execute with the **caller's** `TenantContext`. The model cannot request a wider scope,
  because the scope is not part of the tool input.
* Tools are **read-only** in the first AI release. State-changing tools require a human approval
  step, designed separately.
* Every tool result is size-capped before entering the prompt, so a large query cannot blow the
  context window or the bill.
* Prompt injection is assumed: user-supplied text (incident descriptions, notes) may contain
  instructions. It is passed as *data*, never concatenated into the system prompt, and the model
  has no tool capable of writing, so the blast radius of a successful injection is a wrong
  answer — not a wrong action.
* Per-organization request quotas and cost logging from the first AI call.

---

## 10. Vulnerability handling

`SECURITY.md` at the repository root points here. Reports go to a private channel, not a public
issue. This is a portfolio project with no production users: there is no SLA claim, and the
document says so rather than inventing one.

---

## 11. Control status

| Control | Status |
| --- | --- |
| Threat model, RBAC matrix, tenant-context design | ✅ Phase 0 |
| Auth, database sessions, Argon2id, env validation | ✅ Phase 1 |
| Tenant-scoped data access + isolation tests | ✅ Phase 1 |
| Audit log inside the mutation transaction, with redaction | ✅ Phase 1 |
| Security headers + nonce-based CSP + sign-in rate limiting | ✅ Phase 1 |
| Object-level authorization across all modules | 🚧 Phases 2–7 (the gate exists and is tested; each module wires it as it lands) |
| AI tool sandboxing | 🔜 Phase 9 |
| Append-only DB grants, RLS backstop, pen-test pass | 🔜 Phase 10 |

### Audited mutations are tenant-scoped

`withAudit()` runs on `forTenant(ctx).$transaction`, not on the raw client. The first version used
the raw client — the natural place to look for `$transaction` — which would have made every audited
mutation the single write path with no tenant filter, in a codebase whose whole isolation story is
that such a path does not exist. Verified: the extension does apply inside the transaction, and a
write naming another organization is overruled. Covered by
`tests/integration/audit.test.ts`.

### What Phase 1 actually proved

Verified against a running instance, not asserted:

* A wrong password and an unknown e-mail return the same 401 and the same message; the sixth
  attempt within 15 minutes returns 429.
* `/command-center` without a session redirects to sign-in. The check is in the layout, not the
  middleware, because middleware sees a cookie and a cookie is not a session.
* Tenant isolation: another organization cannot read, update or delete a record by id, and a
  `create` naming a foreign `organizationId` is overruled to the caller's own.
* The navigation and the Command Center's module list are both filtered by permission. The
  first version filtered only the sidebar — an Operator could see that an Administration module
  existed. Caught by testing the rendered page for each of the four roles rather than trusting the
  code path.

### Known gaps, stated rather than implied

* **Passwords are not checked against a common-password list yet.** The 12-character minimum is
  enforced; the breach-list check named in §2 is not written.
* **Rate-limit state is in memory.** It resets when the process restarts, and it does not span
  instances. Fine for one process; needs shared storage before there are several.
* **`AuditLog` is append-only by convention, not by grant.** No update or delete path exists in
  the application, but the database role can still do both. The `INSERT`/`SELECT`-only grant is
  Phase 10.
* **No E2E test covers the sign-in flow.** The API path was verified by hand against a running
  server; the browser path — form submit followed by the redirect into the Command Center — is
  covered only by typecheck, because driving a server action needs a real browser. Playwright is
  Phase 10, so until then a regression there would be caught by a person, not by CI.
