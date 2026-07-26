import type { Coordinates } from '@/lib/domain/geo'

/**
 * AIS provider contract.
 *
 * Modelled on real AIS ship messages (MMSI, SOG, COG, true heading,
 * destination), not on what a simulator finds convenient — see
 * docs/adr/004-provider-architecture.md. When a real feed replaces the mock,
 * this interface should not have to change shape.
 */

/** Where the data came from. Persisted, and shown in the UI. */
export type PositionSource = 'REAL' | 'SIMULATED'

export type VesselPositionSnapshot = {
  mmsi: string
  position: Coordinates
  /** Speed over ground, knots. */
  speedKn: number
  /** Course over ground, 0–359. */
  courseDeg: number
  /** True heading, 0–359. Often equals course; differs when a vessel is set by current. */
  headingDeg: number
  destination: string | null
  timestamp: Date
  source: PositionSource
}

export type TimeRange = {
  from: Date
  to: Date
}

export interface AISProvider {
  /** Provider name, persisted alongside the data so its origin is auditable. */
  readonly name: string

  getVessels(mmsiList: string[]): Promise<VesselPositionSnapshot[]>

  getVesselPosition(mmsi: string): Promise<VesselPositionSnapshot | null>

  getVesselTrack(mmsi: string, window: TimeRange): Promise<VesselPositionSnapshot[]>

  getNearbyVessels(
    centre: Coordinates,
    radiusNm: number,
    mmsiList: string[],
  ): Promise<VesselPositionSnapshot[]>
}
