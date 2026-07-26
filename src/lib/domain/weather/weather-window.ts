import type { OperationType } from '@prisma/client'

/**
 * The operational weather window.
 *
 * This is the judgement the product exists to make: given the conditions and the
 * kind of work, is it Favorable, Marginal or Unsafe? It is a pure function with
 * injected limits — no clock, no I/O — because the same inputs must give the same
 * answer next month, and because someone will eventually have to justify a
 * stand-down decision by pointing at the rule that produced it.
 *
 * The verdict always carries the metrics that caused it. A bare "Unsafe" is a
 * number an operations room overrides once and then stops reading.
 */

/** Metrics the evaluation understands. Null means "not measured", never "zero". */
export type WeatherMetrics = {
  windSpeedKn: number | null
  windGustKn: number | null
  waveHeightM: number | null
  visibilityNm: number | null
}

export type WeatherMetricKey = keyof WeatherMetrics

export type WindowStatus = 'FAVORABLE' | 'MARGINAL' | 'UNSAFE'

export type Threshold = {
  marginal: number
  unsafe: number
}

export type OperationLimits = Record<WeatherMetricKey, Threshold>

export type WeatherLimitOverrides = Partial<
  Record<OperationType, Partial<Record<WeatherMetricKey, Threshold>>>
>

export type WeatherBreach = {
  metric: WeatherMetricKey
  value: number
  limit: number
  level: 'MARGINAL' | 'UNSAFE'
}

export type WeatherVerdict = {
  status: WindowStatus
  breaches: WeatherBreach[]
  evaluatedAt: Date
  /** True when a metric was unavailable, so the caller can say so rather than imply certainty. */
  degraded: boolean
  missing: WeatherMetricKey[]
}

/**
 * Which direction is worse for each metric. Visibility is the odd one out: less of
 * it is worse, and getting that backwards would call thick fog favourable.
 */
const WORSE_WHEN: Record<WeatherMetricKey, 'higher' | 'lower'> = {
  windSpeedKn: 'higher',
  windGustKn: 'higher',
  waveHeightM: 'higher',
  visibilityNm: 'lower',
}

/**
 * Defaults, in knots, metres of significant wave height, and nautical miles.
 *
 * **These are plausible values for a demonstration, not figures from any vessel's
 * operations manual.** A real deployment overrides them per organization and per
 * vessel; the shape of the table is the product, the numbers are a starting point.
 * They are ordered by how much motion the work tolerates: divers in the water sit
 * at one end, a tug on a wire at the other.
 */
export const DEFAULT_WEATHER_LIMITS: Record<OperationType, OperationLimits> = {
  DIVING_OPERATION: {
    windSpeedKn: { marginal: 15, unsafe: 20 },
    windGustKn: { marginal: 20, unsafe: 25 },
    waveHeightM: { marginal: 1.0, unsafe: 1.5 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  ROV_INSPECTION: {
    windSpeedKn: { marginal: 20, unsafe: 25 },
    windGustKn: { marginal: 25, unsafe: 30 },
    waveHeightM: { marginal: 1.5, unsafe: 2.5 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  SUBSEA_INSPECTION: {
    windSpeedKn: { marginal: 20, unsafe: 25 },
    windGustKn: { marginal: 25, unsafe: 30 },
    waveHeightM: { marginal: 1.5, unsafe: 2.5 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  // Launching and recovering a drone from a moving deck is limited by gusts more
  // than by sea state, and needs the pilot to keep it in sight.
  RPAS_INSPECTION: {
    windSpeedKn: { marginal: 18, unsafe: 22 },
    windGustKn: { marginal: 22, unsafe: 27 },
    waveHeightM: { marginal: 2.0, unsafe: 3.0 },
    visibilityNm: { marginal: 3, unsafe: 2 },
  },
  CREW_TRANSFER: {
    windSpeedKn: { marginal: 20, unsafe: 25 },
    windGustKn: { marginal: 25, unsafe: 30 },
    waveHeightM: { marginal: 1.5, unsafe: 2.0 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  CARGO_OPERATION: {
    windSpeedKn: { marginal: 22, unsafe: 28 },
    windGustKn: { marginal: 28, unsafe: 33 },
    waveHeightM: { marginal: 2.0, unsafe: 3.0 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  SUPPLY_OPERATION: {
    windSpeedKn: { marginal: 22, unsafe: 28 },
    windGustKn: { marginal: 28, unsafe: 33 },
    waveHeightM: { marginal: 2.0, unsafe: 3.0 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  ANCHOR_HANDLING: {
    windSpeedKn: { marginal: 25, unsafe: 30 },
    windGustKn: { marginal: 30, unsafe: 35 },
    waveHeightM: { marginal: 2.5, unsafe: 3.5 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  SURVEY: {
    windSpeedKn: { marginal: 25, unsafe: 30 },
    windGustKn: { marginal: 30, unsafe: 35 },
    waveHeightM: { marginal: 2.5, unsafe: 3.5 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
  MAINTENANCE: {
    windSpeedKn: { marginal: 25, unsafe: 30 },
    windGustKn: { marginal: 30, unsafe: 35 },
    waveHeightM: { marginal: 2.5, unsafe: 3.5 },
    visibilityNm: { marginal: 2, unsafe: 1 },
  },
}

const METRIC_KEYS = Object.keys(WORSE_WHEN) as WeatherMetricKey[]

export const METRIC_LABELS: Record<WeatherMetricKey, string> = {
  windSpeedKn: 'Wind',
  windGustKn: 'Gusts',
  waveHeightM: 'Wave height',
  visibilityNm: 'Visibility',
}

export const METRIC_UNITS: Record<WeatherMetricKey, string> = {
  windSpeedKn: 'kn',
  windGustKn: 'kn',
  waveHeightM: 'm',
  visibilityNm: 'NM',
}

export function limitsFor(
  type: OperationType,
  overrides?: WeatherLimitOverrides,
): OperationLimits {
  const base = DEFAULT_WEATHER_LIMITS[type]
  const override = overrides?.[type]

  // Merged per metric, so a partial override does not wipe the rest of the table.
  if (!override) return base

  return METRIC_KEYS.reduce<OperationLimits>(
    (limits, metric) => ({ ...limits, [metric]: override[metric] ?? base[metric] }),
    base,
  )
}

/**
 * A limit is reached *at* its value, not past it: a published 20-knot limit means
 * 20 knots is already the marginal case. That is how a vessel's operating manual
 * reads, and rounding it the other way is how a stand-down becomes an argument.
 */
function breachFor(
  metric: WeatherMetricKey,
  value: number,
  threshold: Threshold,
): WeatherBreach | null {
  const worseWhenHigher = WORSE_WHEN[metric] === 'higher'

  const atUnsafe = worseWhenHigher ? value >= threshold.unsafe : value <= threshold.unsafe
  if (atUnsafe) return { metric, value, limit: threshold.unsafe, level: 'UNSAFE' }

  const atMarginal = worseWhenHigher ? value >= threshold.marginal : value <= threshold.marginal
  if (atMarginal) return { metric, value, limit: threshold.marginal, level: 'MARGINAL' }

  return null
}

export function evaluateWeatherWindow(
  type: OperationType,
  metrics: WeatherMetrics,
  evaluatedAt: Date,
  overrides?: WeatherLimitOverrides,
): WeatherVerdict {
  const limits = limitsFor(type, overrides)

  const breaches: WeatherBreach[] = []
  const missing: WeatherMetricKey[] = []

  for (const metric of METRIC_KEYS) {
    const value = metrics[metric]

    if (value === null || !Number.isFinite(value)) {
      // Absent is not zero. Treating a missing wave height as flat water is the
      // most dangerous rounding this product could do.
      missing.push(metric)
      continue
    }

    const breach = breachFor(metric, value, limits[metric])
    if (breach) breaches.push(breach)
  }

  // The worst single metric decides. Averaging would let a dangerous sea state
  // hide behind a light breeze.
  const status: WindowStatus = breaches.some((breach) => breach.level === 'UNSAFE')
    ? 'UNSAFE'
    : breaches.length > 0
      ? 'MARGINAL'
      : 'FAVORABLE'

  return { status, breaches, evaluatedAt, degraded: missing.length > 0, missing }
}

/** Formats a verdict for an operator: what is wrong, and against which limit. */
export function describeVerdict(verdict: WeatherVerdict): string {
  if (verdict.breaches.length === 0) {
    return verdict.degraded
      ? `Within limits on what is measured — no data for ${verdict.missing
          .map((metric) => METRIC_LABELS[metric].toLowerCase())
          .join(', ')}.`
      : 'All metrics within limits.'
  }

  return verdict.breaches
    .map(
      (breach) =>
        `${METRIC_LABELS[breach.metric]} ${breach.value}${METRIC_UNITS[breach.metric]} against a ${
          breach.level === 'UNSAFE' ? 'limit' : 'marginal limit'
        } of ${breach.limit}${METRIC_UNITS[breach.metric]}`,
    )
    .join('; ')
}
