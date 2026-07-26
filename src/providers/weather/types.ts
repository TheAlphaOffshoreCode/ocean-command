import type { Coordinates } from '@/lib/domain/geo'

/**
 * Weather provider contract.
 *
 * Units are fixed here, not by whatever the vendor happens to return: knots,
 * metres, nautical miles, hPa, °C. Open-Meteo reports visibility in metres, for
 * instance, and a provider that passed that through would put "33440 NM" on a
 * screen — unit conversion belongs at the boundary, once.
 */

export type WeatherSource = 'REAL' | 'SIMULATED'

/** A measured or nowcast set of conditions at a point. */
export type WeatherObservationSnapshot = {
  observedAt: Date
  windSpeedKn: number | null
  windGustKn: number | null
  windDirectionDeg: number | null
  waveHeightM: number | null
  wavePeriodS: number | null
  waveDirectionDeg: number | null
  swellHeightM: number | null
  swellPeriodS: number | null
  swellDirectionDeg: number | null
  precipitationMm: number | null
  visibilityNm: number | null
  pressureHpa: number | null
  airTempC: number | null
  seaTempC: number | null
  source: WeatherSource
  provider: string
}

/** One hour of forecast. Fewer fields than an observation: forecasts carry less. */
export type WeatherForecastPoint = {
  forecastFor: Date
  windSpeedKn: number | null
  windGustKn: number | null
  windDirectionDeg: number | null
  waveHeightM: number | null
  swellHeightM: number | null
  visibilityNm: number | null
  precipitationMm: number | null
  source: WeatherSource
  provider: string
}

export interface WeatherProvider {
  /** Provider name, persisted with the data so its origin is auditable. */
  readonly name: string

  getCurrentWeather(at: Coordinates): Promise<WeatherObservationSnapshot>

  /** Atmospheric forecast, hour by hour. */
  getForecast(at: Coordinates, hours: number): Promise<WeatherForecastPoint[]>

  /** Sea state forecast, hour by hour. Merged into the atmospheric one by the caller. */
  getMarineForecast(at: Coordinates, hours: number): Promise<WeatherForecastPoint[]>
}

export const METRES_PER_NAUTICAL_MILE = 1852

/** Open-Meteo reports visibility in metres; every screen in this product wants NM. */
export function metresToNauticalMiles(metres: number | null | undefined): number | null {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return null
  return Math.round((metres / METRES_PER_NAUTICAL_MILE) * 10) / 10
}
