import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { SourceBadge, VesselStatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/states'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { VesselStatusControl } from '@/features/fleet/components/vessel-status-control'
import { getVessel } from '@/features/fleet/queries/get-vessel'
import {
  DelayBadge,
  OperationStatusBadge,
} from '@/features/operations/components/operation-badges'
import {
  listVesselOperations,
  type OperationListItem,
} from '@/features/operations/queries/list-operations'
import { can } from '@/lib/auth/authorize'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { cn } from '@/lib/utils'

/**
 * Tabs are search params rather than client state: they survive a reload, they
 * can be linked to a colleague, and the page needs no JavaScript to change tab.
 *
 * Only Overview and History hold data in this phase. The rest name the phase that
 * fills them instead of rendering an empty shell that looks broken.
 */
const TABS = [
  { id: 'overview', label: 'Overview', phase: null },
  { id: 'operations', label: 'Operations', phase: null },
  { id: 'assets', label: 'Assets', phase: 6 },
  { id: 'alerts', label: 'Alerts', phase: 5 },
  { id: 'incidents', label: 'Incidents', phase: 7 },
  { id: 'weather', label: 'Weather', phase: 4 },
  { id: 'history', label: 'History', phase: null },
  { id: 'documents', label: 'Documents', phase: 10 },
] as const

type TabId = (typeof TABS)[number]['id']

export const metadata: Metadata = { title: 'Vessel' }

export default async function VesselDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ vesselId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const ctx = await requireTenantContext()
  const { vesselId } = await params
  const { tab } = await searchParams

  const vessel = await getVessel(ctx, vesselId)

  // Null covers both "does not exist" and "belongs to another organization".
  // Both are a 404, deliberately: a 403 would confirm the record exists.
  if (!vessel) notFound()

  const active: TabId = TABS.some((entry) => entry.id === tab) ? (tab as TabId) : 'overview'

  // Only fetched for the tab that shows it: an unrelated tab should not pay for
  // a query nobody is going to read.
  const operations = active === 'operations' ? await listVesselOperations(ctx, vessel.id) : []

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/fleet"
          className="text-ink-faint hover:text-ink inline-flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Fleet
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-ink text-xl font-semibold tracking-tight">{vessel.name}</h1>
          <VesselStatusBadge status={vessel.status} />
          <SourceBadge source={vessel.positionSource} />
        </div>
        <p className="text-ink-muted mt-1 text-sm">
          {vessel.type} · {vessel.flag}
          {vessel.operator ? ` · ${vessel.operator}` : ''}
        </p>
      </div>

      <nav aria-label="Vessel sections" className="border-line flex gap-1 overflow-x-auto border-b">
        {TABS.map((entry) => {
          const isActive = entry.id === active
          return (
            <Link
              key={entry.id}
              href={`/fleet/${vessel.id}?tab=${entry.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-t px-3 py-2 text-xs whitespace-nowrap transition-colors',
                isActive
                  ? 'text-accent border-accent border-b-2'
                  : 'text-ink-faint hover:text-ink-muted',
              )}
            >
              {entry.label}
              {entry.phase ? (
                <span className="numeric border-line ml-1.5 rounded border px-1 text-[10px]">
                  P{entry.phase}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {active === 'overview' ? <Overview vessel={vessel} canUpdateStatus={can(ctx, 'vessel:status_update')} /> : null}
      {active === 'operations' ? <Operations operations={operations} /> : null}
      {active === 'history' ? <History vessel={vessel} /> : null}
      {active !== 'overview' && active !== 'history' && active !== 'operations' ? (
        <Panel>
          <EmptyState
            title={`${TABS.find((entry) => entry.id === active)!.label} is not built yet`}
            description={`This tab is delivered in phase ${TABS.find((entry) => entry.id === active)!.phase}. It is listed here so the vessel's full picture is visible, not to imply it exists.`}
          />
        </Panel>
      ) : null}
    </div>
  )
}

type VesselData = NonNullable<Awaited<ReturnType<typeof getVessel>>>

function Overview({
  vessel,
  canUpdateStatus,
}: {
  vessel: VesselData
  canUpdateStatus: boolean
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel className="lg:col-span-2">
        <PanelHeader title="Current position" />
        <PanelBody>
          {vessel.position ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Latitude" value={vessel.position.latitude.toFixed(5)} numeric />
              <Field label="Longitude" value={vessel.position.longitude.toFixed(5)} numeric />
              <Field label="Speed over ground" value={`${vessel.speedKn ?? 0} kn`} numeric />
              <Field label="Heading" value={`${vessel.headingDeg ?? 0}°`} numeric />
              <Field label="Destination" value={vessel.destination ?? '—'} />
              <Field
                label="Last fix"
                value={vessel.lastPositionAt ? vessel.lastPositionAt.toISOString() : 'never'}
                numeric
              />
            </dl>
          ) : (
            <EmptyState
              title="No position reported"
              description="This vessel has never reported a fix, or it is excluded from AIS tracking."
            />
          )}
        </PanelBody>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Particulars" />
          <PanelBody>
            <dl className="space-y-2">
              <Field label="IMO" value={vessel.imo ?? '—'} numeric />
              <Field label="MMSI" value={vessel.mmsi ?? '—'} numeric />
              <Field label="Callsign" value={vessel.callsign ?? '—'} numeric />
              <Field
                label="Length overall"
                value={vessel.lengthM ? `${vessel.lengthM} m` : '—'}
                numeric
              />
              <Field label="Beam" value={vessel.beamM ? `${vessel.beamM} m` : '—'} numeric />
              <Field label="Draft" value={vessel.draftM ? `${vessel.draftM} m` : '—'} numeric />
            </dl>
          </PanelBody>
        </Panel>

        {canUpdateStatus ? (
          <Panel>
            <PanelHeader title="Report status" />
            <PanelBody>
              <VesselStatusControl vesselId={vessel.id} status={vessel.status} />
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

function Operations({ operations }: { operations: OperationListItem[] }) {
  return (
    <Panel>
      <PanelHeader
        title="Operations"
        description={`${operations.length} most recent, newest planned first`}
      />
      <PanelBody className="p-0">
        {operations.length === 0 ? (
          <EmptyState
            title="No operations for this vessel"
            description="Operations assigned to this vessel appear here."
          />
        ) : (
          <ul className="divide-line divide-y">
            {operations.map((operation) => (
              <li key={operation.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link
                  href={`/operations/${operation.id}`}
                  className="text-accent numeric shrink-0 text-xs hover:underline"
                >
                  {operation.code}
                </Link>
                <div className="min-w-0">
                  <p className="text-ink truncate text-xs">{operation.name}</p>
                  <p className="text-ink-faint numeric text-[11px]">
                    {operation.plannedStart.toISOString().slice(0, 16).replace('T', ' ')}Z →{' '}
                    {operation.plannedEnd.toISOString().slice(0, 16).replace('T', ' ')}Z
                  </p>
                </div>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <DelayBadge isDelayed={operation.isDelayed} />
                  <OperationStatusBadge status={operation.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  )
}

function History({ vessel }: { vessel: VesselData }) {
  return (
    <Panel>
      <PanelHeader
        title="Position history"
        description={
          vessel.trackTotal > vessel.track.length
            ? `Showing the most recent ${vessel.track.length} of ${vessel.trackTotal} fixes`
            : `${vessel.trackTotal} fixes recorded`
        }
      />
      <PanelBody className="p-0">
        {vessel.track.length === 0 ? (
          <EmptyState
            title="No fixes recorded"
            description="Positions are stored when the vessel moves more than 50 m, or every 15 minutes while it sits still."
          />
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-raised text-ink-faint border-line sticky top-0 border-b">
                <tr>
                  <th className="px-4 py-2 font-medium">Recorded</th>
                  <th className="px-4 py-2 font-medium">Latitude</th>
                  <th className="px-4 py-2 font-medium">Longitude</th>
                  <th className="px-4 py-2 font-medium">Speed</th>
                  <th className="px-4 py-2 font-medium">Heading</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-line text-ink-muted divide-y">
                {[...vessel.track].reverse().map((fix) => (
                  <tr key={`${fix.recordedAt.toISOString()}-${fix.latitude}`}>
                    <td className="numeric px-4 py-1.5">{fix.recordedAt.toISOString()}</td>
                    <td className="numeric px-4 py-1.5">{fix.latitude.toFixed(5)}</td>
                    <td className="numeric px-4 py-1.5">{fix.longitude.toFixed(5)}</td>
                    <td className="numeric px-4 py-1.5">{fix.speedKn ?? 0} kn</td>
                    <td className="numeric px-4 py-1.5">{fix.headingDeg ?? 0}°</td>
                    <td className="px-4 py-1.5">
                      <SourceBadge source={fix.source} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}

function Field({
  label,
  value,
  numeric = false,
}: {
  label: string
  value: string
  numeric?: boolean
}) {
  return (
    <div>
      <dt className="text-ink-faint text-[11px]">{label}</dt>
      <dd className={cn('text-ink text-sm', numeric && 'numeric')}>{value}</dd>
    </div>
  )
}
