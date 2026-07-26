import Link from 'next/link'

import { EmptyState } from '@/components/shared/states'
import type { OperationListItem } from '@/features/operations/queries/list-operations'
import { cn } from '@/lib/utils'

import { OperationStatusBadge } from './operation-badges'

/**
 * Plan versus actual, on one row per operation.
 *
 * The point of the view is the *gap* between the two bars: a schedule that says
 * everything is fine tells a coordinator nothing, while a job whose actual bar
 * starts three hours right of its plan is the thing worth asking about.
 *
 * Deliberately server-rendered CSS rather than a charting library: it is bars on a
 * shared axis, and pulling in a chart runtime for that would cost bundle for no
 * capability.
 */

const HOUR = 60 * 60 * 1000

type Props = {
  operations: OperationListItem[]
  /** Window shown, in days. */
  days?: number
  now?: Date
}

export function OperationsTimeline({ operations, days = 7, now = new Date() }: Props) {
  // Centred on now, so the reader sees what just happened and what is coming.
  const windowStart = new Date(now.getTime() - (days / 3) * 24 * HOUR)
  const windowEnd = new Date(now.getTime() + (days - days / 3) * 24 * HOUR)
  const span = windowEnd.getTime() - windowStart.getTime()

  const visible = operations.filter(
    (operation) => operation.plannedStart < windowEnd && operation.plannedEnd > windowStart,
  )

  if (visible.length === 0) {
    return (
      <EmptyState
        title="Nothing scheduled in this window"
        description={`No operation overlaps the ${days}-day window around now.`}
      />
    )
  }

  const percent = (value: Date) =>
    Math.min(100, Math.max(0, ((value.getTime() - windowStart.getTime()) / span) * 100))

  const nowPercent = percent(now)

  return (
    <div className="space-y-1">
      <div className="text-ink-faint numeric flex justify-between px-4 text-[10px]">
        <span>{windowStart.toISOString().slice(0, 10)}</span>
        <span>now</span>
        <span>{windowEnd.toISOString().slice(0, 10)}</span>
      </div>

      <div className="relative">
        {/* The "now" line is what makes a bar late rather than merely long. */}
        <div
          className="bg-accent/40 pointer-events-none absolute inset-y-0 z-10 w-px"
          style={{ left: `calc(${nowPercent}% )` }}
          aria-hidden
        />

        <ul className="divide-line divide-y">
          {visible.map((operation) => {
            const plannedLeft = percent(operation.plannedStart)
            const plannedWidth = Math.max(0.6, percent(operation.plannedEnd) - plannedLeft)

            const actualLeft = operation.actualStart ? percent(operation.actualStart) : null
            const actualEnd = operation.actualEnd ?? (operation.actualStart ? now : null)
            const actualWidth =
              actualLeft !== null && actualEnd ? Math.max(0.6, percent(actualEnd) - actualLeft) : null

            return (
              <li key={operation.id} className="hover:bg-surface-overlay px-4 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/operations/${operation.id}`}
                    className="text-ink hover:text-accent truncate text-xs font-medium"
                  >
                    <span className="numeric text-ink-faint mr-2">{operation.code}</span>
                    {operation.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {operation.vessel ? (
                      <span className="text-ink-faint text-[11px]">{operation.vessel.name}</span>
                    ) : null}
                    <OperationStatusBadge status={operation.status} />
                  </span>
                </div>

                <div className="mt-1.5 space-y-1">
                  <Bar
                    left={plannedLeft}
                    width={plannedWidth}
                    className="bg-line"
                    title={`Planned ${operation.plannedStart.toISOString()} → ${operation.plannedEnd.toISOString()}`}
                  />
                  {actualLeft !== null && actualWidth !== null ? (
                    <Bar
                      left={actualLeft}
                      width={actualWidth}
                      className={operation.isDelayed ? 'bg-warning' : 'bg-accent'}
                      title={`Actual from ${operation.actualStart!.toISOString()}${
                        operation.actualEnd ? ` to ${operation.actualEnd.toISOString()}` : ' (running)'
                      }`}
                    />
                  ) : (
                    // Keeps the row height stable whether or not work has started,
                    // so the bars stay aligned down the column.
                    <div className="h-1.5" aria-hidden />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="text-ink-faint flex gap-4 px-4 pt-2 text-[10px]">
        <Legend className="bg-line">Planned</Legend>
        <Legend className="bg-accent">Actual</Legend>
        <Legend className="bg-warning">Delayed</Legend>
      </div>
    </div>
  )
}

function Bar({
  left,
  width,
  className,
  title,
}: {
  left: number
  width: number
  className: string
  title: string
}) {
  return (
    <div className="relative h-1.5 w-full">
      <div
        className={cn('absolute h-1.5 rounded-full', className)}
        style={{ left: `${left}%`, width: `${width}%` }}
        title={title}
      />
    </div>
  )
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-1.5 w-4 rounded-full', className)} aria-hidden />
      {children}
    </span>
  )
}
