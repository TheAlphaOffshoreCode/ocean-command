import type { VesselStatus, VesselType } from '@prisma/client'

/**
 * Which vessels AIS should be tracking.
 *
 * A hull alongside in Santos, or an FPSO on station, does not produce a moving
 * track — and a simulator that walks them across the basin anyway is the kind of
 * detail that tells a domain reader the product was built by someone who has not
 * seen an operations screen.
 *
 * Kept here, in the domain, rather than in the provider: the provider answers
 * "where is this MMSI?", it has no business knowing what the vessel is doing.
 */

/** Statuses in which a vessel is under way or on station and reporting movement. */
const TRACKED_STATUSES: ReadonlySet<VesselStatus> = new Set<VesselStatus>([
  'IN_OPERATION',
  'IN_TRANSIT',
  'STANDBY',
  'AVAILABLE',
])

/** Types that stay on station by design, so their position should not drift. */
const STATIONARY_TYPES: ReadonlySet<VesselType> = new Set<VesselType>(['FPSO', 'DRILLSHIP'])

export type TrackableVessel = {
  mmsi: string | null
  type: VesselType
  status: VesselStatus
  archivedAt: Date | null
}

export function isTracked(vessel: TrackableVessel): boolean {
  if (!vessel.mmsi) return false
  if (vessel.archivedAt) return false
  if (STATIONARY_TYPES.has(vessel.type)) return false

  return TRACKED_STATUSES.has(vessel.status)
}
