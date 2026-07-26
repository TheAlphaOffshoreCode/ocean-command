import { OperationType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WEATHER_LIMITS,
  evaluateWeatherWindow,
  limitsFor,
  type WeatherMetrics,
} from '@/lib/domain/weather/weather-window'

/**
 * Written before the implementation, per the phase-4 plan, and against the
 * thresholds documented in ARCHITECTURE.md §5.2.
 *
 * These are the assertions that matter most in the whole product: the verdict
 * decides whether work goes ahead offshore. Every boundary is tested from both
 * sides, because "greater than" versus "greater than or equal" is the difference
 * between a crew transfer that sails and one that does not.
 */

/** Flat calm: whatever the operation, this is workable. */
const calm: WeatherMetrics = {
  windSpeedKn: 8,
  windGustKn: 12,
  waveHeightM: 0.8,
  visibilityNm: 6,
}

const observedAt = new Date('2026-07-26T12:00:00.000Z')

describe('weather limits', () => {
  it('has limits for every operation type', () => {
    // A type with no limits would silently evaluate as Favorable in any weather.
    for (const type of Object.values(OperationType)) {
      expect(limitsFor(type), type).toBeDefined()
    }
  })

  it('keeps marginal stricter than unsafe on every metric', () => {
    for (const [type, limits] of Object.entries(DEFAULT_WEATHER_LIMITS)) {
      expect(limits.windSpeedKn.marginal, `${type} wind`).toBeLessThan(limits.windSpeedKn.unsafe)
      expect(limits.windGustKn.marginal, `${type} gust`).toBeLessThan(limits.windGustKn.unsafe)
      expect(limits.waveHeightM.marginal, `${type} wave`).toBeLessThan(limits.waveHeightM.unsafe)
      // Visibility runs the other way: less is worse.
      expect(limits.visibilityNm.marginal, `${type} visibility`).toBeGreaterThan(
        limits.visibilityNm.unsafe,
      )
    }
  })

  it('is strictest for diving and most permissive for anchor handling', () => {
    // Divers in the water tolerate far less than a tug on a wire. If this ever
    // inverts, the table has been edited without thinking about the domain.
    const diving = limitsFor(OperationType.DIVING_OPERATION)
    const anchor = limitsFor(OperationType.ANCHOR_HANDLING)

    expect(diving.waveHeightM.unsafe).toBeLessThan(anchor.waveHeightM.unsafe)
    expect(diving.windSpeedKn.unsafe).toBeLessThan(anchor.windSpeedKn.unsafe)
  })
})

describe('evaluateWeatherWindow', () => {
  it('calls flat calm favourable, with nothing breached', () => {
    const verdict = evaluateWeatherWindow(OperationType.CREW_TRANSFER, calm, observedAt)

    expect(verdict.status).toBe('FAVORABLE')
    expect(verdict.breaches).toEqual([])
    expect(verdict.evaluatedAt).toEqual(observedAt)
  })

  it('takes the worst level any single metric reaches', () => {
    // Wind fine, wave unsafe: the verdict is Unsafe. Averaging metrics would let a
    // dangerous sea state hide behind a light breeze.
    const verdict = evaluateWeatherWindow(
      OperationType.DIVING_OPERATION,
      { ...calm, waveHeightM: 2.0 },
      observedAt,
    )

    expect(verdict.status).toBe('UNSAFE')
  })

  it('names the metric that caused the verdict', () => {
    // A verdict without its reason is unusable in an operations room.
    const verdict = evaluateWeatherWindow(
      OperationType.CREW_TRANSFER,
      { ...calm, windSpeedKn: 26 },
      observedAt,
    )

    expect(verdict.status).toBe('UNSAFE')
    expect(verdict.breaches).toHaveLength(1)
    expect(verdict.breaches[0]).toMatchObject({
      metric: 'windSpeedKn',
      value: 26,
      limit: 25,
      level: 'UNSAFE',
    })
  })

  it('reports every breach, not only the worst one', () => {
    const verdict = evaluateWeatherWindow(
      OperationType.DIVING_OPERATION,
      { windSpeedKn: 30, windGustKn: 40, waveHeightM: 3, visibilityNm: 0.5 },
      observedAt,
    )

    expect(verdict.status).toBe('UNSAFE')
    expect(verdict.breaches.map((breach) => breach.metric).sort()).toEqual([
      'visibilityNm',
      'waveHeightM',
      'windGustKn',
      'windSpeedKn',
    ])
  })

  describe('wind thresholds for crew transfer (20 marginal / 25 unsafe)', () => {
    const evaluate = (windSpeedKn: number) =>
      evaluateWeatherWindow(OperationType.CREW_TRANSFER, { ...calm, windSpeedKn }, observedAt)

    it('is favourable just below the marginal limit', () => {
      expect(evaluate(19.9).status).toBe('FAVORABLE')
    })

    it('is marginal exactly at the marginal limit', () => {
      // At the limit, not past it: a published limit of 20 knots means 20 knots is
      // already the marginal case, which is how a vessel's operating manual reads.
      expect(evaluate(20).status).toBe('MARGINAL')
    })

    it('is marginal between the two limits', () => {
      expect(evaluate(24.9).status).toBe('MARGINAL')
    })

    it('is unsafe exactly at the unsafe limit', () => {
      expect(evaluate(25).status).toBe('UNSAFE')
    })

    it('is unsafe above the unsafe limit', () => {
      expect(evaluate(40).status).toBe('UNSAFE')
    })
  })

  describe('visibility runs the other way (2 marginal / 1 unsafe)', () => {
    const evaluate = (visibilityNm: number) =>
      evaluateWeatherWindow(OperationType.CREW_TRANSFER, { ...calm, visibilityNm }, observedAt)

    it('is favourable above the marginal limit', () => {
      expect(evaluate(2.1).status).toBe('FAVORABLE')
    })

    it('is marginal exactly at the marginal limit', () => {
      expect(evaluate(2).status).toBe('MARGINAL')
    })

    it('is unsafe exactly at the unsafe limit', () => {
      expect(evaluate(1).status).toBe('UNSAFE')
    })

    it('is unsafe in thick fog', () => {
      expect(evaluate(0.2).status).toBe('UNSAFE')
    })
  })

  it('degrades honestly when a metric is missing', () => {
    // Open-Meteo's marine endpoint can return no wave height for a point. Treating
    // absent as zero would turn "we do not know the sea state" into "the sea is
    // flat", which is the most dangerous rounding error this product could make.
    const verdict = evaluateWeatherWindow(
      OperationType.DIVING_OPERATION,
      { windSpeedKn: 10, windGustKn: 14, waveHeightM: null, visibilityNm: 5 },
      observedAt,
    )

    expect(verdict.degraded).toBe(true)
    expect(verdict.missing).toEqual(['waveHeightM'])
    // Still a verdict on what is known, rather than refusing to answer.
    expect(verdict.status).toBe('FAVORABLE')
  })

  it('is not degraded when every metric is present', () => {
    expect(evaluateWeatherWindow(OperationType.SURVEY, calm, observedAt).degraded).toBe(false)
  })

  it('accepts per-organization overrides', () => {
    // "Our DSV works to 2 m, not 1.5" has to be a setting, not a deploy.
    const verdict = evaluateWeatherWindow(
      OperationType.DIVING_OPERATION,
      { ...calm, waveHeightM: 1.8 },
      observedAt,
      { DIVING_OPERATION: { waveHeightM: { marginal: 2, unsafe: 2.5 } } },
    )

    expect(verdict.status).toBe('FAVORABLE')
    expect(evaluateWeatherWindow(OperationType.DIVING_OPERATION, { ...calm, waveHeightM: 1.8 }, observedAt).status).toBe(
      'UNSAFE',
    )
  })

  it('ignores an override for a metric it does not mention', () => {
    // A partial override must not wipe the remaining limits.
    const verdict = evaluateWeatherWindow(
      OperationType.DIVING_OPERATION,
      { ...calm, windSpeedKn: 30 },
      observedAt,
      { DIVING_OPERATION: { waveHeightM: { marginal: 3, unsafe: 4 } } },
    )

    expect(verdict.status).toBe('UNSAFE')
    expect(verdict.breaches[0]?.metric).toBe('windSpeedKn')
  })
})
