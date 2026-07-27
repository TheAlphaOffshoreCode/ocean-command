import 'server-only'

import type { AlertSeverity, AlertStatus, AlertType, Prisma } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { OPEN_STATUSES } from '@/lib/domain/alert/lifecycle'

export type AlertListItem = {
  id: string
  code: string
  type: AlertType
  severity: AlertSeverity
  status: AlertStatus
  title: string
  description: string
  sourceModule: string
  createdAt: Date
  acknowledgedAt: Date | null
  resolvedAt: Date | null
  vessel: { id: string; name: string } | null
  operation: { id: string; code: string } | null
}

export type AlertFilters = {
  status?: AlertStatus
  severity?: AlertSeverity
  type?: AlertType
  openOnly?: boolean
  limit?: number
}

const SELECT = {
  id: true,
  code: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  description: true,
  sourceModule: true,
  createdAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
  vessel: { select: { id: true, name: true } },
  operation: { select: { id: true, code: true } },
} satisfies Prisma.AlertSelect

export async function listAlerts(
  ctx: TenantContext,
  filters: AlertFilters = {},
): Promise<AlertListItem[]> {
  const where: Prisma.AlertWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.openOnly && !filters.status ? { status: { in: [...OPEN_STATUSES] } } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  }

  return forTenant(ctx).alert.findMany({
    where,
    select: SELECT,
    // Reads the (organizationId, status, severity, createdAt DESC) index. Severity
    // first: an operations room reads worst-first, not newest-first.
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: filters.limit ?? 100,
  })
}

export type AlertCounts = {
  open: number
  unread: number
  critical: number
  high: number
}

/** Feeds the badge in the shell, so it must stay a counting query. */
export async function countAlerts(ctx: TenantContext): Promise<AlertCounts> {
  const db = forTenant(ctx)

  const [open, unread, critical, high] = await Promise.all([
    db.alert.count({ where: { status: { in: [...OPEN_STATUSES] } } }),
    db.alert.count({ where: { status: 'UNREAD' } }),
    db.alert.count({ where: { status: { in: [...OPEN_STATUSES] }, severity: 'CRITICAL' } }),
    db.alert.count({ where: { status: { in: [...OPEN_STATUSES] }, severity: 'HIGH' } }),
  ])

  return { open, unread, critical, high }
}

export type AlertEventEntry = {
  id: string
  type: string
  note: string | null
  actorId: string | null
  occurredAt: Date
}

export type AlertDetail = AlertListItem & {
  events: AlertEventEntry[]
  sourceRef: string | null
  assigneeId: string | null
}

export async function getAlert(ctx: TenantContext, alertId: string): Promise<AlertDetail | null> {
  const alert = await forTenant(ctx).alert.findFirst({
    where: { id: alertId },
    select: {
      ...SELECT,
      sourceRef: true,
      assigneeId: true,
      events: { orderBy: { occurredAt: 'desc' }, take: 50 },
    },
  })

  if (!alert) return null

  return {
    ...alert,
    events: alert.events.map((event) => ({
      id: event.id,
      type: event.type,
      note: event.note,
      actorId: event.actorId,
      occurredAt: event.occurredAt,
    })),
  }
}
