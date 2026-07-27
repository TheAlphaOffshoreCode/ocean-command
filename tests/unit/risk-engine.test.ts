import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RISK_BANDS,
  IMPACT_LABELS,
  PROBABILITY_LABELS,
  levelFor,
  riskScore,
  scoreRisk,
  type RiskBands,
} from '@/lib/domain/risk/risk-engine'
import { DomainRuleError } from '@/lib/errors'

/**
 * Written before the implementation. The bands are the whole point of a risk
 * register — a matrix whose boundaries are off by one puts a High risk in the
 * Moderate pile, and nobody notices until the audit.
 *
 * Boundaries from ARCHITECTURE.md §5.1: 1–4 Low, 5–9 Moderate, 10–16 High,
 * 17–25 Critical. Each one is tested from both sides.
 */

describe('riskScore', () => {
  it('is probability times impact', () => {
    expect(riskScore(1, 1)).toBe(1)
    expect(riskScore(3, 4)).toBe(12)
    expect(riskScore(5, 5)).toBe(25)
  })

  it('refuses values outside 1..5', () => {
    // The database has CHECK constraints for the same thing. This is the layer
    // that gives the operator a message instead of a constraint violation.
    for (const [probability, impact] of [
      [0, 3],
      [6, 3],
      [3, 0],
      [3, 6],
      [-1, 1],
    ]) {
      expect(() => riskScore(probability!, impact!)).toThrow(DomainRuleError)
    }
  })

  it('refuses non-integers', () => {
    // A 2.5 probability is not a point on a 5x5 matrix.
    expect(() => riskScore(2.5, 3)).toThrow(DomainRuleError)
    expect(() => riskScore(3, Number.NaN)).toThrow(DomainRuleError)
  })
})

describe('band boundaries', () => {
  it('puts 1 to 4 in Low', () => {
    expect(levelFor(1)).toBe('LOW')
    expect(levelFor(4)).toBe('LOW')
  })

  it('starts Moderate at exactly 5', () => {
    expect(levelFor(4)).toBe('LOW')
    expect(levelFor(5)).toBe('MODERATE')
  })

  it('ends Moderate at exactly 9', () => {
    expect(levelFor(9)).toBe('MODERATE')
    expect(levelFor(10)).toBe('HIGH')
  })

  it('ends High at exactly 16', () => {
    expect(levelFor(16)).toBe('HIGH')
    expect(levelFor(17)).toBe('CRITICAL')
  })

  it('puts 17 to 25 in Critical', () => {
    expect(levelFor(17)).toBe('CRITICAL')
    expect(levelFor(25)).toBe('CRITICAL')
  })

  it('covers every reachable score with exactly one band', () => {
    // Every product of two values in 1..5, so no gap and no overlap can hide.
    for (let probability = 1; probability <= 5; probability += 1) {
      for (let impact = 1; impact <= 5; impact += 1) {
        const level = levelFor(riskScore(probability, impact))
        expect(level, `${probability}x${impact}`).toBeDefined()
      }
    }
  })
})

describe('scoreRisk', () => {
  it('returns the score, the band, and the words a register uses', () => {
    const scored = scoreRisk(4, 5)

    expect(scored.score).toBe(20)
    expect(scored.level).toBe('CRITICAL')
    // A register that says "4 x 5" and not "Likely / Severe" is a register nobody
    // reads out loud in a meeting.
    expect(scored.probabilityLabel).toBe('Likely')
    expect(scored.impactLabel).toBe('Severe')
  })

  it('uses the published wording for all five levels of each axis', () => {
    expect(PROBABILITY_LABELS).toEqual([
      'Rare',
      'Unlikely',
      'Possible',
      'Likely',
      'Almost certain',
    ])
    expect(IMPACT_LABELS).toEqual(['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'])
  })

  it('accepts per-organization band overrides', () => {
    // An operator with a stricter appetite calls 8 High rather than Moderate.
    const strict: RiskBands = { low: 3, moderate: 6, high: 12 }

    expect(scoreRisk(2, 4, strict).level).toBe('HIGH')
    expect(scoreRisk(2, 4).level).toBe('MODERATE')
  })

  it('rejects bands that are not in ascending order', () => {
    // Otherwise a band silently swallows another and scores land in the wrong pile.
    expect(() => scoreRisk(3, 3, { low: 10, moderate: 5, high: 16 })).toThrow(DomainRuleError)
    expect(() => scoreRisk(3, 3, { low: 4, moderate: 9, high: 9 })).toThrow(DomainRuleError)
  })

  it('has ascending default bands', () => {
    expect(DEFAULT_RISK_BANDS.low).toBeLessThan(DEFAULT_RISK_BANDS.moderate)
    expect(DEFAULT_RISK_BANDS.moderate).toBeLessThan(DEFAULT_RISK_BANDS.high)
    expect(DEFAULT_RISK_BANDS.high).toBeLessThan(25)
  })
})
