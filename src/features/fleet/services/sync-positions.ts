import 'server-only'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { withAudit } from '@/lib/db/with-audit'
import { shouldRecordFix } from '@/lib/domain/vessel/position-recording'
import { isTracked } from '@/lib/domain/vessel/tracking'
import { logger } from '@/lib/logger'
import { aisProvider } from '@/providers/ais'
import { ProviderError } from '@/lib/errors'

/**
 * Pulls positions from the AIS provider and persists what is worth keeping.
 *
 * Not called during render: writing while rendering is forbidden in Next, and it
 * would also mean a page load silently mutating history. It runs from the cron
 * route handler, or from the explicit "Sync AIS" action in the fleet view.
 */

export type SyncOutcome = {
  requested: number
  fixesRecorded: number
  skipped: number
  syncedAt: Date
}

export async function syncFleetPositions(ctx: TenantContext): Promise<SyncOutcome> {
  const db = forTenant(ctx)

  const vessels = await db.vessel.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      name: true,
      mmsi: true,
      type: true,
      status: true,
      archivedAt: true,
      lastLatitude: true,
      lastLongitude: true,
      lastPositionAt: true,
    },
  })

  // flatMap rather than filter + `!`: it narrows mmsi to a string, so the rest of
  // the function never has to assert that a tracked vessel has one.
  const tracked = vessels.flatMap((vessel) =>
    isTracked(vessel) && vessel.mmsi ? [{ ...vessel, mmsi: vessel.mmsi }] : [],
  )
  const mmsiList = tracked.map((vessel) => vessel.mmsi)

  if (mmsiList.length === 0) {
    return { requested: 0, fixesRecorded: 0, skipped: vessels.length, syncedAt: new Date() }
  }

  const provider = aisProvider()

  let snapshots
  try {
    snapshots = await provider.getVessels(mmsiList)
  } catch (cause) {
    // One provider outage must not take the fleet view down: callers show the
    // last known positions with their age, which is why they are denormalised.
    logger.error({ err: cause, module: 'fleet', provider: provider.name }, 'AIS sync failed')
    throw new ProviderError(provider.name, 'The AIS provider is unavailable.')
  }

  const byMmsi = new Map(snapshots.map((snapshot) => [snapshot.mmsi, snapshot]))
  let fixesRecorded = 0

  for (const vessel of tracked) {
    const snapshot = byMmsi.get(vessel.mmsi)
    if (!snapshot) continue

    const previous =
      vessel.lastLatitude && vessel.lastLongitude && vessel.lastPositionAt
        ? {
            position: {
              latitude: Number(vessel.lastLatitude),
              longitude: Number(vessel.lastLongitude),
            },
            recordedAt: vessel.lastPositionAt,
          }
        : null

    const next = { position: snapshot.position, recordedAt: snapshot.timestamp }

    // The denormalised columns always take the newest fix, so the map is current
    // even when the history is deliberately sparse.
    const vesselUpdate = {
      lastLatitude: snapshot.position.latitude,
      lastLongitude: snapshot.position.longitude,
      lastSpeedKn: snapshot.speedKn,
      lastHeadingDeg: snapshot.headingDeg,
      lastDestination: snapshot.destination,
      lastPositionAt: snapshot.timestamp,
      lastPositionSource: snapshot.source,
    }

    if (!shouldRecordFix(previous, next)) {
      await db.vessel.updateMany({ where: { id: vessel.id }, data: vesselUpdate })
      continue
    }

    // History row and the denormalised copy in one transaction: a current
    // position on the map that does not exist in the track is a lie about
    // where the vessel has been.
    await db.$transaction(async (tx) => {
      await tx.vesselPosition.create({
        data: {
          vesselId: vessel.id,
          organizationId: ctx.organizationId,
          latitude: snapshot.position.latitude,
          longitude: snapshot.position.longitude,
          speedKn: snapshot.speedKn,
          headingDeg: snapshot.headingDeg,
          courseDeg: snapshot.courseDeg,
          destination: snapshot.destination,
          source: snapshot.source,
          recordedAt: snapshot.timestamp,
        },
      })
      await tx.vessel.updateMany({ where: { id: vessel.id }, data: vesselUpdate })
    })

    fixesRecorded += 1
  }

  const outcome: SyncOutcome = {
    requested: mmsiList.length,
    fixesRecorded,
    skipped: vessels.length - tracked.length,
    syncedAt: new Date(),
  }

  // One audit row for the sync, not one per fix: an audit trail flooded by
  // machine writes is an audit trail nobody can read a human action out of.
  await withAudit(
    ctx,
    {
      action: 'fleet.positions_synced',
      entityType: 'Fleet',
      entityId: ctx.organizationId,
      after: { ...outcome, provider: provider.name },
    },
    async () => outcome,
  )

  return outcome
}
