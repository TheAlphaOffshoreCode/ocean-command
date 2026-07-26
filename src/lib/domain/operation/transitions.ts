import { OperationStatus } from '@prisma/client'

import { DomainRuleError } from '@/lib/errors'

/**
 * The operation lifecycle, as an explicit table.
 *
 * A status column the UI can set to any value is not a workflow — and it makes
 * the audit trail unreliable, because "who moved this to Completed, and from
 * what?" stops having a single answer. Every change goes through here, and every
 * accepted change writes an OperationEvent.
 *
 * The shape mirrors how an offshore job actually moves:
 *
 *   Planned → Preparing → Ready → In Progress → Completed
 *                                      ↕
 *                                  Suspended
 *
 * Backwards steps exist because reality has them: a job that turns out not to be
 * ready goes back to Preparing. Forward jumps do not: an operation cannot reach
 * Completed without having been In Progress, or a completed job would have no
 * actual start.
 */

const ALLOWED: Record<OperationStatus, readonly OperationStatus[]> = {
  PLANNED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'PLANNED', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'PREPARING', 'CANCELLED'],
  // No cancelling a job that is under way: it is suspended first, which is the
  // decision an operations room actually makes — stop work, then decide.
  IN_PROGRESS: ['SUSPENDED', 'COMPLETED'],
  SUSPENDED: ['IN_PROGRESS', 'CANCELLED'],
  // Terminal. Reopening a completed or cancelled operation would rewrite history;
  // the answer is a new operation that references it.
  COMPLETED: [],
  CANCELLED: [],
}

export const TERMINAL_STATUSES: readonly OperationStatus[] = [
  OperationStatus.COMPLETED,
  OperationStatus.CANCELLED,
]

/** Statuses that still occupy a vessel, for scheduling purposes. */
export const ACTIVE_STATUSES: readonly OperationStatus[] = [
  OperationStatus.PLANNED,
  OperationStatus.PREPARING,
  OperationStatus.READY,
  OperationStatus.IN_PROGRESS,
  OperationStatus.SUSPENDED,
]

export function isTerminal(status: OperationStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function allowedTransitions(from: OperationStatus): readonly OperationStatus[] {
  return ALLOWED[from]
}

export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
  return ALLOWED[from].includes(to)
}

/** Throws a message written for the operator, not for a stack trace. */
export function assertTransitionAllowed(from: OperationStatus, to: OperationStatus): void {
  if (from === to) {
    throw new DomainRuleError(
      'operation.status_unchanged',
      `This operation is already ${label(from)}.`,
    )
  }

  if (canTransition(from, to)) return

  if (isTerminal(from)) {
    throw new DomainRuleError(
      'operation.terminal_status',
      `${label(from)} is a final status. Create a new operation instead of reopening this one.`,
    )
  }

  throw new DomainRuleError(
    'operation.invalid_transition',
    `An operation cannot go from ${label(from)} to ${label(to)}. From here it can only become ${ALLOWED[
      from
    ]
      .map(label)
      .join(', ')}.`,
  )
}

const LABELS: Record<OperationStatus, string> = {
  PLANNED: 'Planned',
  PREPARING: 'Preparing',
  READY: 'Ready',
  IN_PROGRESS: 'In progress',
  SUSPENDED: 'Suspended',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export function label(status: OperationStatus): string {
  return LABELS[status]
}

/**
 * Timestamps a transition implies.
 *
 * Actual start and end are set by the workflow, never typed in: they are the
 * record of when work happened, and letting them be edited freely is how plan
 * and actual quietly become the same number.
 *
 * `actualStart` is only stamped once — a job that is suspended and resumed
 * started when it first started.
 */
export function timestampsFor(
  to: OperationStatus,
  current: { actualStart: Date | null; actualEnd: Date | null },
  now: Date,
): { actualStart?: Date; actualEnd?: Date | null } {
  switch (to) {
    case OperationStatus.IN_PROGRESS:
      return {
        ...(current.actualStart ? {} : { actualStart: now }),
        // Resuming after suspension clears a previously stamped end.
        ...(current.actualEnd ? { actualEnd: null } : {}),
      }

    case OperationStatus.COMPLETED:
      return { actualEnd: now, ...(current.actualStart ? {} : { actualStart: now }) }

    case OperationStatus.CANCELLED:
      // A cancelled operation has no completion time. If it had started, that
      // start stays: it did start.
      return { actualEnd: null }

    default:
      return {}
  }
}
