import 'server-only'

import { headers } from 'next/headers'

import type { TenantContext } from '@/lib/auth/tenant-context'

import { forTenant, type TenantDb } from './tenant'

/**
 * Runs a mutation and its audit row in one transaction, scoped to the caller's
 * organization.
 *
 * Two guarantees, and both matter:
 *
 * 1. If the audit write fails, the change rolls back. An audit trail that can
 *    silently disagree with the data is worse than none, because it is trusted.
 * 2. The transaction comes from `forTenant(ctx)`, so tenant scoping still applies
 *    inside it. Reaching for the raw client here is the obvious move — that is
 *    where `$transaction` appears to live — and it would have made every audited
 *    mutation the one write path with no tenant filter.
 */

/** The transaction handle: the tenant-scoped client minus what cannot run inside a transaction. */
export type TenantTransaction = Omit<
  TenantDb,
  '$transaction' | '$connect' | '$disconnect' | '$extends'
>

export type AuditEntry = {
  /** Domain event, not HTTP verb: "operation.status_changed". */
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}

/** Never written to the audit trail, at any depth, even if a caller passes them. */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'token',
  'secret',
  'accessToken',
  'refreshToken',
  'apiKey',
])

const MAX_DEPTH = 6

/**
 * Deep copy with sensitive keys replaced.
 *
 * Arrays stay arrays: the first version fed them to Object.entries and turned
 * `[a, b]` into `{0: a, 1: b}`, quietly corrupting the diff this trail exists to
 * preserve. Nesting is followed, because a redaction that only covers the top
 * level protects nothing once a caller passes a whole record.
 */
function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1))

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      REDACTED_FIELDS.has(key) ? '[redacted]' : redact(entry, depth + 1),
    ]),
  )
}

/** `undefined` leaves the column NULL; Prisma's Json input rejects raw undefined. */
function auditJson(value: unknown) {
  if (value === undefined) return undefined
  return redact(value) as never
}

async function requestMetadata() {
  try {
    const headerList = await headers()
    return {
      // x-forwarded-for is a list; the first entry is the client.
      ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: headerList.get('user-agent'),
    }
  } catch {
    // Outside a request (seed, script): nothing to record, which is fine.
    return { ipAddress: null, userAgent: null }
  }
}

export async function withAudit<T>(
  ctx: TenantContext,
  entry: AuditEntry | ((result: T) => AuditEntry),
  mutate: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const { ipAddress, userAgent } = await requestMetadata()

  return forTenant(ctx).$transaction(async (tx) => {
    const result = await mutate(tx)
    const record = typeof entry === 'function' ? entry(result) : entry

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        before: auditJson(record.before),
        after: auditJson(record.after),
        ipAddress,
        userAgent,
      },
    })

    return result
  })
}
