import { NextResponse } from 'next/server'

import { env, isProduction } from '@/config/env'
import { refreshWeather } from '@/features/weather/services/refresh-weather'
import { listActiveOrganizations } from '@/lib/db/system'
import { logger } from '@/lib/logger'

/**
 * Scheduled weather refresh, one organization at a time.
 *
 * Open-Meteo updates roughly every 15 minutes and asks for reasonable use, so this
 * is meant to run hourly rather than continuously — and the application reads its
 * own tables in between, which is what keeps a page load off the vendor's servers.
 *
 * Same closed-when-unconfigured rule as the AIS job: no CRON_SECRET in production
 * means the route refuses every request instead of running unauthenticated.
 */
export async function POST(request: Request) {
  const secret = env.CRON_SECRET

  if (isProduction && !secret) {
    logger.warn({ module: 'cron' }, 'Weather refresh called with no CRON_SECRET configured')
    return NextResponse.json({ error: { code: 'NOT_CONFIGURED' } }, { status: 503 })
  }

  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const organizations = await listActiveOrganizations()
  const results: Array<{
    organizationId: string
    observations: number
    forecastPoints: number
    failures: number
  }> = []

  for (const organization of organizations) {
    const ctx = {
      userId: 'system:cron',
      userName: 'Scheduled refresh',
      userEmail: 'system@ocean-command.local',
      organizationId: organization.id,
      organizationName: organization.name,
      role: 'ADMINISTRATOR' as const,
      isDemo: organization.isDemo,
    }

    try {
      const outcome = await refreshWeather(ctx)
      results.push({
        organizationId: organization.id,
        observations: outcome.observations,
        forecastPoints: outcome.forecastPoints,
        failures: outcome.failures.length,
      })
    } catch (error) {
      logger.error(
        { err: error, module: 'cron', organizationId: organization.id },
        'Weather refresh failed for organization',
      )
      results.push({
        organizationId: organization.id,
        observations: 0,
        forecastPoints: 0,
        failures: 1,
      })
    }
  }

  return NextResponse.json({
    provider: env.WEATHER_PROVIDER,
    organizations: results.length,
    observations: results.reduce((total, entry) => total + entry.observations, 0),
    forecastPoints: results.reduce((total, entry) => total + entry.forecastPoints, 0),
    results,
  })
}
