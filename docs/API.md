# Ocean Command — Internal API Contracts

> Status: **Phase 0 — conventions**. No endpoint or server action exists yet. This document
> fixes the contract shape so that every module written from Phase 1 onwards looks the same.
> Concrete signatures are added to this file as each phase lands.

Ocean Command has no public REST API in v1. Its server surface is three kinds of callable:

| Surface | Used for | Where |
| --- | --- | --- |
| **Query functions** | Reads, called from Server Components | `features/*/queries/` |
| **Server Actions** | Writes, called from Client Components | `features/*/actions/` |
| **Route Handlers** | Streaming, health, scheduled jobs, file serving | `app/api/` |

Server actions are not HTTP endpoints in the usual sense, but they *are* a network boundary
reachable by anyone with a session. They are documented, validated and authorized exactly as if
they were public — because in every way that matters to an attacker, they are.

---

## 1. Query functions

```ts
// features/fleet/queries/list-vessels.ts
import 'server-only'

export async function listVessels(
  ctx: TenantContext,
  params: ListVesselsParams,
): Promise<Paginated<VesselListItem>>
```

Rules:

* `TenantContext` is always the first parameter. There is no overload without it.
* Input is a typed params object, parsed by Zod when it originates from a URL search param.
* The return type is a **view model** — never a Prisma entity. The presentation layer must not
  depend on the schema's shape, and a Prisma type leaking into a component takes fields with it
  that were never meant to be rendered.
* Reads are never cached across tenants. Cache tags always include the organization id:
  ``revalidateTag(`org:${ctx.organizationId}:vessels`)``.
* Pagination is mandatory on list queries.

```ts
type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}
```

---

## 2. Server Actions

Every action follows the same six steps, in this order, with no exceptions:

```ts
'use server'

export async function updateOperationStatus(
  input: UpdateOperationStatusInput,
): Promise<ActionResult<OperationView>> {
  const ctx = await getTenantContext()                       // 1. session — never client input
  const parsed = updateOperationStatusSchema.safeParse(input) // 2. validate
  if (!parsed.success) return fieldErrors(parsed.error)

  const operation = await findOperation(ctx, parsed.data.id)  // 3. tenant-scoped load (404 if foreign)
  authorize(ctx, 'operation:transition', operation)           // 4. authorize on the object

  assertTransitionAllowed(operation.status, parsed.data.to)   // 5. domain rule

  return withAudit(ctx, 'operation.status_changed', async (tx) => {  // 6. transaction + audit
    /* ... */
  })
}
```

### Result type

Actions never throw across the boundary. They return a discriminated result, so the client
handles failure as data:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError }

type ActionError =
  | { kind: 'VALIDATION'; fields: Record<string, string[]> }
  | { kind: 'FORBIDDEN' }
  | { kind: 'NOT_FOUND' }
  | { kind: 'DOMAIN_RULE'; code: string; message: string }   // message is safe to display
  | { kind: 'CONFLICT'; message: string }
  | { kind: 'PROVIDER_UNAVAILABLE'; provider: string }
  | { kind: 'INTERNAL'; correlationId: string }               // no details, ever
```

`DOMAIN_RULE` messages are written for the operator, not the developer: *"An incident cannot be
closed while corrective actions remain open (2 open)."* `INTERNAL` carries only a correlation id
that matches a log line — a stack trace returned to a browser is an information leak.

### Naming

`verbNoun` in the imperative: `createOperation`, `acknowledgeAlert`, `archiveVessel`,
`updateAssetStatus`. The name states the domain event, not the HTTP verb — the audit action
string mirrors it (`operation.created`, `alert.acknowledged`).

---

## 3. Route Handlers

Used only where a server action does not fit.

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/health` | GET | public | Process liveness. No database access, no data. |
| `/api/ready` | GET | public | Readiness: database reachable, migrations applied, which providers are configured. |
| `/api/metrics` | GET | `METRICS_TOKEN` | Prometheus exposition. **Not registered at all when the token is unset in production.** |
| `/api/ai/chat` | POST | session | Streaming AI responses (Phase 9). |
| `/api/documents/[id]` | GET | session + object check | Serves a stored file after authorizing it. Files are never publicly addressable. |
| `/api/cron/weather-refresh` | POST | cron secret | Scheduled provider refresh (Phase 4). |

### Error envelope

Route handlers return a single JSON shape:

```jsonc
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "correlationId": "req_01J8Z..."
  }
}
```

Status codes: `400` validation · `401` unauthenticated · `403` authenticated but not permitted ·
`404` not found **or belonging to another organization** · `409` domain conflict · `422` valid
shape, invalid domain state · `429` rate limited · `500` internal · `503` provider unavailable.

The `404`-for-foreign-tenant rule is a security control, not an inconvenience — see
[SECURITY.md §4](./SECURITY.md).

---

## 4. Validation contracts

Schemas live in `features/*/schemas/` and are the single definition shared by the client form
and the server action:

```ts
export const createOperationSchema = z.object({
  name:         z.string().min(3).max(120),
  type:         z.nativeEnum(OperationType),
  vesselId:     z.string().cuid().optional(),
  locationId:   z.string().cuid().optional(),
  plannedStart: z.coerce.date(),
  plannedEnd:   z.coerce.date(),
  priority:     z.nativeEnum(Priority).default('MEDIUM'),
  notes:        z.string().max(2000).optional(),
}).refine((v) => v.plannedEnd > v.plannedStart, {
  message: 'Planned end must be after planned start',
  path: ['plannedEnd'],
})

export type CreateOperationInput = z.infer<typeof createOperationSchema>
```

Note what is **absent**: `organizationId`, `code`, `status`, `createdBy`. Server-owned fields are
never part of an input schema. If a field can be derived or is a privilege, the client does not
get to send it.

The same schemas are reused to generate JSON Schema for Ocean AI tool definitions (Phase 9), so
the model's tool contract and the application's validation cannot drift apart.

---

## 5. Provider interfaces

The full interfaces are specified in [ARCHITECTURE.md §7](./ARCHITECTURE.md). Contract rules
common to all of them:

* Every method takes explicit inputs; no ambient configuration or hidden globals.
* Failures throw `ProviderError` with the provider name and whether a retry is sensible; callers
  degrade one surface rather than failing the page.
* Every returned record carries `source` and the provider name, which are persisted.
* Timeouts are mandatory (5 s default) — a hanging third party must not hold a server component
  open.

---

## 6. Versioning

Internal callables have no version number: they ship with the UI that calls them. If a public
API is ever exposed, it starts at `/api/v1/` with an explicit deprecation policy — and it will
be a deliberate product decision, documented in a new ADR rather than an accident of leaving a
route handler public.
