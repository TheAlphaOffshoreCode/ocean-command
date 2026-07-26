import { describe, expect, it } from 'vitest'

import { distanceNauticalMiles, isValidLatitude, isValidLongitude } from '@/lib/domain/geo'
import { createMockAISProvider } from '@/providers/ais/mock-ais-provider'

const MMSI = ['710100011', '710100022', '710100033', '710100044']
const FIXED = new Date('2026-07-26T12:00:00.000Z')

function providerAt(instant: Date) {
  return createMockAISProvider({ now: () => instant })
}

describe('mock AIS provider', () => {
  it('returns the same fix for the same MMSI and instant', async () => {
    const first = await providerAt(FIXED).getVesselPosition(MMSI[0]!)
    const second = await providerAt(FIXED).getVesselPosition(MMSI[0]!)

    // Determinism is what makes the demo reproducible and this suite assertable.
    expect(first).toEqual(second)
  })

  it('puts different vessels in different places', async () => {
    const fixes = await providerAt(FIXED).getVessels(MMSI)
    const unique = new Set(fixes.map((fix) => `${fix.position.latitude},${fix.position.longitude}`))

    expect(unique.size).toBe(MMSI.length)
  })

  it('advances the position as time passes', async () => {
    const before = await providerAt(FIXED).getVesselPosition(MMSI[0]!)
    const later = await providerAt(new Date(FIXED.getTime() + 30 * 60_000)).getVesselPosition(
      MMSI[0]!,
    )

    expect(later!.position).not.toEqual(before!.position)
  })

  it('reports every fix as simulated', async () => {
    const fixes = await providerAt(FIXED).getVessels(MMSI)
    expect(fixes.every((fix) => fix.source === 'SIMULATED')).toBe(true)
  })

  it('stays inside valid coordinates and plausible offshore speeds', async () => {
    // Sampled across a full day: a simulator that produces 40-knot supply vessels
    // or a latitude of 91 undermines exactly the credibility it exists to protect.
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(FIXED.getTime() + hour * 3_600_000)
      const fixes = await providerAt(at).getVessels(MMSI)

      for (const fix of fixes) {
        expect(isValidLatitude(fix.position.latitude), `lat at ${hour}h`).toBe(true)
        expect(isValidLongitude(fix.position.longitude), `lon at ${hour}h`).toBe(true)
        expect(fix.speedKn, `speed at ${hour}h`).toBeGreaterThanOrEqual(0)
        expect(fix.speedKn, `speed at ${hour}h`).toBeLessThan(20)
        expect(fix.courseDeg).toBeGreaterThanOrEqual(0)
        expect(fix.courseDeg).toBeLessThanOrEqual(359)
        expect(fix.headingDeg).toBeGreaterThanOrEqual(0)
        expect(fix.headingDeg).toBeLessThanOrEqual(359)
      }
    }
  })

  it('keeps vessels in the Brazilian offshore basins', async () => {
    const fixes = await providerAt(FIXED).getVessels(MMSI)

    for (const fix of fixes) {
      expect(fix.position.latitude).toBeLessThan(-15)
      expect(fix.position.latitude).toBeGreaterThan(-30)
      expect(fix.position.longitude).toBeLessThan(-35)
      expect(fix.position.longitude).toBeGreaterThan(-48)
    }
  })

  it('does not teleport between consecutive polls', async () => {
    // A marker that jumps 20 miles between refreshes reads as broken, not as a
    // vessel. Thirty seconds of steaming is well under a mile.
    const first = await providerAt(FIXED).getVesselPosition(MMSI[1]!)
    const second = await providerAt(new Date(FIXED.getTime() + 30_000)).getVesselPosition(MMSI[1]!)

    expect(distanceNauticalMiles(first!.position, second!.position)).toBeLessThan(0.5)
  })

  it('returns a track ordered across the requested window', async () => {
    const to = FIXED
    const from = new Date(FIXED.getTime() - 6 * 3_600_000)
    const track = await providerAt(FIXED).getVesselTrack(MMSI[2]!, { from, to })

    expect(track.length).toBeGreaterThan(1)
    expect(track[0]!.timestamp.getTime()).toBe(from.getTime())
    expect(track.at(-1)!.timestamp.getTime()).toBeLessThanOrEqual(to.getTime())

    for (let i = 1; i < track.length; i += 1) {
      expect(track[i]!.timestamp.getTime()).toBeGreaterThan(track[i - 1]!.timestamp.getTime())
    }
  })

  it('filters by radius when asked for nearby vessels', async () => {
    const provider = providerAt(FIXED)
    const all = await provider.getVessels(MMSI)
    const centre = all[0]!.position

    const near = await provider.getNearbyVessels(centre, 1, MMSI)
    expect(near.map((fix) => fix.mmsi)).toContain(MMSI[0])

    const wide = await provider.getNearbyVessels(centre, 5_000, MMSI)
    expect(wide).toHaveLength(MMSI.length)
  })
})
