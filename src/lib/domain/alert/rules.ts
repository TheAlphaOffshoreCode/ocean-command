import type {
  AlertSeverity,
  AlertType,
  OperationStatus,
  OperationType,
  Priority,
  RiskLevel,
} from '@prisma/client'

import { describeVerdict, type WeatherVerdict } from '@/lib/domain/weather/weather-window'

/**
 * What raises an alert.
 *
 * Pure functions from state to candidates: no database, no clock beyond what is
 * passed in. The service that persists them deduplicates by (sourceModule,
 * sourceRef, type) so a rule evaluated every fifteen minutes updates one alert
 * instead of raising ninety-six a day — see DECISIONS.md P11.
 *
 * Every candidate names where it came from. An alert nobody can trace back to a
 * condition is an alert nobody can close with confidence.
 */

export type AlertCandidate = {
  type: AlertType
  severity: AlertSeverity
  title: string
  description: string
  /** Which module raised it, and the record it is about. Together: the dedup key. */
  sourceModule: string
  sourceRef: string
  vesselId?: string | null
  operationId?: string | null
  assetId?: string | null
}

/** Operations that are under way carry more weight than ones still being planned. */
const ACTIVE: readonly OperationStatus[] = ['IN_PROGRESS', 'READY']

export type OperationForAlerts = {
  id: string
  code: string
  name: string
  type: OperationType
  status: OperationStatus
  priority: Priority
  vesselId: string | null
  plannedStart: Date
  plannedEnd: Date
  actualStart: Date | null
}

/**
 * Weather that puts an operation outside its limits.
 *
 * Severity follows exposure, not just the verdict: an unsafe window on a job
 * already under way is a stop-work conversation, while the same window on next
 * week's plan is a scheduling problem.
 */
export function weatherAlertsFor(
  operation: OperationForAlerts,
  verdict: WeatherVerdict,
  locationName: string,
): AlertCandidate[] {
  if (verdict.status === 'FAVORABLE') return []

  const underWay = ACTIVE.includes(operation.status)

  const severity: AlertSeverity =
    verdict.status === 'UNSAFE' ? (underWay ? 'CRITICAL' : 'HIGH') : underWay ? 'MEDIUM' : 'LOW'

  return [
    {
      type: 'WEATHER',
      severity,
      title:
        verdict.status === 'UNSAFE'
          ? `Weather outside limits for ${operation.code}`
          : `Weather marginal for ${operation.code}`,
      // The reasons come from the verdict, so the alert says which metric and
      // against which limit rather than "bad weather".
      description: `${operation.name} at ${locationName}. ${describeVerdict(verdict)}`,
      sourceModule: 'weather',
      sourceRef: operation.id,
      operationId: operation.id,
      vesselId: operation.vesselId,
    },
  ]
}

/**
 * Operations that should have started and have not, or that have run past their
 * planned end while still open.
 */
export function delayAlertsFor(operation: OperationForAlerts, now: Date): AlertCandidate[] {
  const terminal = operation.status === 'COMPLETED' || operation.status === 'CANCELLED'
  if (terminal) return []

  const lateToStart = !operation.actualStart && now > operation.plannedStart
  const overrunning = operation.actualStart !== null && now > operation.plannedEnd

  if (!lateToStart && !overrunning) return []

  const hoursLate = Math.floor(
    (now.getTime() - (lateToStart ? operation.plannedStart : operation.plannedEnd).getTime()) /
      3_600_000,
  )

  // Priority drives severity: a late critical job is not the same as a late survey.
  const severity: AlertSeverity =
    operation.priority === 'CRITICAL'
      ? 'HIGH'
      : operation.priority === 'HIGH'
        ? 'MEDIUM'
        : 'LOW'

  return [
    {
      type: 'OPERATION',
      severity,
      title: lateToStart
        ? `${operation.code} has not started`
        : `${operation.code} is running past its planned end`,
      description: lateToStart
        ? `${operation.name} was due to start ${hoursLate}h ago and has no actual start.`
        : `${operation.name} passed its planned end ${hoursLate}h ago and is still ${operation.status.replaceAll('_', ' ').toLowerCase()}.`,
      sourceModule: 'operations',
      sourceRef: operation.id,
      operationId: operation.id,
      vesselId: operation.vesselId,
    },
  ]
}

export type RiskForAlerts = {
  id: string
  code: string
  title: string
  level: RiskLevel
  status: string
  vesselId: string | null
  operationId: string | null
}

/**
 * Critical and high risks that are still open.
 *
 * A risk register nobody opens during the operation it refers to is the failure
 * this addresses: the register pushes into the alert panel instead of waiting to
 * be visited.
 */
export function riskAlertsFor(risk: RiskForAlerts): AlertCandidate[] {
  const open = risk.status === 'OPEN' || risk.status === 'MITIGATING'
  if (!open) return []
  if (risk.level !== 'CRITICAL' && risk.level !== 'HIGH') return []

  return [
    {
      type: 'RISK',
      severity: risk.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      title: `${risk.level === 'CRITICAL' ? 'Critical' : 'High'} risk open: ${risk.code}`,
      description: risk.title,
      sourceModule: 'risk',
      sourceRef: risk.id,
      operationId: risk.operationId,
      vesselId: risk.vesselId,
    },
  ]
}

/** The dedup key, in one place so the service and the tests cannot disagree. */
export function alertKey(candidate: AlertCandidate): string {
  return `${candidate.sourceModule}:${candidate.sourceRef}:${candidate.type}`
}
