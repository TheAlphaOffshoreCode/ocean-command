import 'server-only'

import type {
  OperationEventType,
  OperationStatus,
  OperationType,
  Priority,
} from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { allowedTransitions } from '@/lib/domain/operation/transitions'

export type OperationEventEntry = {
  id: string
  type: OperationEventType
  fromStatus: OperationStatus | null
  toStatus: OperationStatus | null
  message: string | null
  actorId: string | null
  occurredAt: Date
}

export type OperationDetail = {
  id: string
  code: string
  name: string
  description: string | null
  type: OperationType
  status: OperationStatus
  priority: Priority
  plannedStart: Date
  plannedEnd: Date
  actualStart: Date | null
  actualEnd: Date | null
  notes: string | null
  vessel: { id: string; name: string; status: string } | null
  location: { id: string; name: string; basin: string | null } | null
  createdAt: Date
  events: OperationEventEntry[]
  /** Total in the table, so a truncated list can say so instead of undercounting. */
  eventsTotal: number
  /** Where this operation can go next, from the transition table. */
  nextStatuses: OperationStatus[]
}

const EVENT_PAGE_SIZE = 100

/**
 * `findFirst`, not `findUnique`: the tenant filter has to be part of the query.
 * Null for an id belonging to another organization, which the page renders as 404 —
 * a 403 would confirm the record exists.
 */
export async function getOperation(
  ctx: TenantContext,
  operationId: string,
): Promise<OperationDetail | null> {
  const db = forTenant(ctx)

  const operation = await db.operation.findFirst({
    where: { id: operationId },
    include: {
      vessel: { select: { id: true, name: true, status: true } },
      location: { select: { id: true, name: true, basin: true } },
      events: { orderBy: { occurredAt: 'desc' }, take: EVENT_PAGE_SIZE },
    },
  })

  if (!operation) return null

  const eventsTotal = await db.operationEvent.count({ where: { operationId } })

  return {
    id: operation.id,
    code: operation.code,
    name: operation.name,
    description: operation.description,
    type: operation.type,
    status: operation.status,
    priority: operation.priority,
    plannedStart: operation.plannedStart,
    plannedEnd: operation.plannedEnd,
    actualStart: operation.actualStart,
    actualEnd: operation.actualEnd,
    notes: operation.notes,
    vessel: operation.vessel,
    location: operation.location,
    createdAt: operation.createdAt,
    events: operation.events.map((event) => ({
      id: event.id,
      type: event.type,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      message: event.message,
      actorId: event.actorId,
      occurredAt: event.occurredAt,
    })),
    eventsTotal,
    // Computed from the same table the server enforces, so the UI cannot offer a
    // button the action will refuse.
    nextStatuses: [...allowedTransitions(operation.status)],
  }
}
