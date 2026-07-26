import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/shared/states'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { ActivityFeed } from '@/features/operations/components/activity-feed'
import {
  DelayBadge,
  OperationStatusBadge,
  PriorityBadge,
} from '@/features/operations/components/operation-badges'
import { OperationsTimeline } from '@/features/operations/components/operations-timeline'
import { getActivityFeed } from '@/features/operations/queries/activity-feed'
import { listOperations } from '@/features/operations/queries/list-operations'
import { operationFiltersSchema } from '@/features/operations/schemas/operation'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { TERMINAL_STATUSES } from '@/lib/domain/operation/transitions'

export const metadata: Metadata = { title: 'Operations' }

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTenantContext()
  const params = await searchParams

  // Search params are untrusted input like any other: parsed, defaulted, and
  // capped (page size, sort column) before they reach a query.
  const filters = operationFiltersSchema.parse({
    search: params.search,
    status: params.status,
    type: params.type,
    vesselId: params.vesselId,
    openOnly: params.openOnly,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    direction: params.direction,
  })

  const [page, activity] = await Promise.all([
    listOperations(ctx, { ...filters, pageSize: 100 }),
    getActivityFeed(ctx, 12),
  ])

  const open = page.items.filter((operation) => !TERMINAL_STATUSES.includes(operation.status))
  const running = open.filter((operation) => operation.status === 'IN_PROGRESS')
  const delayed = open.filter((operation) => operation.isDelayed)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-ink text-xl font-semibold tracking-tight">Operations Center</h1>
        <p className="text-ink-muted mt-1 text-sm">What is happening with my operations?</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Under way" value={running.length} tone="accent" />
        <Metric label="Open" value={open.length} />
        {/* Delayed is the number a coordinator acts on, so it gets the warning tone
            when it is not zero and stays quiet when it is. */}
        <Metric label="Delayed" value={delayed.length} tone={delayed.length > 0 ? 'warning' : undefined} />
      </div>

      <Panel>
        <PanelHeader title="Schedule" description="Planned against actual, 7-day window" />
        <PanelBody className="px-0 pb-2">
          <OperationsTimeline operations={page.items} />
        </PanelBody>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Panel>
          <PanelHeader title="Operations" description={`${page.total} in total`} />
          <PanelBody className="p-0">
            {page.items.length === 0 ? (
              <EmptyState
                title="No operations"
                description="An operations manager can plan the first one."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-ink-faint border-line border-b">
                    <tr>
                      <Th>Code</Th>
                      <Th>Operation</Th>
                      <Th>Vessel</Th>
                      <Th>Status</Th>
                      <Th>Priority</Th>
                      <Th>Planned start</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-line divide-y">
                    {page.items.map((operation) => (
                      <tr key={operation.id} className="hover:bg-surface-overlay">
                        <Td>
                          <Link
                            href={`/operations/${operation.id}`}
                            className="text-accent numeric hover:underline"
                          >
                            {operation.code}
                          </Link>
                        </Td>
                        <Td>
                          <span className="text-ink flex items-center gap-2">
                            {operation.name}
                            <DelayBadge isDelayed={operation.isDelayed} />
                          </span>
                        </Td>
                        <Td>{operation.vessel?.name ?? '—'}</Td>
                        <Td>
                          <OperationStatusBadge status={operation.status} />
                        </Td>
                        <Td>
                          <PriorityBadge priority={operation.priority} />
                        </Td>
                        <Td>
                          <span className="numeric">
                            {operation.plannedStart.toISOString().slice(0, 16).replace('T', ' ')}Z
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Activity" description="Newest first" />
          <PanelBody className="p-0">
            <ActivityFeed entries={activity} />
          </PanelBody>
        </Panel>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'accent' | 'warning'
}) {
  const colour = tone === 'accent' ? 'text-accent' : tone === 'warning' ? 'text-warning' : 'text-ink'

  return (
    <Panel>
      <PanelBody className="py-3">
        <p className="text-ink-faint text-[11px] tracking-wide uppercase">{label}</p>
        <p className={`numeric mt-1 text-2xl font-semibold ${colour}`}>{value}</p>
      </PanelBody>
    </Panel>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="text-ink-muted px-4 py-2">{children}</td>
}
