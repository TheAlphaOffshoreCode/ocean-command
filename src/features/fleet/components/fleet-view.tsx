'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ExternalLink, RefreshCw, Ship } from 'lucide-react'

import { SourceBadge, VesselStatusBadge } from '@/components/shared/status-badge'
import { EmptyState, LoadingState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { syncPositions } from '@/features/fleet/actions/vessel-actions'
import type { VesselListItem } from '@/features/fleet/queries/list-vessels'

/**
 * Leaflet touches `window` and is the heaviest bundle on the page, so it is
 * loaded on the client only and never during SSR.
 */
const FleetMap = dynamic(() => import('./fleet-map').then((module) => module.FleetMap), {
  ssr: false,
  loading: () => <LoadingState label="Loading chart" />,
})

function relativeTime(value: Date | null): string {
  if (!value) return 'never'

  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86_400)}d ago`
}

export function FleetView({
  vessels,
  canSync,
}: {
  vessels: VesselListItem[]
  canSync: boolean
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const selected = vessels.find((vessel) => vessel.id === selectedId) ?? null
  const withPosition = vessels.filter((vessel) => vessel.position).length

  function onSync() {
    startTransition(async () => {
      const result = await syncPositions()
      setMessage(
        result.ok
          ? `${result.data.fixesRecorded} of ${result.data.requested} tracked vessels recorded a new fix.`
          : result.error,
      )
      // The action revalidated the path; refresh pulls the new positions in.
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-semibold tracking-tight">Fleet Command</h1>
          <p className="text-ink-muted mt-1 text-sm">What is happening with my fleet?</p>
        </div>

        <div className="flex items-center gap-3">
          {message ? <p className="text-ink-faint max-w-xs text-xs">{message}</p> : null}
          {canSync ? (
            <Button variant="secondary" size="sm" onClick={onSync} disabled={pending}>
              <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden />
              {pending ? 'Syncing' : 'Sync AIS'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Fleet position"
            description={`${withPosition} of ${vessels.length} vessels reporting`}
          />
          <div className="h-[28rem]">
            {withPosition === 0 ? (
              <EmptyState
                title="No positions yet"
                description="Run an AIS sync to pull the current fleet position."
              />
            ) : (
              <FleetMap vessels={vessels} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={selected ? 'Vessel' : 'Selection'} />
          <PanelBody>
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-ink text-sm font-semibold">{selected.name}</p>
                    <p className="text-ink-faint text-xs">
                      {selected.type} · {selected.flag}
                    </p>
                  </div>
                  <VesselStatusBadge status={selected.status} />
                </div>

                <dl className="space-y-1.5 text-xs">
                  <Row label="Position">
                    {selected.position ? (
                      <span className="numeric">
                        {selected.position.latitude.toFixed(4)},{' '}
                        {selected.position.longitude.toFixed(4)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Row>
                  <Row label="Speed">
                    <span className="numeric">{selected.speedKn ?? 0} kn</span>
                  </Row>
                  <Row label="Heading">
                    <span className="numeric">{selected.headingDeg ?? 0}°</span>
                  </Row>
                  <Row label="Destination">{selected.destination ?? '—'}</Row>
                  <Row label="Updated">{relativeTime(selected.lastPositionAt)}</Row>
                  <Row label="Source">
                    <SourceBadge source={selected.positionSource} />
                  </Row>
                  <Row label="IMO">
                    <span className="numeric">{selected.imo ?? '—'}</span>
                  </Row>
                  <Row label="MMSI">
                    <span className="numeric">{selected.mmsi ?? '—'}</span>
                  </Row>
                </dl>

                <Link
                  href={`/fleet/${selected.id}`}
                  className="text-accent inline-flex items-center gap-1.5 text-xs hover:underline"
                >
                  Open vessel detail
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              </div>
            ) : (
              <EmptyState
                title="No vessel selected"
                description="Pick a vessel on the chart or in the list below."
              />
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Vessels" description={`${vessels.length} in the fleet`} />
        <PanelBody className="p-0">
          {vessels.length === 0 ? (
            <EmptyState title="No vessels" description="An administrator can add the first one." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-ink-faint border-line border-b">
                  <tr>
                    <Th>Vessel</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Speed</Th>
                    <Th>Destination</Th>
                    <Th>Updated</Th>
                    <Th>Source</Th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {vessels.map((vessel) => (
                    <tr
                      key={vessel.id}
                      onClick={() => setSelectedId(vessel.id)}
                      className={
                        vessel.id === selectedId
                          ? 'bg-surface-overlay cursor-pointer'
                          : 'hover:bg-surface-overlay cursor-pointer'
                      }
                    >
                      <Td>
                        <span className="text-ink flex items-center gap-2 font-medium">
                          <Ship className="text-ink-faint size-3.5" aria-hidden />
                          {vessel.name}
                        </span>
                      </Td>
                      <Td>{vessel.type}</Td>
                      <Td>
                        <VesselStatusBadge status={vessel.status} />
                      </Td>
                      <Td>
                        <span className="numeric">{vessel.speedKn ?? 0} kn</span>
                      </Td>
                      <Td>{vessel.destination ?? '—'}</Td>
                      <Td>{relativeTime(vessel.lastPositionAt)}</Td>
                      <Td>
                        <SourceBadge source={vessel.positionSource} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink text-right">{children}</dd>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="text-ink-muted px-4 py-2">{children}</td>
}
