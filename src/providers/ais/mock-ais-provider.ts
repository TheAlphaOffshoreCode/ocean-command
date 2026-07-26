import {
  bearingDegrees,
  destinationPoint,
  distanceNauticalMiles,
  type Coordinates,
} from '@/lib/domain/geo'

import type { AISProvider, TimeRange, VesselPositionSnapshot } from './types'

/**
 * Simulated AIS.
 *
 * Every position is a pure function of (MMSI, timestamp): no state, no random
 * seed to carry between calls, no database. The same MMSI at the same instant
 * always yields the same fix, which is what makes demos reproducible and tests
 * assertable — and it still advances between page loads, because the timestamp
 * moves.
 *
 * Each vessel patrols a slow ellipse around a home point derived from its MMSI,
 * inside one of three Brazilian offshore basins. Course and speed are computed
 * from two nearby samples rather than invented separately, so heading, course
 * over ground and speed agree with the track the way they would on a real
 * screen. A simulator whose vessels move implausibly undermines exactly the
 * credibility it exists to protect.
 *
 * Every snapshot is tagged SIMULATED, persisted as such, and labelled in the UI.
 */

type Basin = {
  name: string
  /** Centre of the operating area. */
  centre: Coordinates
  /** Half-extent in degrees, kept well offshore. */
  spread: number
}

/**
 * Plausible offshore areas for a demonstration. The basins are real geography;
 * the vessels, their tracks and their destinations are fictional, and no
 * operation here is attributed to any real company.
 */
const BASINS: Basin[] = [
  { name: 'Santos Basin', centre: { latitude: -25.2, longitude: -43.1 }, spread: 0.9 },
  { name: 'Campos Basin', centre: { latitude: -22.3, longitude: -40.2 }, spread: 0.8 },
  { name: 'Espírito Santo Basin', centre: { latitude: -20.1, longitude: -39.4 }, spread: 0.7 },
]

const DESTINATIONS = [
  'SANTOS',
  'RIO DE JANEIRO',
  'MACAÉ',
  'VITÓRIA',
  'FIELD OPERATIONS',
  'STANDBY POSITION',
]

/** FNV-1a: small, stable, and good enough to spread MMSIs across the basins. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic value in [0, 1) from a seed and a label. */
function unit(seed: number, label: string): number {
  const mixed = Math.imul(seed ^ hash(label), 0x27220a95) >>> 0
  return mixed / 0x100000000
}

type VesselProfile = {
  basin: Basin
  home: Coordinates
  /** Ellipse radii in nautical miles. */
  radiusNm: { major: number; minor: number }
  /** Full circuit duration in milliseconds. */
  periodMs: number
  /** Rotation of the ellipse, degrees. */
  orientationDeg: number
  destination: string
}

function profileFor(mmsi: string): VesselProfile {
  const seed = hash(mmsi)
  const basin = BASINS[Math.floor(unit(seed, 'basin') * BASINS.length)] ?? BASINS[0]!

  return {
    basin,
    home: {
      latitude: basin.centre.latitude + (unit(seed, 'lat') - 0.5) * 2 * basin.spread,
      longitude: basin.centre.longitude + (unit(seed, 'lon') - 0.5) * 2 * basin.spread,
    },
    radiusNm: {
      major: 4 + unit(seed, 'major') * 8,
      minor: 2 + unit(seed, 'minor') * 5,
    },
    // Between 5 and 13 hours per circuit: fast enough to see movement across a
    // shift, slow enough that a refresh does not teleport the marker.
    periodMs: (5 + unit(seed, 'period') * 8) * 60 * 60 * 1000,
    orientationDeg: unit(seed, 'orientation') * 360,
    destination: DESTINATIONS[Math.floor(unit(seed, 'destination') * DESTINATIONS.length)]!,
  }
}

/** Position on the ellipse at an absolute instant. */
function positionAt(profile: VesselProfile, at: Date): Coordinates {
  const phase = ((at.getTime() % profile.periodMs) / profile.periodMs) * 2 * Math.PI

  // Offsets along the ellipse axes, then rotated by the ellipse orientation.
  const along = Math.cos(phase) * profile.radiusNm.major
  const across = Math.sin(phase) * profile.radiusNm.minor

  const bearing = profile.orientationDeg
  const stepOne = destinationPoint(profile.home, bearing, along * 1852)
  return destinationPoint(stepOne, (bearing + 90) % 360, across * 1852)
}

/** Two samples a minute apart, so course and speed follow from the track itself. */
const SAMPLE_INTERVAL_MS = 60_000

function snapshot(mmsi: string, at: Date): VesselPositionSnapshot {
  const profile = profileFor(mmsi)
  const previous = positionAt(profile, new Date(at.getTime() - SAMPLE_INTERVAL_MS))
  const current = positionAt(profile, at)

  const courseDeg = bearingDegrees(previous, current)
  const speedKn =
    distanceNauticalMiles(previous, current) / (SAMPLE_INTERVAL_MS / 3_600_000)

  return {
    mmsi,
    position: current,
    speedKn: Math.round(speedKn * 10) / 10,
    courseDeg,
    // Heading lags course slightly, as a hull set by current would.
    headingDeg: (courseDeg + Math.round((unit(hash(mmsi), 'yaw') - 0.5) * 8) + 360) % 360,
    destination: profile.destination,
    timestamp: at,
    source: 'SIMULATED',
  }
}

export type MockAISOptions = {
  /** Injected so tests can pin the clock; defaults to the real one. */
  now?: () => Date
}

export function createMockAISProvider(options: MockAISOptions = {}): AISProvider {
  const now = options.now ?? (() => new Date())

  return {
    name: 'mock-ais',

    async getVessels(mmsiList) {
      const at = now()
      return mmsiList.map((mmsi) => snapshot(mmsi, at))
    },

    async getVesselPosition(mmsi) {
      return snapshot(mmsi, now())
    },

    async getVesselTrack(mmsi: string, window: TimeRange) {
      // Hourly fixes across the window — enough to draw a track without
      // pretending to a fidelity a simulation does not have.
      const fixes: VesselPositionSnapshot[] = []
      const step = 60 * 60 * 1000

      for (let t = window.from.getTime(); t <= window.to.getTime(); t += step) {
        fixes.push(snapshot(mmsi, new Date(t)))
      }
      return fixes
    },

    async getNearbyVessels(centre, radiusNm, mmsiList) {
      const at = now()
      return mmsiList
        .map((mmsi) => snapshot(mmsi, at))
        .filter((fix) => distanceNauticalMiles(centre, fix.position) <= radiusNm)
    },
  }
}
