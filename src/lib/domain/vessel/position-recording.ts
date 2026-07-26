import { distanceMetres, type Coordinates } from '@/lib/domain/geo'

/**
 * Decides whether a new fix is worth storing.
 *
 * `VesselPosition` is the only table with unbounded growth: at one fix per 30 s
 * a fleet of eight produces ~23 k rows a day, most of them saying nothing new.
 *
 * DATABASE.md §7 originally specified "persist when the vessel moved more than
 * 50 m **or** 60 s elapsed". That rule reduces nothing — the 60 s branch is true
 * on essentially every poll, so it stores everything. The intent was the
 * opposite, so the rule implemented here is:
 *
 *   - no previous fix                     → store (there is nothing to compare)
 *   - moved more than 50 m                → store (real movement)
 *   - otherwise, only every 15 minutes    → store (heartbeat: a vessel sitting
 *                                            still is a fact worth recording,
 *                                            just not 2 880 times a day)
 *
 * 50 m is below the width of a PSV, so anything a coordinator would call
 * "moving" clears it, while GPS jitter at the berth does not.
 */

export const MOVEMENT_THRESHOLD_M = 50
export const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000

export type RecordedFix = {
  position: Coordinates
  recordedAt: Date
}

export function shouldRecordFix(previous: RecordedFix | null, next: RecordedFix): boolean {
  if (!previous) return true

  if (distanceMetres(previous.position, next.position) > MOVEMENT_THRESHOLD_M) return true

  return next.recordedAt.getTime() - previous.recordedAt.getTime() >= HEARTBEAT_INTERVAL_MS
}
