'use client'

import { AlertSeverity, AlertStatus, AlertType } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

import { Badge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/states'
import { TimeAgo } from '@/components/shared/time-ago'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import {
  evaluateAlertsAction,
  transitionAlert,
} from '@/features/alerts/actions/alert-actions'
import type { AlertListItem } from '@/features/alerts/queries/list-alerts'
import { LABELS } from '@/lib/domain/alert/lifecycle'
import { cn } from '@/lib/utils'

/**
 * The Alert Center.
 *
 * Two controls per alert, and the split between them is the module's whole point:
 * **Acknowledge** is any operator taking ownership so the alert stops being
 * unowned; **Resolve** is a supervisor declaring the condition over. The buttons
 * are shown according to the caller's permissions, and the server checks again.
 */

const SEVERITY_TONE: Record<AlertSeverity, 'neutral' | 'normal' | 'attention' | 'warning' | 'critical'> = {
  INFO: 'neutral',
  LOW: 'normal',
  MEDIUM: 'attention',
  HIGH: 'warning',
  CRITICAL: 'critical',
}

const STATUS_TONE: Record<AlertStatus, 'critical' | 'attention' | 'normal'> = {
  UNREAD: 'critical',
  ACKNOWLEDGED: 'attention',
  RESOLVED: 'normal',
}

export function AlertsView({
  alerts,
  canAcknowledge,
  canResolve,
  canEvaluate,
}: {
  alerts: AlertListItem[]
  canAcknowledge: boolean
  canResolve: boolean
  canEvaluate: boolean
}) {
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'OPEN'>('OPEN')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'ALL'>('ALL')
  const [typeFilter, setTypeFilter] = useState<AlertType | 'ALL'>('ALL')
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const visible = alerts.filter((alert) => {
    if (statusFilter === 'OPEN' ? alert.status === 'RESOLVED' : alert.status !== statusFilter) {
      return false
    }
    if (severityFilter !== 'ALL' && alert.severity !== severityFilter) return false
    if (typeFilter !== 'ALL' && alert.type !== typeFilter) return false
    return true
  })

  const unread = alerts.filter((alert) => alert.status === 'UNREAD').length
  const critical = alerts.filter(
    (alert) => alert.severity === 'CRITICAL' && alert.status !== 'RESOLVED',
  ).length

  function move(alertId: string, to: AlertStatus) {
    setBusyId(alertId)
    setMessage(null)

    startTransition(async () => {
      const result = await transitionAlert({ id: alertId, to })
      setBusyId(null)
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      router.refresh()
    })
  }

  function onEvaluate() {
    setMessage(null)
    startTransition(async () => {
      const result = await evaluateAlertsAction()
      setMessage(
        result.ok
          ? `${result.data.raised} raised, ${result.data.updated} updated, ${result.data.autoResolved} auto-resolved.`
          : result.error,
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-semibold tracking-tight">Alert Center</h1>
          <p className="text-ink-muted mt-1 text-sm">What requires action?</p>
        </div>

        {canEvaluate ? (
          <Button variant="secondary" size="sm" onClick={onEvaluate} disabled={isPending}>
            <RefreshCw className={isPending ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden />
            {isPending ? 'Evaluating' : 'Re-evaluate rules'}
          </Button>
        ) : null}
      </div>

      {message ? <p className="text-ink-faint text-xs">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Unread" value={unread} tone={unread > 0 ? 'critical' : undefined} />
        <Metric label="Critical open" value={critical} tone={critical > 0 ? 'critical' : undefined} />
        <Metric label="Total" value={alerts.length} />
      </div>

      <Panel>
        <PanelHeader
          title="Alerts"
          description={`${visible.length} shown`}
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                label="Status"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as AlertStatus | 'OPEN')}
                options={[
                  { value: 'OPEN', label: 'Open' },
                  ...Object.values(AlertStatus).map((status) => ({
                    value: status,
                    label: LABELS[status],
                  })),
                ]}
              />
              <Select
                label="Severity"
                value={severityFilter}
                onChange={(value) => setSeverityFilter(value as AlertSeverity | 'ALL')}
                options={[
                  { value: 'ALL', label: 'Any' },
                  ...Object.values(AlertSeverity).map((severity) => ({
                    value: severity,
                    label: severity.toLowerCase(),
                  })),
                ]}
              />
              <Select
                label="Type"
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as AlertType | 'ALL')}
                options={[
                  { value: 'ALL', label: 'Any' },
                  ...Object.values(AlertType).map((type) => ({
                    value: type,
                    label: type.toLowerCase(),
                  })),
                ]}
              />
            </div>
          }
        />
        <PanelBody className="p-0">
          {visible.length === 0 ? (
            <EmptyState
              title="Nothing matching"
              description="No alert matches the current filters."
            />
          ) : (
            <ul className="divide-line divide-y">
              {visible.map((alert) => (
                <li key={alert.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="numeric text-ink-faint text-[11px]">{alert.code}</span>
                      <Badge tone={SEVERITY_TONE[alert.severity]}>
                        {alert.severity.toLowerCase()}
                      </Badge>
                      <Badge tone={STATUS_TONE[alert.status]}>{LABELS[alert.status]}</Badge>
                      <span className="text-ink-faint text-[11px]">{alert.type.toLowerCase()}</span>
                    </div>

                    <p className="text-ink mt-1 text-xs font-medium">{alert.title}</p>
                    <p className="text-ink-muted mt-0.5 text-[11px]">{alert.description}</p>

                    <p className="text-ink-faint mt-1 text-[10px]">
                      raised <TimeAgo value={alert.createdAt} />
                      {alert.acknowledgedAt ? (
                        <>
                          {' · acknowledged '}
                          <TimeAgo value={alert.acknowledgedAt} />
                        </>
                      ) : null}
                      {alert.operation ? ` · ${alert.operation.code}` : ''}
                      {alert.vessel ? ` · ${alert.vessel.name}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {alert.status !== 'RESOLVED' && canAcknowledge && alert.status === 'UNREAD' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isPending && busyId === alert.id}
                        onClick={() => move(alert.id, AlertStatus.ACKNOWLEDGED)}
                      >
                        Acknowledge
                      </Button>
                    ) : null}

                    {alert.status !== 'RESOLVED' && canResolve ? (
                      <Button
                        size="sm"
                        disabled={isPending && busyId === alert.id}
                        onClick={() => move(alert.id, AlertStatus.RESOLVED)}
                      >
                        Resolve
                      </Button>
                    ) : null}

                    {alert.status === 'RESOLVED' && canAcknowledge ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending && busyId === alert.id}
                        onClick={() => move(alert.id, AlertStatus.UNREAD)}
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
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
  tone?: 'critical'
}) {
  return (
    <Panel>
      <PanelBody className="py-3">
        <p className="text-ink-faint text-[11px] tracking-wide uppercase">{label}</p>
        <p className={cn('numeric mt-1 text-2xl font-semibold', tone ? 'text-critical' : 'text-ink')}>
          {value}
        </p>
      </PanelBody>
    </Panel>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px]">
      <span className="text-ink-faint">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-line bg-surface text-ink focus:border-accent rounded border px-1.5 py-1 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
