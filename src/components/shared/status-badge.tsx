import type { VesselStatus } from '@prisma/client'

import { cn } from '@/lib/utils'

/**
 * Operational status, in the product's four-colour vocabulary. The same palette
 * carries readiness bands and alert severities later, so a colour means the same
 * thing on every screen — which is the point of having tokens at all.
 */

type Tone = 'normal' | 'attention' | 'warning' | 'critical' | 'neutral' | 'accent'

const TONE_CLASS: Record<Tone, string> = {
  normal: 'bg-normal-soft text-normal',
  attention: 'bg-attention-soft text-attention',
  warning: 'bg-warning-soft text-warning',
  critical: 'bg-critical-soft text-critical',
  accent: 'bg-accent-soft text-accent',
  neutral: 'border border-line text-ink-muted',
}

const VESSEL_STATUS: Record<VesselStatus, { label: string; tone: Tone }> = {
  IN_OPERATION: { label: 'In operation', tone: 'accent' },
  IN_TRANSIT: { label: 'In transit', tone: 'normal' },
  STANDBY: { label: 'Standby', tone: 'normal' },
  AT_PORT: { label: 'At port', tone: 'neutral' },
  AVAILABLE: { label: 'Available', tone: 'normal' },
  MAINTENANCE: { label: 'Maintenance', tone: 'attention' },
  UNAVAILABLE: { label: 'Unavailable', tone: 'critical' },
}

export function statusTone(status: VesselStatus): Tone {
  return VESSEL_STATUS[status].tone
}

/** Hex values for the map, which draws SVG rather than using Tailwind classes. */
export const TONE_COLOR: Record<Tone, string> = {
  normal: '#10b981',
  attention: '#fbbf24',
  warning: '#fb923c',
  critical: '#f43f5e',
  accent: '#22d3ee',
  neutral: '#93a9c2',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function VesselStatusBadge({ status }: { status: VesselStatus }) {
  const { label, tone } = VESSEL_STATUS[status]
  return <Badge tone={tone}>{label}</Badge>
}

/**
 * Where a value came from. Never optional next to a position: presenting a
 * simulated fix as an AIS truth is the one mistake this domain does not forgive.
 */
export function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null

  const tone: Tone = source === 'REAL' ? 'normal' : 'attention'
  return <Badge tone={tone}>{source === 'REAL' ? 'AIS' : 'Simulated'}</Badge>
}
