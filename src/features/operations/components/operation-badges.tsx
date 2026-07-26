import type { OperationStatus, Priority } from '@prisma/client'

import { Badge } from '@/components/shared/status-badge'
import { label } from '@/lib/domain/operation/transitions'

/**
 * Status and priority in the product's four-colour vocabulary, so a colour means
 * the same thing here as on the fleet chart and, later, on the alert panel.
 */

const STATUS_TONE: Record<
  OperationStatus,
  'normal' | 'attention' | 'warning' | 'critical' | 'neutral' | 'accent'
> = {
  PLANNED: 'neutral',
  PREPARING: 'neutral',
  READY: 'normal',
  IN_PROGRESS: 'accent',
  SUSPENDED: 'warning',
  COMPLETED: 'normal',
  CANCELLED: 'critical',
}

const PRIORITY_TONE: Record<Priority, 'neutral' | 'normal' | 'attention' | 'critical'> = {
  LOW: 'neutral',
  MEDIUM: 'normal',
  HIGH: 'attention',
  CRITICAL: 'critical',
}

export function OperationStatusBadge({ status }: { status: OperationStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{label(status)}</Badge>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  // Low priority does not need a colour shouting on every row.
  if (priority === 'LOW') return <span className="text-ink-faint text-[11px]">Low</span>

  return (
    <Badge tone={PRIORITY_TONE[priority]}>
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </Badge>
  )
}

/** Only shown when true: a "on time" badge on every row is noise. */
export function DelayBadge({ isDelayed }: { isDelayed: boolean }) {
  if (!isDelayed) return null
  return <Badge tone="warning">Delayed</Badge>
}
