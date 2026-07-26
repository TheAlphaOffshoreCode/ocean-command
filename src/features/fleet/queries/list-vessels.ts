import 'server-only'

import type { Prisma, Vessel, VesselStatus, VesselType } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'

import type { FleetFilters } from '../schemas/vessel'

/**
 * View model, not the Prisma row. Decimal columns become numbers here, once,
 * rather than leaking a Decimal into every component that renders a speed.
 */
export type VesselListItem = {
  id: string
  name: string
  type: VesselType
  status: VesselStatus
  flag: string
  imo: string | null
  mmsi: string | null
  operator: string | null
  position: { latitude: number; longitude: number } | null
  speedKn: number | null
  headingDeg: number | null
  destination: string | null
  lastPositionAt: Date | null
  /** REAL, SIMULATED or DEMO — rendered next to the position, never omitted. */
  positionSource: string | null
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export async function listVessels(
  ctx: TenantContext,
  filters: FleetFilters,
): Promise<Paginated<VesselListItem>> {
  const where: Prisma.VesselWhereInput = {
    archivedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          // Search the identifiers people actually have to hand: a name from the
          // radio, an IMO from a certificate, an MMSI from an AIS screen.
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { imo: { contains: filters.search } },
            { mmsi: { contains: filters.search } },
            { callsign: { contains: filters.search, mode: 'insensitive' } },
            { operator: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const orderBy: Prisma.VesselOrderByWithRelationInput =
    filters.sort === 'lastPositionAt'
      ? { lastPositionAt: { sort: filters.direction, nulls: 'last' } }
      : { [filters.sort]: filters.direction }

  const db = forTenant(ctx)

  // Pagination is not optional on a list query — see ARCHITECTURE.md §8.
  const [rows, total] = await Promise.all([
    db.vessel.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.vessel.count({ where }),
  ])

  return {
    items: rows.map(toListItem),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

/** Hard ceiling: this query is unpaginated, so it must not be able to grow without bound. */
const FLEET_OVERVIEW_LIMIT = 500

/**
 * The whole active fleet, for the fleet view — which needs both a map and a list.
 *
 * It deliberately does *not* filter on having a position: the map skips vessels
 * without one, but the list must still show them. Filtering here made a vessel
 * that has never reported disappear from the fleet entirely, which is the
 * opposite of what a fleet view is for.
 */
export async function listFleetOverview(ctx: TenantContext): Promise<VesselListItem[]> {
  const rows = await forTenant(ctx).vessel.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    take: FLEET_OVERVIEW_LIMIT,
  })

  return rows.map(toListItem)
}

function toListItem(row: Vessel): VesselListItem {
  const hasPosition = row.lastLatitude !== null && row.lastLongitude !== null

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    flag: row.flag,
    imo: row.imo,
    mmsi: row.mmsi,
    operator: row.operator,
    position: hasPosition
      ? { latitude: Number(row.lastLatitude), longitude: Number(row.lastLongitude) }
      : null,
    speedKn: row.lastSpeedKn === null ? null : Number(row.lastSpeedKn),
    headingDeg: row.lastHeadingDeg,
    destination: row.lastDestination,
    lastPositionAt: row.lastPositionAt,
    positionSource: row.lastPositionSource,
  }
}
