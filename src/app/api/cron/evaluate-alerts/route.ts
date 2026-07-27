import { NextResponse } from 'next/server'

import { env, isProduction } from '@/config/env'
import { evaluateAlerts } from '@/features/alerts/services/evaluate-alerts'
import { listActiveOrganizations } from '@/lib/db/system'
import { logger } from '@/lib/logger'

/**
 * Scheduled alert evaluation, one organization at a time.
 *
 * Designed to be safe to run often — every fifteen minutes is the intended
 * cadence. That is only tolerable because the rules deduplicate: an ongoing
 * condition updates its existing alert, and a condition that has cleared resolves
 * one. Running this ninety-six times a day produces the alerts the state
 * justifies, not ninety-six copies of them.
 *
 * Same closed-when-unconfigured rule as the other jobs.
 */
export async function POST(request: Request) {
  const secret = env.CRON_SECRET

  if (isProduction && !secret) {
    logger.warn({ module: 'cron' }, 'Alert evaluation called with no CRON_SECRET configured')
    return NextResponse.json({ error: { code: 'NOT_CONFIGURED' } }, { status: 503 })
  }

  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const organizations = await listActiveOrganizations()
  const results: Array<{
    organizationId: string
    raised: number
    updated: number
    autoResolved: number
  }> = []

  for (const organization of organizations) {
    const ctx = {
      userId: 'system:cron',
      userName: 'Alert rules',
      userEmail: 'system@ocean-command.local',
      organizationId: organization.id,
      organizationName: organization.name,
      role: 'ADMINISTRATOR' as const,
      isDemo: organization.isDemo,
    }

    try {
      const outcome = await evaluateAlerts(ctx)
      results.push({
        organizationId: organization.id,
        raised: outcome.raised,
        updated: outcome.updated,
        autoResolved: outcome.autoResolved,
      })
    } catch (error) {
      logger.error(
        { err: error, module: 'cron', organizationId: organization.id },
        'Alert evaluation failed for organization',
      )
      results.push({ organizationId: organization.id, raised: 0, updated: 0, autoResolved: 0 })
    }
  }

  return NextResponse.json({
    organizations: results.length,
    raised: results.reduce((total, entry) => total + entry.raised, 0),
    updated: results.reduce((total, entry) => total + entry.updated, 0),
    autoResolved: results.reduce((total, entry) => total + entry.autoResolved, 0),
    results,
  })
}
