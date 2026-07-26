import { Badge } from '@/components/shared/status-badge'
import {
  METRIC_LABELS,
  METRIC_UNITS,
  type WeatherVerdict,
  type WindowStatus,
} from '@/lib/domain/weather/weather-window'

/**
 * The verdict, and immediately next to it the reason.
 *
 * These are never separated in this product: a bare "Unsafe" is a number an
 * operations room overrides once and then stops reading, while "Unsafe — wave
 * height 2.9 m against a limit of 2.5 m" is a decision someone can act on or
 * argue with.
 */

const TONE: Record<WindowStatus, 'normal' | 'attention' | 'critical'> = {
  FAVORABLE: 'normal',
  MARGINAL: 'attention',
  UNSAFE: 'critical',
}

const LABEL: Record<WindowStatus, string> = {
  FAVORABLE: 'Favorable',
  MARGINAL: 'Marginal',
  UNSAFE: 'Unsafe',
}

export function WindowBadge({ status }: { status: WindowStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
}

export function VerdictReasons({ verdict }: { verdict: WeatherVerdict }) {
  if (verdict.breaches.length === 0) {
    return (
      <p className="text-ink-faint text-[11px]">
        {verdict.degraded
          ? `Within limits on what is measured — no data for ${verdict.missing
              .map((metric) => METRIC_LABELS[metric].toLowerCase())
              .join(', ')}.`
          : 'All metrics within limits.'}
      </p>
    )
  }

  return (
    <ul className="space-y-0.5">
      {verdict.breaches.map((breach) => (
        <li key={breach.metric} className="text-[11px]">
          <span className={breach.level === 'UNSAFE' ? 'text-critical' : 'text-attention'}>
            {METRIC_LABELS[breach.metric]}
          </span>{' '}
          <span className="numeric text-ink">
            {breach.value}
            {METRIC_UNITS[breach.metric]}
          </span>{' '}
          <span className="text-ink-faint">
            against {breach.level === 'UNSAFE' ? 'limit' : 'marginal'} {breach.limit}
            {METRIC_UNITS[breach.metric]}
          </span>
        </li>
      ))}
      {verdict.degraded ? (
        <li className="text-ink-faint text-[11px]">
          No data for {verdict.missing.map((metric) => METRIC_LABELS[metric].toLowerCase()).join(', ')}.
        </li>
      ) : null}
    </ul>
  )
}
