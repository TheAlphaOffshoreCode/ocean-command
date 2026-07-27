import type { RiskLevel } from '@prisma/client'

import { DomainRuleError } from '@/lib/errors'

/**
 * The 5×5 risk matrix.
 *
 * Pure and configurable, like the weather window: the score is arithmetic, but
 * where the bands fall is an expression of an operator's risk appetite, and that
 * differs between companies. The numbers live in one place so nobody compares a
 * score against a literal at a call site.
 *
 * The score is always recomputed server-side. A form that posts its own score is
 * a form that can post 1 for a probability-5 impact-5 risk, and the database has
 * a CHECK constraint saying the two must agree.
 */

export const PROBABILITY_LABELS = [
  'Rare',
  'Unlikely',
  'Possible',
  'Likely',
  'Almost certain',
] as const

export const IMPACT_LABELS = [
  'Insignificant',
  'Minor',
  'Moderate',
  'Major',
  'Severe',
] as const

/** Upper bound of each band; anything above `high` is Critical. */
export type RiskBands = {
  low: number
  moderate: number
  high: number
}

export const DEFAULT_RISK_BANDS: RiskBands = { low: 4, moderate: 9, high: 16 }

export type ScoredRisk = {
  probability: number
  impact: number
  score: number
  level: RiskLevel
  probabilityLabel: string
  impactLabel: string
}

function assertAxis(value: number, axis: 'probability' | 'impact'): void {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new DomainRuleError(
      'risk.axis_out_of_range',
      `${axis === 'probability' ? 'Probability' : 'Impact'} must be a whole number from 1 to 5.`,
    )
  }
}

function assertBands(bands: RiskBands): void {
  if (!(bands.low < bands.moderate && bands.moderate < bands.high)) {
    throw new DomainRuleError(
      'risk.bands_not_ascending',
      'Risk bands must ascend: low < moderate < high.',
    )
  }
}

export function riskScore(probability: number, impact: number): number {
  assertAxis(probability, 'probability')
  assertAxis(impact, 'impact')

  return probability * impact
}

export function levelFor(score: number, bands: RiskBands = DEFAULT_RISK_BANDS): RiskLevel {
  assertBands(bands)

  if (score <= bands.low) return 'LOW'
  if (score <= bands.moderate) return 'MODERATE'
  if (score <= bands.high) return 'HIGH'
  return 'CRITICAL'
}

export function scoreRisk(
  probability: number,
  impact: number,
  bands: RiskBands = DEFAULT_RISK_BANDS,
): ScoredRisk {
  const score = riskScore(probability, impact)

  return {
    probability,
    impact,
    score,
    level: levelFor(score, bands),
    // The words a register is read out loud with. "4 × 5" means nothing in a
    // meeting; "Likely / Severe" does.
    probabilityLabel: PROBABILITY_LABELS[probability - 1]!,
    impactLabel: IMPACT_LABELS[impact - 1]!,
  }
}

const LEVEL_ORDER: Record<RiskLevel, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  CRITICAL: 3,
}

/** Lets a filter ask for "high and above" without hard-coding the order twice. */
export function isAtLeast(level: RiskLevel, minimum: RiskLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minimum]
}
