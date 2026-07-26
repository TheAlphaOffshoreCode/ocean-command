import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { EmptyState } from '@/components/shared/states'
import { TimeAgo } from '@/components/shared/time-ago'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import {
  DelayBadge,
  OperationStatusBadge,
  PriorityBadge,
} from '@/features/operations/components/operation-badges'
import { OperationStatusActions } from '@/features/operations/components/operation-status-actions'
import { getOperation } from '@/features/operations/queries/get-operation'
import { VerdictReasons, WindowBadge } from '@/features/weather/components/window-badge'
import { getOperationWeather } from '@/features/weather/queries/get-conditions'
import { can } from '@/lib/auth/authorize'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { label } from '@/lib/domain/operation/transitions'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Operation' }

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ operationId: string }>
}) {
  const ctx = await requireTenantContext()
  const { operationId } = await params

  const operation = await getOperation(ctx, operationId)

  // Null covers "does not exist" and "belongs to another organization" alike.
  if (!operation) notFound()

  // The weather verdict for *this* operation's type at *its* location. The same sea
  // is favourable for anchor handling and unsafe for divers, so the verdict is
  // meaningless without both.
  const weather = await getOperationWeather(ctx, {
    locationId: operation.location?.id ?? null,
    type: operation.type,
    plannedStart: operation.plannedStart,
  })

  const delayed =
    operation.actualStart === null
      ? new Date() > operation.plannedStart && operation.status !== 'COMPLETED'
      : operation.actualStart > operation.plannedStart

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/operations"
          className="text-ink-faint hover:text-ink inline-flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Operations
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-ink-faint numeric text-sm">{operation.code}</span>
          <h1 className="text-ink text-xl font-semibold tracking-tight">{operation.name}</h1>
          <OperationStatusBadge status={operation.status} />
          <PriorityBadge priority={operation.priority} />
          <DelayBadge isDelayed={delayed} />
        </div>

        <p className="text-ink-muted mt-1 text-sm">
          {operation.type.replaceAll('_', ' ').toLowerCase()}
          {operation.location ? ` · ${operation.location.name}` : ''}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel>
            <PanelHeader title="Schedule" description="Planned against actual" />
            <PanelBody>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Planned start" value={iso(operation.plannedStart)} />
                <Field label="Planned end" value={iso(operation.plannedEnd)} />
                <Field
                  label="Actual start"
                  value={operation.actualStart ? iso(operation.actualStart) : 'not started'}
                  tone={delayed && operation.actualStart ? 'warning' : undefined}
                />
                <Field
                  label="Actual end"
                  value={operation.actualEnd ? iso(operation.actualEnd) : '—'}
                />
              </dl>

              {operation.description ? (
                <p className="text-ink-muted border-line mt-4 border-t pt-3 text-xs">
                  {operation.description}
                </p>
              ) : null}
              {operation.notes ? (
                <p className="text-ink-faint mt-2 text-xs">{operation.notes}</p>
              ) : null}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="History"
              description={
                operation.eventsTotal > operation.events.length
                  ? `Showing the most recent ${operation.events.length} of ${operation.eventsTotal} events`
                  : `${operation.eventsTotal} event${operation.eventsTotal === 1 ? '' : 's'}`
              }
            />
            <PanelBody className="p-0">
              {operation.events.length === 0 ? (
                <EmptyState title="No events recorded" />
              ) : (
                <ol className="divide-line divide-y">
                  {operation.events.map((event) => (
                    <li key={event.id} className="flex gap-3 px-4 py-2.5">
                      <span className="text-ink-faint numeric w-16 shrink-0 text-[11px]">
                        <TimeAgo value={event.occurredAt} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-ink text-xs">
                          {event.fromStatus && event.toStatus
                            ? `${label(event.fromStatus)} → ${label(event.toStatus)}`
                            : event.type.replaceAll('_', ' ').toLowerCase()}
                        </p>
                        {event.message ? (
                          <p className="text-ink-faint mt-0.5 text-[11px]">{event.message}</p>
                        ) : null}
                      </div>
                      <span className="text-ink-faint numeric ml-auto shrink-0 text-[10px]">
                        {iso(event.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Weather window"
              description={weather ? `At ${weather.conditions.locationName}` : undefined}
            />
            <PanelBody>
              {weather ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <WindowBadge status={weather.verdict.status} />
                    <span className="text-ink-faint text-[11px]">
                      <TimeAgo value={weather.conditions.observedAt} />
                    </span>
                  </div>

                  <VerdictReasons verdict={weather.verdict} />

                  {weather.changesAt ? (
                    <p className="text-ink-muted border-line numeric border-t pt-2 text-[11px]">
                      Changes to {weather.changesAt.status.toLowerCase()} at{' '}
                      {weather.changesAt.at.toISOString().slice(11, 16)}Z
                    </p>
                  ) : null}
                </div>
              ) : (
                // Reported as missing, never as Favorable: "no data" and "safe to
                // work" are different answers.
                <p className="text-ink-faint text-xs">
                  {operation.location
                    ? 'No conditions stored for this location yet — refresh on the Weather page.'
                    : 'This operation has no location, so no window can be evaluated.'}
                </p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Move status" />
            <PanelBody>
              <OperationStatusActions
                operationId={operation.id}
                status={operation.status}
                nextStatuses={operation.nextStatuses}
                canTransition={can(ctx, 'operation:transition')}
                canCancel={can(ctx, 'operation:cancel')}
              />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Assignment" />
            <PanelBody>
              <dl className="space-y-2">
                <Field
                  label="Vessel"
                  value={operation.vessel?.name ?? 'unassigned'}
                  href={operation.vessel ? `/fleet/${operation.vessel.id}` : undefined}
                />
                <Field label="Location" value={operation.location?.name ?? '—'} />
                <Field label="Basin" value={operation.location?.basin ?? '—'} />
                <Field label="Created" value={iso(operation.createdAt)} />
              </dl>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function iso(value: Date): string {
  return `${value.toISOString().slice(0, 16).replace('T', ' ')}Z`
}

function Field({
  label: fieldLabel,
  value,
  tone,
  href,
}: {
  label: string
  value: string
  tone?: 'warning'
  href?: string
}) {
  return (
    <div>
      <dt className="text-ink-faint text-[11px]">{fieldLabel}</dt>
      <dd className={cn('numeric text-sm', tone === 'warning' ? 'text-warning' : 'text-ink')}>
        {href ? (
          <Link href={href} className="hover:text-accent hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
