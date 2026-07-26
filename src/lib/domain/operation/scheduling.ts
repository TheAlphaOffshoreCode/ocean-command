import { DomainRuleError } from '@/lib/errors'

/**
 * Vessel scheduling rules.
 *
 * The failure this prevents is mundane and expensive: two operations planned on
 * the same vessel at the same time. It survives a planning meeting because each
 * one looks reasonable on its own, and it surfaces offshore, when a PSV is
 * expected in two fields at once.
 */

export type ScheduleWindow = {
  start: Date
  end: Date
}

export type ScheduledOperation = ScheduleWindow & {
  id: string
  code: string
  name: string
}

/**
 * Half-open comparison: an operation ending exactly when the next begins is not a
 * conflict. Back-to-back jobs are normal, and treating a shared boundary as an
 * overlap would make the check cry wolf on every well-planned schedule.
 */
export function windowsOverlap(a: ScheduleWindow, b: ScheduleWindow): boolean {
  return a.start < b.end && b.start < a.end
}

export function assertValidWindow(window: ScheduleWindow): void {
  if (!(window.end > window.start)) {
    throw new DomainRuleError(
      'operation.invalid_window',
      'The planned end must be after the planned start.',
    )
  }
}

/**
 * Which of the existing operations a proposed window collides with.
 *
 * Returns them rather than a boolean, because "this vessel is busy" is not
 * actionable — "this vessel is on OP-2026-0007 until Thursday 14:00" is. The
 * caller passes only operations that still occupy the vessel; the status filter
 * belongs to the query, not here.
 */
export function findScheduleConflicts(
  proposed: ScheduleWindow,
  existing: readonly ScheduledOperation[],
  excludeOperationId?: string,
): ScheduledOperation[] {
  return existing
    .filter((operation) => operation.id !== excludeOperationId)
    .filter((operation) => windowsOverlap(proposed, operation))
}

/** Formats the refusal so an operator can act on it without opening another screen. */
export function describeConflicts(conflicts: readonly ScheduledOperation[]): string {
  if (conflicts.length === 1) {
    const [only] = conflicts
    return `This vessel is already committed to ${only!.code} (${only!.name}) in that window.`
  }

  return `This vessel is already committed in that window: ${conflicts
    .map((operation) => operation.code)
    .join(', ')}.`
}
