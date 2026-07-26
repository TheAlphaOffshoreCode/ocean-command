import 'server-only'

import { DomainRuleError } from '@/lib/errors'
import {
  assertValidWindow,
  describeConflicts,
  findScheduleConflicts,
  type ScheduleWindow,
} from '@/lib/domain/operation/scheduling'
import { ACTIVE_STATUSES } from '@/lib/domain/operation/transitions'
import type { TenantTransaction } from '@/lib/db/with-audit'

/**
 * Refuses to commit a vessel to two places at once.
 *
 * Runs inside the same transaction as the write. Checking before opening the
 * transaction would leave a window where two concurrent creates each see a clear
 * schedule and both succeed — which is exactly the situation this exists to
 * prevent, arriving by a different route.
 *
 * It is still not a hard guarantee: PostgreSQL's default isolation lets both
 * transactions read a schedule without the other's uncommitted row. Closing that
 * needs an exclusion constraint over a time range, which means PostGIS-style range
 * types and a migration — recorded as a limitation rather than implied away.
 */
export async function assertVesselAvailable(
  tx: TenantTransaction,
  input: {
    vesselId: string | null | undefined
    window: ScheduleWindow
    excludeOperationId?: string
  },
): Promise<void> {
  assertValidWindow(input.window)

  // An unassigned operation cannot double-book anything.
  if (!input.vesselId) return

  const committed = await tx.operation.findMany({
    where: {
      vesselId: input.vesselId,
      status: { in: [...ACTIVE_STATUSES] },
      // Only rows whose window could possibly overlap; the precise comparison is
      // the domain's, so the two cannot disagree.
      plannedStart: { lt: input.window.end },
      plannedEnd: { gt: input.window.start },
    },
    select: { id: true, code: true, name: true, plannedStart: true, plannedEnd: true },
  })

  const conflicts = findScheduleConflicts(
    input.window,
    committed.map((operation) => ({
      id: operation.id,
      code: operation.code,
      name: operation.name,
      start: operation.plannedStart,
      end: operation.plannedEnd,
    })),
    input.excludeOperationId,
  )

  if (conflicts.length > 0) {
    throw new DomainRuleError('operation.vessel_double_booked', describeConflicts(conflicts))
  }
}
