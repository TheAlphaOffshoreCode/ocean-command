'use client'

import { OperationType } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

import { SourceBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/states'
import { TimeAgo, useNowBucket } from '@/components/shared/time-ago'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { refreshWeatherAction } from '@/features/weather/actions/refresh'
import type { ConditionsSnapshot, ForecastPoint } from '@/features/weather/queries/get-conditions'
import {
  evaluateWeatherWindow,
  limitsFor,
  METRIC_UNITS,
  type WeatherLimitOverrides,
} from '@/lib/domain/weather/weather-window'
import { cn } from '@/lib/utils'

import { ForecastChart } from './forecast-chart'
import { VerdictReasons, WindowBadge } from './window-badge'

/**
 * Environmental Intelligence.
 *
 * The operation type is a control, not a setting buried somewhere: the same sea is
 * favourable for anchor handling and unsafe for divers, so "can we work?" is only
 * answerable once you say what work. Changing the selector re-evaluates every
 * location and redraws the limit lines.
 */

export type LocationEntry = {
  locationId: string
  locationName: string
  conditions: ConditionsSnapshot | null
  forecast: ForecastPoint[]
}

const TYPE_LABELS: Record<OperationType, string> = {
  DIVING_OPERATION: 'Diving',
  ROV_INSPECTION: 'ROV inspection',
  SUBSEA_INSPECTION: 'Subsea inspection',
  RPAS_INSPECTION: 'RPAS inspection',
  CREW_TRANSFER: 'Crew transfer',
  CARGO_OPERATION: 'Cargo operation',
  SUPPLY_OPERATION: 'Supply operation',
  ANCHOR_HANDLING: 'Anchor handling',
  SURVEY: 'Survey',
  MAINTENANCE: 'Maintenance',
}

/** Older than this and the reading is labelled stale rather than presented as current. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000

export function WeatherView({
  locations,
  overrides,
  canRefresh,
}: {
  locations: LocationEntry[]
  overrides: WeatherLimitOverrides
  canRefresh: boolean
}) {
  const [type, setType] = useState<OperationType>(OperationType.CREW_TRANSFER)
  const [selectedId, setSelectedId] = useState<string | null>(locations[0]?.locationId ?? null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  // Not Date.now() during render: the server and the browser would disagree, which
  // is the hydration mismatch this project already fixed once.
  const now = useNowBucket()

  const limits = useMemo(() => limitsFor(type, overrides), [type, overrides])

  const evaluated = useMemo(
    () =>
      locations.map((entry) => ({
        ...entry,
        verdict: entry.conditions
          ? evaluateWeatherWindow(
              type,
              {
                windSpeedKn: entry.conditions.windSpeedKn,
                windGustKn: entry.conditions.windGustKn,
                waveHeightM: entry.conditions.waveHeightM,
                visibilityNm: entry.conditions.visibilityNm,
              },
              entry.conditions.observedAt,
              overrides,
            )
          : null,
      })),
    [locations, type, overrides],
  )

  const selected = evaluated.find((entry) => entry.locationId === selectedId) ?? evaluated[0]

  function onRefresh() {
    startTransition(async () => {
      const result = await refreshWeatherAction()
      setMessage(
        result.ok
          ? `${result.observations} observations and ${result.forecastPoints} forecast hours stored${
              result.failures > 0 ? `, ${result.failures} location(s) failed` : ''
            }.`
          : result.error,
      )
      router.refresh()
    })
  }

  const hasAnyData = locations.some((entry) => entry.conditions)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-semibold tracking-tight">
            Environmental Intelligence
          </h1>
          <p className="text-ink-muted mt-1 text-sm">Does the environment allow us to continue?</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="operation-type" className="text-ink-faint text-xs">
            Evaluate for
          </label>
          <select
            id="operation-type"
            value={type}
            onChange={(event) => setType(event.target.value as OperationType)}
            className="border-line bg-surface text-ink focus:border-accent rounded border px-2 py-1.5 text-xs focus:outline-none"
          >
            {Object.values(OperationType).map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </select>

          {canRefresh ? (
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={pending}>
              <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden />
              {pending ? 'Refreshing' : 'Refresh'}
            </Button>
          ) : null}
        </div>
      </div>

      {message ? <p className="text-ink-faint text-xs">{message}</p> : null}

      {!hasAnyData ? (
        <Panel>
          <EmptyState
            title="No conditions stored yet"
            description="Refresh to pull current conditions and a 48-hour forecast for each location."
          />
        </Panel>
      ) : (
        <>
          <Panel>
            <PanelHeader
              title="Operational weather window"
              description={`Evaluated for ${TYPE_LABELS[type].toLowerCase()} against configured limits`}
            />
            <PanelBody className="p-0">
              <ul className="divide-line divide-y">
                {evaluated.map((entry) => {
                  const stale =
                    now !== null &&
                    entry.conditions !== null &&
                    now - entry.conditions.observedAt.getTime() > STALE_AFTER_MS

                  return (
                    <li key={entry.locationId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.locationId)}
                        className={cn(
                          'hover:bg-surface-overlay flex w-full items-start gap-3 px-4 py-3 text-left',
                          entry.locationId === selected?.locationId && 'bg-surface-overlay',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-ink text-xs font-medium">{entry.locationName}</p>
                          {entry.conditions ? (
                            <p className="text-ink-faint numeric mt-0.5 text-[11px]">
                              {entry.conditions.windSpeedKn ?? '—'} kn ·{' '}
                              {entry.conditions.waveHeightM ?? '—'} m ·{' '}
                              {entry.conditions.visibilityNm ?? '—'} NM
                            </p>
                          ) : (
                            <p className="text-ink-faint mt-0.5 text-[11px]">No observation</p>
                          )}
                        </div>

                        <div className="w-64 shrink-0">
                          {entry.verdict ? <VerdictReasons verdict={entry.verdict} /> : null}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {entry.verdict ? <WindowBadge status={entry.verdict.status} /> : null}
                          {entry.conditions ? (
                            <span
                              className={cn(
                                'text-[10px]',
                                stale ? 'text-attention' : 'text-ink-faint',
                              )}
                            >
                              {/* Age is always visible: a stale reading presented as
                                  current is worse than no reading. */}
                              {stale ? 'stale · ' : ''}
                              <TimeAgo value={entry.conditions.observedAt} />
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </PanelBody>
          </Panel>

          {selected?.conditions ? (
            <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
              <Panel>
                <PanelHeader
                  title={`Forecast — ${selected.locationName}`}
                  description={`Next ${selected.forecast.length} hours, with ${TYPE_LABELS[
                    type
                  ].toLowerCase()} limits`}
                />
                <PanelBody>
                  {selected.forecast.length === 0 ? (
                    <EmptyState
                      title="No forecast stored"
                      description="Refresh to pull the forecast for this location."
                    />
                  ) : (
                    <ForecastChart
                      forecast={selected.forecast}
                      limits={{
                        windMarginal: limits.windSpeedKn.marginal,
                        windUnsafe: limits.windSpeedKn.unsafe,
                        waveMarginal: limits.waveHeightM.marginal,
                        waveUnsafe: limits.waveHeightM.unsafe,
                      }}
                    />
                  )}
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHeader title="Current conditions" />
                <PanelBody>
                  <dl className="space-y-1.5 text-xs">
                    <Row label="Wind" value={fmt(selected.conditions.windSpeedKn, 'windSpeedKn')} />
                    <Row label="Gusts" value={fmt(selected.conditions.windGustKn, 'windGustKn')} />
                    <Row
                      label="Direction"
                      value={
                        selected.conditions.windDirectionDeg === null
                          ? '—'
                          : `${selected.conditions.windDirectionDeg}°`
                      }
                    />
                    <Row label="Wave height" value={fmt(selected.conditions.waveHeightM, 'waveHeightM')} />
                    <Row
                      label="Wave period"
                      value={
                        selected.conditions.wavePeriodS === null
                          ? '—'
                          : `${selected.conditions.wavePeriodS} s`
                      }
                    />
                    <Row
                      label="Swell"
                      value={
                        selected.conditions.swellHeightM === null
                          ? '—'
                          : `${selected.conditions.swellHeightM} m`
                      }
                    />
                    <Row
                      label="Visibility"
                      value={fmt(selected.conditions.visibilityNm, 'visibilityNm')}
                    />
                    <Row
                      label="Pressure"
                      value={
                        selected.conditions.pressureHpa === null
                          ? '—'
                          : `${selected.conditions.pressureHpa} hPa`
                      }
                    />
                    <Row
                      label="Air / sea"
                      value={`${selected.conditions.airTempC ?? '—'} / ${
                        selected.conditions.seaTempC ?? '—'
                      } °C`}
                    />
                  </dl>

                  <div className="border-line mt-3 flex items-center justify-between border-t pt-3">
                    <SourceBadge source={selected.conditions.source} />
                    <span className="text-ink-faint text-[11px]">
                      {selected.conditions.provider}
                    </span>
                  </div>
                </PanelBody>
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function fmt(value: number | null, metric: keyof typeof METRIC_UNITS): string {
  return value === null ? '—' : `${value} ${METRIC_UNITS[metric]}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink numeric">{value}</dd>
    </div>
  )
}
