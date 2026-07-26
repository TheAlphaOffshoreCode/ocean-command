import Link from 'next/link'

import { EmptyState } from '@/components/shared/states'
import { TimeAgo } from '@/components/shared/time-ago'
import type { ActivityEntry } from '@/features/operations/queries/activity-feed'
import { label } from '@/lib/domain/operation/transitions'

/**
 * What has happened, newest first.
 *
 * Reads OperationEvent, which is why that table exists: "who moved OP-2026-0002
 * to Suspended, when, and why" is a question a status column cannot answer.
 */
export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Status changes and reschedules appear here as they happen."
      />
    )
  }

  return (
    <ul className="divide-line divide-y">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 px-4 py-2.5">
          <span className="text-ink-faint numeric w-14 shrink-0 pt-0.5 text-[11px]">
            <TimeAgo value={entry.occurredAt} />
          </span>

          <div className="min-w-0">
            <p className="text-ink-muted text-xs">
              <Link
                href={`/operations/${entry.operation.id}`}
                className="text-ink hover:text-accent font-medium"
              >
                <span className="numeric">{entry.operation.code}</span> {entry.operation.name}
              </Link>{' '}
              {describe(entry)}
            </p>

            {entry.message ? (
              <p className="text-ink-faint mt-0.5 text-[11px]">{entry.message}</p>
            ) : null}
          </div>

          {entry.vesselName ? (
            <span className="text-ink-faint ml-auto shrink-0 text-[11px]">{entry.vesselName}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Reads as a sentence in a log, not as an enum name. */
function describe(entry: ActivityEntry): string {
  switch (entry.type) {
    case 'CREATED':
      return 'was created'
    case 'STATUS_CHANGED':
      return entry.fromStatus && entry.toStatus
        ? `moved from ${label(entry.fromStatus)} to ${label(entry.toStatus)}`
        : 'changed status'
    case 'RESCHEDULED':
      return 'was rescheduled'
    case 'RESOURCE_CHANGED':
      return 'had its details updated'
    case 'WEATHER_HOLD':
      return 'was put on weather hold'
    case 'NOTE_ADDED':
      return 'received a note'
    default:
      return 'was updated'
  }
}
