import 'server-only'

import type { OperationStatus, OperationType, Prisma, Priority } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { TERMINAL_STATUSES } from '@/lib/domain/operation/transitions'

import type { OperationFilters } from '../schemas/operation'

export type OperationListItem = {
  id: string
  code: string
  name: string
  type: OperationType
  status: OperationStatus
  priority: Priority
  plannedStart: Date
  plannedEnd: Date
  actualStart: Date | null
  actualEnd: Date | null
  vessel: { id: string; name: string } | null
  location: { id: string; name: string } | null
  /** Started later than planned, or ran past its planned end while still open. */
  isDelayed: boolean
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

const LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  status: true,
  priority: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualEnd: true,
  vessel: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.OperationSelect

type OperationRow = Prisma.OperationGetPayload<{ select: typeof LIST_SELECT }>

export async function listOperations(
  ctx: TenantContext,
  filters: OperationFilters,
  now = new Date(),
): Promise<Paginated<OperationListItem>> {
  const where: Prisma.OperationWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.openOnly ? { status: { notIn: [...TERMINAL_STATUSES] } } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.vesselId ? { vesselId: filters.vesselId } : {}),
    ...(filters.search
      ? {
          OR: [
            { code: { contains: filters.search, mode: 'insensitive' } },
            { name: { contains: filters.search, mode: 'insensitive' } },
            { vessel: { name: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const db = forTenant(ctx)

  const [rows, total] = await Promise.all([
    db.operation.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { [filters.sort]: filters.direction },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.operation.count({ where }),
  ])

  return {
    items: rows.map((row) => toListItem(row, now)),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

/** The schedule for one vessel, for the vessel detail tab. */
export async function listVesselOperations(
  ctx: TenantContext,
  vesselId: string,
  limit = 50,
  now = new Date(),
): Promise<OperationListItem[]> {
  const rows = await forTenant(ctx).operation.findMany({
    where: { vesselId },
    select: LIST_SELECT,
    orderBy: { plannedStart: 'desc' },
    take: limit,
  })

  return rows.map((row) => toListItem(row, now))
}

function toListItem(row: OperationRow, now: Date): OperationListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    priority: row.priority,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    actualStart: row.actualStart,
    actualEnd: row.actualEnd,
    vessel: row.vessel,
    location: row.location,
    isDelayed: isDelayed(row, now),
  }
}

/**
 * Two ways an operation is late, and both matter to a coordinator:
 * it should have started and has not, or it is still running past its planned end.
 */
function isDelayed(row: OperationRow, now: Date): boolean {
  if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
    return row.actualEnd !== null && row.actualEnd > row.plannedEnd
  }

  if (!row.actualStart) return now > row.plannedStart

  return now > row.plannedEnd
}
