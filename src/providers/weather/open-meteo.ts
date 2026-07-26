import type { Coordinates } from '@/lib/domain/geo'
import { ProviderError } from '@/lib/errors'

import {
  metresToNauticalMiles,
  type WeatherForecastPoint,
  type WeatherObservationSnapshot,
  type WeatherProvider,
} from './types'

/**
 * Open-Meteo: free, no API key, and it has a marine endpoint — which is why it is
 * the weather provider for a project with a zero-cost constraint.
 *
 * Two endpoints, because sea state lives on a different host from the atmosphere:
 *   api.open-meteo.com/v1/forecast   → wind, gusts, visibility, pressure, temp
 *   marine-api.open-meteo.com/v1/marine → wave and swell height, period, direction
 *
 * Field names and units were read off live responses, not assumed. The one that
 * bites: **visibility comes in metres**, so it is converted here. A provider that
 * passed it through would put "33440 NM" on a screen.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'

/** Mandatory: a hanging third party must not hold a request open. */
const TIMEOUT_MS = 5_000

const CURRENT_FIELDS = [
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'temperature_2m',
  'surface_pressure',
  'precipitation',
  'visibility',
].join(',')

const HOURLY_FIELDS = [
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'precipitation',
  'visibility',
].join(',')

const MARINE_CURRENT_FIELDS = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'swell_wave_height',
  'swell_wave_period',
  'swell_wave_direction',
  'sea_surface_temperature',
].join(',')

const MARINE_HOURLY_FIELDS = ['wave_height', 'swell_wave_height'].join(',')

type CurrentResponse = {
  current?: Record<string, number | string | null>
}

type HourlyResponse = {
  hourly?: {
    time?: string[]
  } & Record<string, Array<number | null> | string[] | undefined>
}

async function getJson<T>(url: string, provider: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Never Next's data cache: freshness here is decided by our own refresh
    // schedule and stored in the database, not by a framework heuristic.
    cache: 'no-store',
  }).catch((cause: unknown) => {
    throw new ProviderError(provider, `Could not reach ${new URL(url).host}: ${describe(cause)}`)
  })

  if (!response.ok) {
    throw new ProviderError(provider, `${new URL(url).host} answered ${response.status}`)
  }

  return (await response.json()) as T
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS} ms` : cause.message
  }
  return 'unknown error'
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function int(value: unknown): number | null {
  const parsed = num(value)
  return parsed === null ? null : Math.round(parsed)
}

/** Open-Meteo timestamps are UTC without a zone marker, so it has to be added. */
function parseUtc(value: string): Date {
  return new Date(value.endsWith('Z') ? value : `${value}Z`)
}

function query(at: Coordinates, params: Record<string, string>): string {
  const search = new URLSearchParams({
    latitude: at.latitude.toFixed(4),
    longitude: at.longitude.toFixed(4),
    timezone: 'GMT',
    ...params,
  })
  return search.toString()
}

export function createOpenMeteoProvider(): WeatherProvider {
  const name = 'open-meteo'

  async function hourly(
    url: string,
    at: Coordinates,
    hours: number,
    fields: string,
    extra: Record<string, string> = {},
  ) {
    const days = Math.min(16, Math.max(1, Math.ceil(hours / 24)))
    const response = await getJson<HourlyResponse>(
      `${url}?${query(at, { hourly: fields, forecast_days: String(days), ...extra })}`,
      name,
    )

    const times = (response.hourly?.time ?? []) as string[]
    return { times, series: response.hourly ?? {} }
  }

  function seriesValue(
    series: Record<string, unknown>,
    field: string,
    index: number,
  ): number | null {
    const values = series[field]
    return Array.isArray(values) ? num(values[index]) : null
  }

  return {
    name,

    async getCurrentWeather(at) {
      // Both endpoints in parallel: one round trip of latency instead of two.
      // If the marine host is down we still return the atmosphere and leave the
      // sea-state fields null, which the window evaluation reports as degraded
      // rather than treating as flat water.
      const [atmosphere, marine] = await Promise.all([
        getJson<CurrentResponse>(
          `${FORECAST_URL}?${query(at, { current: CURRENT_FIELDS, wind_speed_unit: 'kn' })}`,
          name,
        ),
        getJson<CurrentResponse>(
          `${MARINE_URL}?${query(at, { current: MARINE_CURRENT_FIELDS })}`,
          name,
        ).catch(() => ({ current: undefined }) as CurrentResponse),
      ])

      const current = atmosphere.current ?? {}
      const sea = marine.current ?? {}
      const time = typeof current.time === 'string' ? parseUtc(current.time) : new Date()

      return {
        observedAt: time,
        windSpeedKn: num(current.wind_speed_10m),
        windGustKn: num(current.wind_gusts_10m),
        windDirectionDeg: int(current.wind_direction_10m),
        waveHeightM: num(sea.wave_height),
        wavePeriodS: num(sea.wave_period),
        waveDirectionDeg: int(sea.wave_direction),
        swellHeightM: num(sea.swell_wave_height),
        swellPeriodS: num(sea.swell_wave_period),
        swellDirectionDeg: int(sea.swell_wave_direction),
        precipitationMm: num(current.precipitation),
        visibilityNm: metresToNauticalMiles(num(current.visibility)),
        pressureHpa: num(current.surface_pressure),
        airTempC: num(current.temperature_2m),
        seaTempC: num(sea.sea_surface_temperature),
        source: 'REAL',
        provider: name,
      } satisfies WeatherObservationSnapshot
    },

    async getForecast(at, hours) {
      const { times, series } = await hourly(FORECAST_URL, at, hours, HOURLY_FIELDS, {
        wind_speed_unit: 'kn',
      })

      return times.slice(0, hours).map((time, index) => ({
        forecastFor: parseUtc(time),
        windSpeedKn: seriesValue(series, 'wind_speed_10m', index),
        windGustKn: seriesValue(series, 'wind_gusts_10m', index),
        windDirectionDeg: (() => {
          const value = seriesValue(series, 'wind_direction_10m', index)
          return value === null ? null : Math.round(value)
        })(),
        waveHeightM: null,
        swellHeightM: null,
        visibilityNm: metresToNauticalMiles(seriesValue(series, 'visibility', index)),
        precipitationMm: seriesValue(series, 'precipitation', index),
        source: 'REAL',
        provider: name,
      })) satisfies WeatherForecastPoint[]
    },

    async getMarineForecast(at, hours) {
      const { times, series } = await hourly(MARINE_URL, at, hours, MARINE_HOURLY_FIELDS)

      return times.slice(0, hours).map((time, index) => ({
        forecastFor: parseUtc(time),
        windSpeedKn: null,
        windGustKn: null,
        windDirectionDeg: null,
        waveHeightM: seriesValue(series, 'wave_height', index),
        swellHeightM: seriesValue(series, 'swell_wave_height', index),
        visibilityNm: null,
        precipitationMm: null,
        source: 'REAL',
        provider: name,
      })) satisfies WeatherForecastPoint[]
    },
  }
}
