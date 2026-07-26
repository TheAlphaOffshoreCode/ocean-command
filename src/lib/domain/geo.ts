/**
 * Spherical geometry. Pure, no I/O, no dependency — see docs/adr/006-geospatial.md
 * for why coordinates are plain decimals and PostGIS is deferred.
 */

export type Coordinates = {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_M = 6_371_000
const METRES_PER_NAUTICAL_MILE = 1852

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

/** Great-circle distance in metres. */
export function distanceMetres(from: Coordinates, to: Coordinates): number {
  const φ1 = toRadians(from.latitude)
  const φ2 = toRadians(to.latitude)
  const Δφ = φ2 - φ1
  const Δλ = toRadians(to.longitude - from.longitude)

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function distanceNauticalMiles(from: Coordinates, to: Coordinates): number {
  return distanceMetres(from, to) / METRES_PER_NAUTICAL_MILE
}

/**
 * Where you end up steering `bearingDeg` for `distanceM` from a point.
 * This is what moves a simulated vessel along its course.
 */
export function destinationPoint(
  origin: Coordinates,
  bearingDeg: number,
  distanceM: number,
): Coordinates {
  const δ = distanceM / EARTH_RADIUS_M
  const θ = toRadians(bearingDeg)
  const φ1 = toRadians(origin.latitude)
  const λ1 = toRadians(origin.longitude)

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  const φ2 = Math.asin(sinφ2)
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sinφ2)

  return {
    latitude: round6(toDegrees(φ2)),
    // Keep longitude in [-180, 180] so a vessel crossing the antimeridian does
    // not end up at 190° and off the map.
    longitude: round6(normaliseLongitude(toDegrees(λ2))),
  }
}

export function normaliseLongitude(longitude: number): number {
  return ((longitude + 540) % 360) - 180
}

/** Compass bearing from one point to another, 0–359. */
export function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const φ1 = toRadians(from.latitude)
  const φ2 = toRadians(to.latitude)
  const Δλ = toRadians(to.longitude - from.longitude)

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)

  return Math.round((toDegrees(Math.atan2(y, x)) + 360) % 360) % 360
}

/** Six decimal places ≈ 0.1 m, which is the precision the columns store. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}
