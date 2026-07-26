import 'server-only'

import type { OperationType } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import {
  evaluateWeatherWindow,
  type WeatherLimitOverrides,
  type WeatherMetrics,
  type WeatherVerdict,
} from '@/lib/domain/weather/weather-window'

/**
 * Reads stored conditions and derives verdicts from them.
 *
 * Verdicts are never stored — see DECISIONS.md P3. A stored verdict outlives the
 * threshold that produced it, so the next time somebody adjusts a limit the
 * database is full of judgements nobody can reproduce. Only the inputs are
 * persisted; the judgement is recomputed every time it is shown.
 */

export type ConditionsSnapshot = {
  locationId: string
  locationName: string
  basin: string | null
  observedAt: Date
  source: string
  provider: string
  windSpeedKn: number | null
  windGustKn: number | null
  windDirectionDeg: number | null
  waveHeightM: number | null
  wavePeriodS: number | null
  swellHeightM: number | null
  visibilityNm: number | null
  pressureHpa: number | null
  airTempC: number | null
  seaTempC: number | null
}

export type ForecastPoint = {
  forecastFor: Date
  windSpeedKn: number | null
  windGustKn: number | null
  waveHeightM: number | null
  swellHeightM: number | null
  visibilityNm: number | null
  precipitationMm: number | null
}

export type LocationConditions = {
  /** Always present: a location with no observation still has a name to show. */
  locationId: string
  locationName: string
  basin: string | null
  conditions: ConditionsSnapshot | null
  forecast: ForecastPoint[]
}

const decimal = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value)

/** Per-organization threshold overrides, from Organization.settings. */
export async function weatherOverrides(ctx: TenantContext): Promise<WeatherLimitOverrides> {
  const [organization] = await forTenant(ctx).membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: { organization: { select: { settings: true } } },
    take: 1,
  })

  const settings = organization?.organization.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {}

  const limits = (settings as Record<string, unknown>).weatherLimits
  // Shape is not validated here on purpose: an unrecognised override falls through
  // to the defaults inside limitsFor rather than throwing on a page load.
  return (limits ?? {}) as WeatherLimitOverrides
}

/** Latest stored observation per location, plus the forecast from now on. */
export async function getLocationConditions(
  ctx: TenantContext,
  options: { hours?: number; now?: Date } = {},
): Promise<Map<string, LocationConditions>> {
  const hours = options.hours ?? 48
  const now = options.now ?? new Date()
  const db = forTenant(ctx)

  const locations = await db.location.findMany({
    select: { id: true, name: true, basin: true },
    orderBy: { name: 'asc' },
  })

  const result = new Map<string, LocationConditions>()

  await Promise.all(
    locations.map(async (location) => {
      const [observation, forecast] = await Promise.all([
        db.weatherObservation.findFirst({
          where: { locationId: location.id },
          orderBy: { observedAt: 'desc' },
        }),
        db.weatherForecast.findMany({
          where: { locationId: location.id, forecastFor: { gte: now } },
          orderBy: { forecastFor: 'asc' },
          take: hours,
        }),
      ])

      result.set(location.id, {
        locationId: location.id,
        locationName: location.name,
        basin: location.basin,
        conditions: observation
          ? {
              locationId: location.id,
              locationName: location.name,
              basin: location.basin,
              observedAt: observation.observedAt,
              source: observation.source,
              provider: observation.provider,
              windSpeedKn: decimal(observation.windSpeedKn),
              windGustKn: decimal(observation.windGustKn),
              windDirectionDeg: observation.windDirectionDeg,
              waveHeightM: decimal(observation.waveHeightM),
              wavePeriodS: decimal(observation.wavePeriodS),
              swellHeightM: decimal(observation.swellHeightM),
              visibilityNm: decimal(observation.visibilityNm),
              pressureHpa: decimal(observation.pressureHpa),
              airTempC: decimal(observation.airTempC),
              seaTempC: decimal(observation.seaTempC),
            }
          : null,
        forecast: forecast.map((point) => ({
          forecastFor: point.forecastFor,
          windSpeedKn: decimal(point.windSpeedKn),
          windGustKn: decimal(point.windGustKn),
          waveHeightM: decimal(point.waveHeightM),
          swellHeightM: decimal(point.swellHeightM),
          visibilityNm: decimal(point.visibilityNm),
          precipitationMm: decimal(point.precipitationMm),
        })),
      })
    }),
  )

  return result
}

export function metricsFrom(source: {
  windSpeedKn: number | null
  windGustKn: number | null
  waveHeightM: number | null
  visibilityNm: number | null
}): WeatherMetrics {
  return {
    windSpeedKn: source.windSpeedKn,
    windGustKn: source.windGustKn,
    waveHeightM: source.waveHeightM,
    visibilityNm: source.visibilityNm,
  }
}

export type OperationWeather = {
  verdict: WeatherVerdict
  conditions: ConditionsSnapshot
  /** When the window next changes level, if it does within the forecast horizon. */
  changesAt: { at: Date; status: WeatherVerdict['status'] } | null
}

/**
 * The weather verdict for one operation, at its own location and for its own type.
 *
 * Null when the operation has no location or the location has no observation yet:
 * a missing verdict is reported as missing, not as Favorable.
 */
export async function getOperationWeather(
  ctx: TenantContext,
  operation: { locationId: string | null; type: OperationType; plannedStart: Date },
  options: { now?: Date } = {},
): Promise<OperationWeather | null> {
  if (!operation.locationId) return null

  const now = options.now ?? new Date()
  const [byLocation, overrides] = await Promise.all([
    getLocationConditions(ctx, { now }),
    weatherOverrides(ctx),
  ])

  const entry = byLocation.get(operation.locationId)
  if (!entry?.conditions) return null

  const verdict = evaluateWeatherWindow(
    operation.type,
    metricsFrom(entry.conditions),
    entry.conditions.observedAt,
    overrides,
  )

  // The first forecast hour whose verdict differs from now: "Unsafe from 18:00" is
  // what lets a coordinator decide whether to start at all.
  const changesAt =
    entry.forecast
      .map((point) => ({
        at: point.forecastFor,
        status: evaluateWeatherWindow(operation.type, metricsFrom(point), point.forecastFor, overrides)
          .status,
      }))
      .find((point) => point.status !== verdict.status) ?? null

  return { verdict, conditions: entry.conditions, changesAt }
}
