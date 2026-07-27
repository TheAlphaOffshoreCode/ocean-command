import 'server-only'

import type { TenantContext } from '@/lib/auth/tenant-context'

import { prisma } from './client'

/**
 * Tenant-scoped data access.
 *
 * Every model that carries `organizationId` is listed here. The extension below
 * injects the filter on reads and the value on writes, so a query that forgets
 * the tenant is not a possible mistake rather than a caught one.
 *
 * Keep this list in sync with the schema — the test in tests/unit/tenant-models
 * fails if a model with an organizationId column is missing from it.
 */
export const TENANT_MODELS = new Set([
  // Membership included deliberately: listing "the users of this organization"
  // must never spill into another one. Resolving *which* organization a user
  // belongs to happens in lib/auth through the raw client, before a tenant is
  // known — that is the one legitimate unscoped read of this table.
  'Membership',
  'Vessel',
  'VesselPosition',
  // Written through raw SQL for atomicity, so the extension never sees it — but it
  // is tenant-owned, and the registry test checks the schema, not the call sites.
  'SequenceCounter',
  'Location',
  'Operation',
  'OperationEvent',
  'WeatherObservation',
  'WeatherForecast',
  'Risk',
  'Alert',
  'Asset',
  'Incident',
  'Document',
  'AuditLog',
])

/**
 * Operations we refuse on tenant models.
 *
 * `findUnique`, `update` and `delete` address a row by its unique key alone, and
 * Prisma will not accept a non-unique `organizationId` alongside it. Injecting
 * nothing would silently allow a cross-tenant read by id; injecting into `where`
 * would be rejected at runtime. So they are refused outright, and callers use
 * `findFirst` / `updateMany` / `deleteMany`, which are scopeable.
 *
 * A loud error beats a filter that looks applied and is not.
 */
const UNSCOPEABLE = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert'])

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
])

type WithWhere = { where?: Record<string, unknown> }
type WithData = { data?: Record<string, unknown> | Record<string, unknown>[] }

/**
 * Returns a Prisma client bound to one organization. This is the only handle
 * feature code is allowed to touch.
 */
export function forTenant(ctx: TenantContext) {
  const { organizationId } = ctx

  return prisma.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's generic operation hook is untyped by design
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || !TENANT_MODELS.has(model)) return query(args)

          if (UNSCOPEABLE.has(operation)) {
            throw new Error(
              `${model}.${operation}() cannot be tenant-scoped. Use findFirst/updateMany/deleteMany ` +
                `with the tenant filter, or go through a repository in src/lib/db.`,
            )
          }

          if (READ_OPERATIONS.has(operation)) {
            const scoped = args as WithWhere
            return query({ ...scoped, where: { ...scoped.where, organizationId } })
          }

          if (operation === 'create' || operation === 'createMany') {
            const { data } = args as WithData
            const stamp = (row: Record<string, unknown>) => ({ ...row, organizationId })
            return query({
              ...args,
              data: Array.isArray(data) ? data.map(stamp) : stamp(data ?? {}),
            })
          }

          return query(args)
        },
      },
    },
  })
}

export type TenantDb = ReturnType<typeof forTenant>
