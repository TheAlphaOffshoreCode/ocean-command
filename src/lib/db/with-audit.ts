import 'server-only'

import { headers } from 'next/headers'
import type { Prisma } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { prisma } from '@/lib/db/client'

/**
 * Runs a mutation and its audit row in one transaction.
 *
 * If the audit write fails, the change rolls back. That is the whole point: an
 * audit trail that can silently disagree with the data is worse than none,
 * because people trust it.
 */

export type AuditEntry = {
  /** Domain event, not HTTP verb: "operation.status_changed". */
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}

/** Fields never written to the audit trail, even if a caller passes them. */
const REDACTED_FIELDS = new Set(['password', 'passwordHash', 'token', 'secret', 'accessToken'])

function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object') return value as Prisma.InputJsonValue

  const source = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(source)) {
    output[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : entry
  }
  return output as Prisma.InputJsonValue
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
    // Outside a request (seed, script): no metadata to record, and that is fine.
    return { ipAddress: null, userAgent: null }
  }
}

export async function withAudit<T>(
  ctx: TenantContext,
  entry: AuditEntry | ((result: T) => AuditEntry),
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const { ipAddress, userAgent } = await requestMetadata()

  return prisma.$transaction(async (tx) => {
    const result = await mutate(tx)
    const record = typeof entry === 'function' ? entry(result) : entry

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        before: redact(record.before),
        after: redact(record.after),
        ipAddress,
        userAgent,
      },
    })

    return result
  })
}
