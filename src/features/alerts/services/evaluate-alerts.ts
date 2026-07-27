import 'server-only'

import { AlertEventType, AlertStatus } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { nextCode } from '@/lib/db/sequence'
import { withAudit, type TenantTransaction } from '@/lib/db/with-audit'
import {
  alertKey,
  delayAlertsFor,
  riskAlertsFor,
  weatherAlertsFor,
  type AlertCandidate,
  type OperationForAlerts,
} from '@/lib/domain/alert/rules'
import { OPEN_STATUSES } from '@/lib/domain/alert/lifecycle'
import { TERMINAL_STATUSES } from '@/lib/domain/operation/transitions'
import { evaluateWeatherWindow } from '@/lib/domain/weather/weather-window'
import {
  getLocationConditions,
  metricsFrom,
  weatherOverrides,
} from '@/features/weather/queries/get-conditions'

/**
 * Turns current state into alerts, and takes them away again when the condition
 * clears.
 *
 * The whole design rests on one property: **evaluating repeatedly must not
 * produce repeated alerts.** A weather rule run every fifteen minutes would
 * otherwise raise ninety-six alerts a day for one windy afternoon, and an alert
 * panel that produces noise is an alert panel people learn to ignore — at which
 * point a real critical alert scrolls past unread.
 *
 * So each candidate carries a stable key (sourceModule, sourceRef, type). An open
 * alert with that key is updated; a missing one is created; and an open alert
 * whose condition no longer appears is resolved automatically, with a note saying
 * why. The partial unique index in the database is the backstop.
 */

/** Modules whose alerts this evaluation owns, and may therefore auto-resolve. */
const RULE_MODULES = ['weather', 'operations', 'risk']

export type AlertEvaluationOutcome = {
  raised: number
  updated: number
  autoResolved: number
  evaluatedAt: Date
}

export async function evaluateAlerts(
  ctx: TenantContext,
  options: { now?: Date } = {},
): Promise<AlertEvaluationOutcome> {
  const now = options.now ?? new Date()
  const db = forTenant(ctx)

  const [operations, risks, conditionsByLocation, overrides] = await Promise.all([
    db.operation.findMany({
      where: { status: { notIn: [...TERMINAL_STATUSES] } },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true,
        priority: true,
        vesselId: true,
        locationId: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
      },
    }),
    db.risk.findMany({
      where: { status: { in: ['OPEN', 'MITIGATING'] } },
      select: {
        id: true,
        code: true,
        title: true,
        level: true,
        status: true,
        vesselId: true,
        operationId: true,
      },
    }),
    getLocationConditions(ctx, { now }),
    weatherOverrides(ctx),
  ])

  const candidates: AlertCandidate[] = []

  for (const operation of operations) {
    const forAlerts: OperationForAlerts = operation

    candidates.push(...delayAlertsFor(forAlerts, now))

    const location = operation.locationId ? conditionsByLocation.get(operation.locationId) : null
    if (location?.conditions) {
      const verdict = evaluateWeatherWindow(
        operation.type,
        metricsFrom(location.conditions),
        location.conditions.observedAt,
        overrides,
      )
      candidates.push(...weatherAlertsFor(forAlerts, verdict, location.locationName))
    }
  }

  for (const risk of risks) {
    candidates.push(...riskAlertsFor(risk))
  }

  const existing = await db.alert.findMany({
    where: { status: { in: [...OPEN_STATUSES] }, sourceModule: { in: RULE_MODULES } },
    select: {
      id: true,
      severity: true,
      title: true,
      description: true,
      sourceModule: true,
      sourceRef: true,
      type: true,
    },
  })

  const openByKey = new Map(
    existing.map((alert) => [
      `${alert.sourceModule}:${alert.sourceRef}:${alert.type}`,
      alert,
    ]),
  )

  const outcome: AlertEvaluationOutcome = {
    raised: 0,
    updated: 0,
    autoResolved: 0,
    evaluatedAt: now,
  }

  const seen = new Set<string>()

  for (const candidate of candidates) {
    const key = alertKey(candidate)
    seen.add(key)

    const open = openByKey.get(key)

    if (!open) {
      await raise(db, ctx, candidate, now)
      outcome.raised += 1
      continue
    }

    // The condition is still true but its detail may have moved — wind at 31 kn
    // rather than 26. Update in place; raising a second alert for the same
    // condition is exactly what this design exists to prevent.
    const changed =
      open.severity !== candidate.severity ||
      open.title !== candidate.title ||
      open.description !== candidate.description

    if (changed) {
      await db.alert.updateMany({
        where: { id: open.id },
        data: {
          severity: candidate.severity,
          title: candidate.title,
          description: candidate.description,
        },
      })
      await db.alertEvent.create({
        data: {
          alertId: open.id,
          type:
            severityRank(candidate.severity) > severityRank(open.severity)
              ? AlertEventType.ESCALATED
              : AlertEventType.COMMENTED,
          note: `Condition updated: ${candidate.description}`,
        },
      })
      outcome.updated += 1
    }
  }

  // Conditions that have cleared. Resolved automatically rather than left for
  // someone to tidy: an alert panel full of conditions that ended yesterday is the
  // same noise problem from the other direction.
  for (const [key, alert] of openByKey) {
    if (seen.has(key)) continue

    await db.alert.updateMany({
      where: { id: alert.id },
      data: { status: AlertStatus.RESOLVED, resolvedAt: now, resolvedBy: null },
    })
    await db.alertEvent.create({
      data: {
        alertId: alert.id,
        type: AlertEventType.RESOLVED,
        note: 'Condition cleared — resolved automatically by the alert rules.',
      },
    })
    outcome.autoResolved += 1
  }

  await withAudit(
    ctx,
    {
      action: 'alerts.evaluated',
      entityType: 'Alert',
      entityId: ctx.organizationId,
      after: outcome,
    },
    async () => outcome,
  )

  return outcome
}

async function raise(
  db: ReturnType<typeof forTenant>,
  ctx: TenantContext,
  candidate: AlertCandidate,
  now: Date,
) {
  await db.$transaction(async (tx: TenantTransaction) => {
    const code = await nextCode(tx, ctx.organizationId, 'ALERT', now.getUTCFullYear())

    const alert = await tx.alert.create({
      data: {
        organizationId: ctx.organizationId,
        code,
        type: candidate.type,
        severity: candidate.severity,
        status: AlertStatus.UNREAD,
        title: candidate.title,
        description: candidate.description,
        sourceModule: candidate.sourceModule,
        sourceRef: candidate.sourceRef,
        vesselId: candidate.vesselId ?? null,
        operationId: candidate.operationId ?? null,
        assetId: candidate.assetId ?? null,
      },
    })

    await tx.alertEvent.create({
      data: { alertId: alert.id, type: AlertEventType.RAISED, note: candidate.description },
    })
  })
}

const SEVERITY_RANK = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const

function severityRank(severity: keyof typeof SEVERITY_RANK): number {
  return SEVERITY_RANK[severity]
}
