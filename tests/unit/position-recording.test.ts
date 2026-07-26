import { describe, expect, it } from 'vitest'

import { destinationPoint, distanceMetres } from '@/lib/domain/geo'
import {
  HEARTBEAT_INTERVAL_MS,
  MOVEMENT_THRESHOLD_M,
  shouldRecordFix,
} from '@/lib/domain/vessel/position-recording'
import { isTracked } from '@/lib/domain/vessel/tracking'

const berth = { latitude: -23.98, longitude: -43.15 }
const at = new Date('2026-07-26T12:00:00.000Z')

describe('geo helpers', () => {
  it('measures a known distance', () => {
    // One nautical mile due north is 1852 m, within rounding.
    const north = destinationPoint(berth, 0, 1852)
    expect(distanceMetres(berth, north)).toBeCloseTo(1852, 0)
  })

  it('keeps longitude in range when crossing the antimeridian', () => {
    const nearDateLine = { latitude: 0, longitude: 179.9 }
    const crossed = destinationPoint(nearDateLine, 90, 40_000)

    expect(crossed.longitude).toBeGreaterThanOrEqual(-180)
    expect(crossed.longitude).toBeLessThanOrEqual(180)
    expect(crossed.longitude).toBeLessThan(0)
  })
})

describe('shouldRecordFix', () => {
  it('records the first fix, having nothing to compare', () => {
    expect(shouldRecordFix(null, { position: berth, recordedAt: at })).toBe(true)
  })

  it('records real movement', () => {
    const moved = destinationPoint(berth, 45, MOVEMENT_THRESHOLD_M + 25)
    expect(
      shouldRecordFix(
        { position: berth, recordedAt: at },
        { position: moved, recordedAt: new Date(at.getTime() + 30_000) },
      ),
    ).toBe(true)
  })

  it('discards GPS jitter at the berth', () => {
    // A few metres of drift, seconds apart: storing this is what fills the table
    // with rows that say nothing.
    const jitter = destinationPoint(berth, 200, 12)
    expect(
      shouldRecordFix(
        { position: berth, recordedAt: at },
        { position: jitter, recordedAt: new Date(at.getTime() + 30_000) },
      ),
    ).toBe(false)
  })

  it('keeps a heartbeat for a vessel that has not moved', () => {
    const jitter = destinationPoint(berth, 200, 5)

    expect(
      shouldRecordFix(
        { position: berth, recordedAt: at },
        { position: jitter, recordedAt: new Date(at.getTime() + HEARTBEAT_INTERVAL_MS) },
      ),
    ).toBe(true)

    expect(
      shouldRecordFix(
        { position: berth, recordedAt: at },
        { position: jitter, recordedAt: new Date(at.getTime() + HEARTBEAT_INTERVAL_MS - 1_000) },
      ),
    ).toBe(false)
  })

  it('is exact at the movement threshold', () => {
    const justUnder = destinationPoint(berth, 90, MOVEMENT_THRESHOLD_M - 5)
    const justOver = destinationPoint(berth, 90, MOVEMENT_THRESHOLD_M + 5)
    const soon = new Date(at.getTime() + 10_000)

    expect(shouldRecordFix({ position: berth, recordedAt: at }, { position: justUnder, recordedAt: soon })).toBe(false)
    expect(shouldRecordFix({ position: berth, recordedAt: at }, { position: justOver, recordedAt: soon })).toBe(true)
  })
})

describe('isTracked', () => {
  const base = { mmsi: '710100011', archivedAt: null } as const

  it('tracks vessels that are under way or on station', () => {
    for (const status of ['IN_OPERATION', 'IN_TRANSIT', 'STANDBY', 'AVAILABLE'] as const) {
      expect(isTracked({ ...base, type: 'PSV', status }), status).toBe(true)
    }
  })

  it('leaves alongside and unavailable vessels where they are', () => {
    // A hull in the yard does not produce a moving track, and walking it across
    // the basin is the detail that tells a domain reader nobody checked.
    for (const status of ['AT_PORT', 'MAINTENANCE', 'UNAVAILABLE'] as const) {
      expect(isTracked({ ...base, type: 'PSV', status }), status).toBe(false)
    }
  })

  it('does not move an FPSO or a drillship', () => {
    expect(isTracked({ ...base, type: 'FPSO', status: 'IN_OPERATION' })).toBe(false)
    expect(isTracked({ ...base, type: 'DRILLSHIP', status: 'IN_OPERATION' })).toBe(false)
  })

  it('skips vessels with no MMSI and archived ones', () => {
    expect(isTracked({ mmsi: null, archivedAt: null, type: 'PSV', status: 'IN_OPERATION' })).toBe(
      false,
    )
    expect(
      isTracked({ ...base, type: 'PSV', status: 'IN_OPERATION', archivedAt: new Date() }),
    ).toBe(false)
  })
})
