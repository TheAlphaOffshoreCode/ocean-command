import 'server-only'

import type { OperationEventType, OperationStatus } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'

export type ActivityEntry = {
  id: string
  occurredAt: Date
  type: OperationEventType
  fromStatus: OperationStatus | null
  toStatus: OperationStatus | null
  message: string | null
  operation: { id: string; code: string; name: string }
  vesselName: string | null
}

/**
 * The global activity feed.
 *
 * First consumer of `OperationEvent`, and the reason that table exists: "what has
 * happened on this shift" is a question a status column cannot answer. As other
 * modules land they contribute their own events, and this query grows a union
 * rather than the feed being rebuilt.
 *
 * Reads the `(organizationId, occurredAt DESC)` index, so it stays cheap as the
 * table grows.
 */
export async function getActivityFeed(ctx: TenantContext, limit = 25): Promise<ActivityEntry[]> {
  const events = await forTenant(ctx).operationEvent.findMany({
    orderBy: { occurredAt: 'desc' },
    take: limit,
    include: {
      operation: {
        select: { id: true, code: true, name: true, vessel: { select: { name: true } } },
      },
    },
  })

  return events.map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt,
    type: event.type,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    message: event.message,
    operation: {
      id: event.operation.id,
      code: event.operation.code,
      name: event.operation.name,
    },
    vesselName: event.operation.vessel?.name ?? null,
  }))
}
