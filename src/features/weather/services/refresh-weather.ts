import 'server-only'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { withAudit } from '@/lib/db/with-audit'
import { ProviderError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { weatherProvider } from '@/providers/weather'
import type { WeatherForecastPoint } from '@/providers/weather'

/**
 * Pulls conditions from the weather provider and stores them.
 *
 * The application always reads its own tables, never the vendor: it bounds the
 * request rate, it keeps the product usable during an outage (with the age of the
 * data on screen), and it means a forecast chart is not a live dependency on
 * somebody else's uptime.
 *
 * Runs from the cron route handler or the explicit refresh action — never during
 * render, because writing while rendering is forbidden in Next and a page load
 * mutating stored observations would be wrong even if it were allowed.
 */

/** Two days is enough to see a window open or close without hoarding forecast rows. */
export const FORECAST_HOURS = 48

export type RefreshOutcome = {
  locations: number
  observations: number
  forecastPoints: number
  failures: Array<{ locationId: string; name: string; reason: string }>
  refreshedAt: Date
}

/** Merges the atmospheric and marine series into one row per hour. */
function mergeForecasts(
  atmospheric: WeatherForecastPoint[],
  marine: WeatherForecastPoint[],
): WeatherForecastPoint[] {
  const byHour = new Map<number, WeatherForecastPoint>()

  for (const point of atmospheric) {
    byHour.set(point.forecastFor.getTime(), point)
  }

  for (const point of marine) {
    const key = point.forecastFor.getTime()
    const existing = byHour.get(key)

    // Sea state arrives from a different host, so an hour can exist in one series
    // and not the other. Keep whichever we have rather than dropping the hour.
    byHour.set(
      key,
      existing
        ? { ...existing, waveHeightM: point.waveHeightM, swellHeightM: point.swellHeightM }
        : point,
    )
  }

  return [...byHour.values()].sort(
    (a, b) => a.forecastFor.getTime() - b.forecastFor.getTime(),
  )
}

export async function refreshWeather(ctx: TenantContext): Promise<RefreshOutcome> {
  const db = forTenant(ctx)
  const provider = weatherProvider()

  const locations = await db.location.findMany({
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { name: 'asc' },
  })

  const outcome: RefreshOutcome = {
    locations: locations.length,
    observations: 0,
    forecastPoints: 0,
    failures: [],
    refreshedAt: new Date(),
  }

  for (const location of locations) {
    const at = { latitude: Number(location.latitude), longitude: Number(location.longitude) }

    try {
      const [observation, atmospheric, marine] = await Promise.all([
        provider.getCurrentWeather(at),
        provider.getForecast(at, FORECAST_HOURS),
        provider.getMarineForecast(at, FORECAST_HOURS),
      ])

      // Not upsert: the tenant-scoped client refuses it, because an upsert
      // addresses its row by unique key alone and Prisma will not accept the
      // organization filter beside it. Insert first — the common case is a new
      // hour — and fall back to a scoped update when this hour is already stored.
      const inserted = await db.weatherObservation
        .createMany({
          data: [{ ...observation, locationId: location.id, organizationId: ctx.organizationId }],
          skipDuplicates: true,
        })
        .then((result) => result.count)

      if (inserted === 0) {
        await db.weatherObservation.updateMany({
          where: {
            locationId: location.id,
            observedAt: observation.observedAt,
            provider: observation.provider,
          },
          data: observation,
        })
      }
      outcome.observations += 1

      const forecast = mergeForecasts(atmospheric, marine)

      // Replace the horizon rather than merging hour by hour: a forecast issued now
      // supersedes the one issued an hour ago, and 48 upserts per location is a lot
      // of round trips to say the same thing. Both statements are tenant-scoped.
      await db.weatherForecast.deleteMany({
        where: {
          locationId: location.id,
          provider: provider.name,
          forecastFor: { gte: forecast[0]?.forecastFor ?? outcome.refreshedAt },
        },
      })

      if (forecast.length > 0) {
        await db.weatherForecast.createMany({
          data: forecast.map((point) => ({
            ...point,
            issuedAt: outcome.refreshedAt,
            locationId: location.id,
            organizationId: ctx.organizationId,
          })),
          skipDuplicates: true,
        })
      }
      outcome.forecastPoints += forecast.length
    } catch (error) {
      // One location failing must not abandon the rest: a coordinator would rather
      // have five fields refreshed and one stale than nothing at all.
      const reason = error instanceof ProviderError ? error.message : 'Unexpected failure'
      logger.error(
        { err: error, module: 'weather', locationId: location.id, provider: provider.name },
        'Weather refresh failed for location',
      )
      outcome.failures.push({ locationId: location.id, name: location.name, reason })
    }
  }

  // One audit row for the refresh, not one per forecast hour: a trail flooded by
  // machine writes is a trail nobody can read a human action out of.
  await withAudit(
    ctx,
    {
      action: 'weather.refreshed',
      entityType: 'Weather',
      entityId: ctx.organizationId,
      after: { ...outcome, provider: provider.name },
    },
    async () => outcome,
  )

  return outcome
}
