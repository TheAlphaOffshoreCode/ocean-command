import type { Coordinates } from '@/lib/domain/geo'

import type {
  WeatherForecastPoint,
  WeatherObservationSnapshot,
  WeatherProvider,
} from './types'

/**
 * Simulated weather, for tests and for working without a network.
 *
 * Deterministic in (coordinates, hour): the same point at the same hour always
 * gives the same conditions, so a test can assert on it and a demo without
 * internet still shows a plausible sea rather than an empty panel.
 *
 * Conditions follow a slow swell cycle plus a diurnal wind pattern, which is
 * enough to make a forecast chart look like weather and to drive a window from
 * Favorable through Marginal and back.
 */

const HOUR = 60 * 60 * 1000

function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function unit(seed: number): number {
  return (Math.imul(seed, 0x27220a95) >>> 0) / 0x100000000
}

/** Baseline for a point: some places are simply windier than others. */
function baseline(at: Coordinates) {
  const seed = hash(`${at.latitude.toFixed(2)},${at.longitude.toFixed(2)}`)

  return {
    wind: 9 + unit(seed) * 9, // 9–18 kn
    wave: 0.9 + unit(seed ^ 0x1234) * 1.4, // 0.9–2.3 m
    period: 7 + unit(seed ^ 0x5678) * 5,
    direction: Math.round(unit(seed ^ 0x9abc) * 359),
  }
}

function conditionsAt(at: Coordinates, when: Date) {
  const base = baseline(at)
  const hours = when.getTime() / HOUR

  // Two cycles: a ~26 h swell rhythm and a diurnal wind that peaks mid-afternoon.
  const swellPhase = Math.sin((hours / 26) * 2 * Math.PI)
  const windPhase = Math.sin(((hours % 24) / 24) * 2 * Math.PI - Math.PI / 3)

  const windSpeedKn = round1(Math.max(2, base.wind + windPhase * 7 + swellPhase * 2))
  const waveHeightM = round2(Math.max(0.2, base.wave + swellPhase * 0.8))

  return {
    windSpeedKn,
    windGustKn: round1(windSpeedKn * 1.35),
    windDirectionDeg: (base.direction + Math.round(swellPhase * 25) + 360) % 360,
    waveHeightM,
    wavePeriodS: round1(base.period + swellPhase),
    swellHeightM: round2(waveHeightM * 0.78),
    // Visibility drops when it rains, which is what makes the metric move at all.
    precipitationMm: windPhase > 0.75 ? round1(windPhase * 3) : 0,
    visibilityNm: windPhase > 0.75 ? round1(1.5 + (1 - windPhase) * 8) : round1(8 + unit(hash(String(Math.floor(hours)))) * 4),
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100

export type MockWeatherOptions = {
  /** Injected so tests can pin the clock. */
  now?: () => Date
}

export function createMockWeatherProvider(options: MockWeatherOptions = {}): WeatherProvider {
  const now = options.now ?? (() => new Date())
  const name = 'mock-weather'

  /** Forecasts are hourly on the hour, like the real provider's. */
  function topOfHour(when: Date): Date {
    return new Date(Math.floor(when.getTime() / HOUR) * HOUR)
  }

  return {
    name,

    async getCurrentWeather(at) {
      const observedAt = topOfHour(now())
      const conditions = conditionsAt(at, observedAt)

      return {
        observedAt,
        ...conditions,
        waveDirectionDeg: conditions.windDirectionDeg,
        swellPeriodS: round1(conditions.wavePeriodS + 1.5),
        swellDirectionDeg: (conditions.windDirectionDeg + 20) % 360,
        pressureHpa: round1(1013 + Math.sin(observedAt.getTime() / (HOUR * 40)) * 8),
        airTempC: round1(20 + Math.sin(observedAt.getTime() / (HOUR * 12)) * 4),
        seaTempC: round1(22 + Math.sin(observedAt.getTime() / (HOUR * 60)) * 2),
        source: 'SIMULATED',
        provider: name,
      } satisfies WeatherObservationSnapshot
    },

    async getForecast(at, hours) {
      const start = topOfHour(now())

      return Array.from({ length: hours }, (_, index) => {
        const forecastFor = new Date(start.getTime() + index * HOUR)
        const conditions = conditionsAt(at, forecastFor)

        return {
          forecastFor,
          windSpeedKn: conditions.windSpeedKn,
          windGustKn: conditions.windGustKn,
          windDirectionDeg: conditions.windDirectionDeg,
          waveHeightM: null,
          swellHeightM: null,
          visibilityNm: conditions.visibilityNm,
          precipitationMm: conditions.precipitationMm,
          source: 'SIMULATED',
          provider: name,
        } satisfies WeatherForecastPoint
      })
    },

    async getMarineForecast(at, hours) {
      const start = topOfHour(now())

      return Array.from({ length: hours }, (_, index) => {
        const forecastFor = new Date(start.getTime() + index * HOUR)
        const conditions = conditionsAt(at, forecastFor)

        return {
          forecastFor,
          windSpeedKn: null,
          windGustKn: null,
          windDirectionDeg: null,
          waveHeightM: conditions.waveHeightM,
          swellHeightM: conditions.swellHeightM,
          visibilityNm: null,
          precipitationMm: null,
          source: 'SIMULATED',
          provider: name,
        } satisfies WeatherForecastPoint
      })
    },
  }
}
