import { AlertStatus, type AlertSeverity } from '@prisma/client'

import { DomainRuleError } from '@/lib/errors'

/**
 * The alert lifecycle.
 *
 * Unread → Acknowledged → Resolved, with reopening allowed from Resolved because
 * a condition that comes back is the same condition, not a new one.
 *
 * The distinction that matters, and the reason the two are separate statuses:
 * **acknowledging is taking ownership; resolving is declaring it over.** Anyone on
 * shift can do the first — that is how a critical alert stops being unowned at
 * 03:00. Declaring the condition finished is a supervisory act, and conflating
 * them is what makes an alert trail meaningless: nobody can tell "someone saw it"
 * from "someone dealt with it".
 */

const ALLOWED: Record<AlertStatus, readonly AlertStatus[]> = {
  UNREAD: ['ACKNOWLEDGED', 'RESOLVED'],
  ACKNOWLEDGED: ['RESOLVED', 'UNREAD'],
  // Reopened when the condition returns.
  RESOLVED: ['UNREAD', 'ACKNOWLEDGED'],
}

export const OPEN_STATUSES: readonly AlertStatus[] = [AlertStatus.UNREAD, AlertStatus.ACKNOWLEDGED]

export function isOpen(status: AlertStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

export function canTransition(from: AlertStatus, to: AlertStatus): boolean {
  return ALLOWED[from].includes(to)
}

export function assertAlertTransition(from: AlertStatus, to: AlertStatus): void {
  if (from === to) {
    throw new DomainRuleError(
      'alert.status_unchanged',
      `This alert is already ${LABELS[from].toLowerCase()}.`,
    )
  }

  if (!canTransition(from, to)) {
    throw new DomainRuleError(
      'alert.invalid_transition',
      `An alert cannot go from ${LABELS[from].toLowerCase()} to ${LABELS[to].toLowerCase()}.`,
    )
  }
}

export const LABELS: Record<AlertStatus, string> = {
  UNREAD: 'Unread',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
}

export function compareBySeverity(a: AlertSeverity, b: AlertSeverity): number {
  return SEVERITY_ORDER[b] - SEVERITY_ORDER[a]
}

export function isAtLeastSeverity(severity: AlertSeverity, minimum: AlertSeverity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[minimum]
}

/**
 * What a transition implies for the record.
 *
 * Acknowledgement is stamped once and kept: an alert that was acknowledged at
 * 03:12 and resolved at 07:40 tells a story, and overwriting the first timestamp
 * on the second action erases it.
 */
export function alertTimestampsFor(
  to: AlertStatus,
  current: { acknowledgedAt: Date | null; acknowledgedBy: string | null },
  actorId: string,
  now: Date,
): {
  acknowledgedAt?: Date | null
  acknowledgedBy?: string | null
  resolvedAt?: Date | null
  resolvedBy?: string | null
} {
  switch (to) {
    case AlertStatus.ACKNOWLEDGED:
      return {
        ...(current.acknowledgedAt
          ? {}
          : { acknowledgedAt: now, acknowledgedBy: actorId }),
        // Coming back from Resolved: it is open again, so it has no resolution.
        resolvedAt: null,
        resolvedBy: null,
      }

    case AlertStatus.RESOLVED:
      return {
        resolvedAt: now,
        resolvedBy: actorId,
        // Resolving without acknowledging still records who saw it.
        ...(current.acknowledgedAt ? {} : { acknowledgedAt: now, acknowledgedBy: actorId }),
      }

    case AlertStatus.UNREAD:
      // Reopened from scratch: it is nobody's until someone takes it again.
      return { acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null }

    default:
      return {}
  }
}
