import { NextResponse } from 'next/server'

import { syncFleetPositions } from '@/features/fleet/services/sync-positions'
import { env, isProduction } from '@/config/env'
import { listActiveOrganizations } from '@/lib/db/system'
import { logger } from '@/lib/logger'

/**
 * Scheduled AIS refresh, one organization at a time.
 *
 * This is the automated counterpart of the "Sync AIS" button. It is a route
 * handler rather than something invoked during render, because writing while
 * rendering is forbidden in Next — and because a page load quietly mutating
 * position history would be the wrong thing even if it were allowed.
 *
 * Auth: a shared secret in the Authorization header. If CRON_SECRET is unset in
 * production the route refuses every request rather than running openly — the
 * same closed-when-unconfigured rule as /api/metrics.
 */
export async function POST(request: Request) {
  const secret = env.CRON_SECRET

  if (isProduction && !secret) {
    logger.warn({ module: 'cron' }, 'AIS sync called with no CRON_SECRET configured')
    return NextResponse.json({ error: { code: 'NOT_CONFIGURED' } }, { status: 503 })
  }

  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  // One of the few legitimate cross-tenant reads, named in lib/db/system rather
  // than reaching for the raw client from a route handler.
  const organizations = await listActiveOrganizations()

  const results: Array<{ organizationId: string; fixesRecorded: number; error?: string }> = []

  for (const organization of organizations) {
    // A synthetic context: this runs as the system, not as a user, so the audit
    // row records the organization with no actor rather than borrowing someone's
    // identity. Tenant scoping still applies, one organization at a time.
    const ctx = {
      userId: 'system:cron',
      userName: 'Scheduled sync',
      userEmail: 'system@ocean-command.local',
      organizationId: organization.id,
      organizationName: organization.name,
      role: 'ADMINISTRATOR' as const,
      isDemo: organization.isDemo,
    }

    try {
      const outcome = await syncFleetPositions(ctx)
      results.push({ organizationId: organization.id, fixesRecorded: outcome.fixesRecorded })
    } catch (error) {
      // One organization's provider failure must not stop the others.
      logger.error(
        { err: error, module: 'cron', organizationId: organization.id },
        'AIS sync failed for organization',
      )
      results.push({
        organizationId: organization.id,
        fixesRecorded: 0,
        error: 'sync failed',
      })
    }
  }

  return NextResponse.json({
    provider: env.AIS_PROVIDER,
    organizations: results.length,
    fixesRecorded: results.reduce((total, entry) => total + entry.fixesRecorded, 0),
    results,
  })
}
