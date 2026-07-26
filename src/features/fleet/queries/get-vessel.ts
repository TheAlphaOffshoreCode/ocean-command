import 'server-only'

import type { VesselStatus, VesselType } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'

export type VesselTrackPoint = {
  latitude: number
  longitude: number
  speedKn: number | null
  headingDeg: number | null
  recordedAt: Date
  source: string
}

export type VesselDetail = {
  id: string
  name: string
  type: VesselType
  status: VesselStatus
  flag: string
  operator: string | null
  imo: string | null
  mmsi: string | null
  callsign: string | null
  lengthM: number | null
  beamM: number | null
  draftM: number | null
  position: { latitude: number; longitude: number } | null
  speedKn: number | null
  headingDeg: number | null
  destination: string | null
  lastPositionAt: Date | null
  positionSource: string | null
  createdAt: Date
  track: VesselTrackPoint[]
  /** How many fixes exist in total, so the UI can say the track is a window. */
  trackTotal: number
}

/**
 * A vessel and a bounded slice of its track.
 *
 * `findFirst`, not `findUnique`: the tenant filter has to be part of the query,
 * and Prisma will not accept a non-unique field beside a unique key. Returns null
 * for an id belonging to another organization, which the page renders as 404 —
 * a 403 would confirm the record exists.
 */
export async function getVessel(
  ctx: TenantContext,
  vesselId: string,
  trackLimit = 200,
): Promise<VesselDetail | null> {
  const db = forTenant(ctx)

  const vessel = await db.vessel.findFirst({
    where: { id: vesselId, archivedAt: null },
    include: {
      positions: {
        orderBy: { recordedAt: 'desc' },
        take: trackLimit,
      },
    },
  })

  if (!vessel) return null

  const trackTotal = await db.vesselPosition.count({ where: { vesselId } })
  const hasPosition = vessel.lastLatitude !== null && vessel.lastLongitude !== null

  return {
    id: vessel.id,
    name: vessel.name,
    type: vessel.type,
    status: vessel.status,
    flag: vessel.flag,
    operator: vessel.operator,
    imo: vessel.imo,
    mmsi: vessel.mmsi,
    callsign: vessel.callsign,
    lengthM: vessel.lengthM === null ? null : Number(vessel.lengthM),
    beamM: vessel.beamM === null ? null : Number(vessel.beamM),
    draftM: vessel.draftM === null ? null : Number(vessel.draftM),
    position: hasPosition
      ? { latitude: Number(vessel.lastLatitude), longitude: Number(vessel.lastLongitude) }
      : null,
    speedKn: vessel.lastSpeedKn === null ? null : Number(vessel.lastSpeedKn),
    headingDeg: vessel.lastHeadingDeg,
    destination: vessel.lastDestination,
    lastPositionAt: vessel.lastPositionAt,
    positionSource: vessel.lastPositionSource,
    createdAt: vessel.createdAt,
    // Oldest first, which is the order a track is drawn in.
    track: vessel.positions
      .map((fix) => ({
        latitude: Number(fix.latitude),
        longitude: Number(fix.longitude),
        speedKn: fix.speedKn === null ? null : Number(fix.speedKn),
        headingDeg: fix.headingDeg,
        recordedAt: fix.recordedAt,
        source: fix.source,
      }))
      .reverse(),
    trackTotal,
  }
}
