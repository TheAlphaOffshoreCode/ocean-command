import { AlertStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  alertTimestampsFor,
  assertAlertTransition,
  canTransition,
  isAtLeastSeverity,
  isOpen,
  OPEN_STATUSES,
} from '@/lib/domain/alert/lifecycle'
import {
  alertKey,
  delayAlertsFor,
  riskAlertsFor,
  weatherAlertsFor,
  type OperationForAlerts,
} from '@/lib/domain/alert/rules'
import { evaluateWeatherWindow } from '@/lib/domain/weather/weather-window'
import { DomainRuleError } from '@/lib/errors'

const now = new Date('2026-07-26T12:00:00.000Z')
const HOUR = 3_600_000

const operation: OperationForAlerts = {
  id: 'op-1',
  code: 'OP-2026-0001',
  name: 'Crew transfer to CB-07',
  type: 'CREW_TRANSFER',
  status: 'READY',
  priority: 'HIGH',
  vesselId: 'vessel-1',
  plannedStart: new Date(now.getTime() + 2 * HOUR),
  plannedEnd: new Date(now.getTime() + 8 * HOUR),
  actualStart: null,
}

describe('alert lifecycle', () => {
  it('lets anyone on shift take ownership, then a supervisor close it', () => {
    expect(canTransition('UNREAD', 'ACKNOWLEDGED')).toBe(true)
    expect(canTransition('ACKNOWLEDGED', 'RESOLVED')).toBe(true)
  })

  it('allows resolving straight from unread', () => {
    // A condition that has already cleared should not need a ceremonial
    // acknowledgement first.
    expect(canTransition('UNREAD', 'RESOLVED')).toBe(true)
  })

  it('allows reopening, because a condition that returns is the same condition', () => {
    expect(canTransition('RESOLVED', 'UNREAD')).toBe(true)
    expect(canTransition('RESOLVED', 'ACKNOWLEDGED')).toBe(true)
  })

  it('refuses a transition to the same status', () => {
    expect(() => assertAlertTransition('ACKNOWLEDGED', 'ACKNOWLEDGED')).toThrow(DomainRuleError)
    expect(() => assertAlertTransition('ACKNOWLEDGED', 'ACKNOWLEDGED')).toThrow(/already/)
  })

  it('counts unread and acknowledged as open', () => {
    expect(OPEN_STATUSES).toEqual(['UNREAD', 'ACKNOWLEDGED'])
    expect(isOpen('UNREAD')).toBe(true)
    expect(isOpen('ACKNOWLEDGED')).toBe(true)
    expect(isOpen('RESOLVED')).toBe(false)
  })

  it('orders severities so filters can ask for "high and above"', () => {
    expect(isAtLeastSeverity('CRITICAL', 'HIGH')).toBe(true)
    expect(isAtLeastSeverity('HIGH', 'HIGH')).toBe(true)
    expect(isAtLeastSeverity('MEDIUM', 'HIGH')).toBe(false)
  })
})

describe('timestamps a transition implies', () => {
  const fresh = { acknowledgedAt: null, acknowledgedBy: null }

  it('stamps who acknowledged it, and when', () => {
    const stamps = alertTimestampsFor(AlertStatus.ACKNOWLEDGED, fresh, 'user-1', now)

    expect(stamps.acknowledgedAt).toEqual(now)
    expect(stamps.acknowledgedBy).toBe('user-1')
  })

  it('does not overwrite the original acknowledgement when resolving', () => {
    // "Acknowledged 03:12, resolved 07:40" is the story. Overwriting the first
    // timestamp on the second action erases it.
    const acknowledged = { acknowledgedAt: new Date(now.getTime() - 4 * HOUR), acknowledgedBy: 'user-1' }
    const stamps = alertTimestampsFor(AlertStatus.RESOLVED, acknowledged, 'user-2', now)

    expect(stamps.acknowledgedAt).toBeUndefined()
    expect(stamps.resolvedAt).toEqual(now)
    expect(stamps.resolvedBy).toBe('user-2')
  })

  it('records who saw it even when resolved without acknowledging', () => {
    const stamps = alertTimestampsFor(AlertStatus.RESOLVED, fresh, 'user-1', now)

    expect(stamps.acknowledgedBy).toBe('user-1')
    expect(stamps.resolvedBy).toBe('user-1')
  })

  it('clears the resolution when an alert is reopened', () => {
    const resolved = { acknowledgedAt: new Date(now.getTime() - HOUR), acknowledgedBy: 'user-1' }

    expect(alertTimestampsFor(AlertStatus.ACKNOWLEDGED, resolved, 'user-2', now).resolvedAt).toBeNull()
    // Back to Unread is a full reset: it is nobody's until someone takes it again.
    const reset = alertTimestampsFor(AlertStatus.UNREAD, resolved, 'user-2', now)
    expect(reset.acknowledgedAt).toBeNull()
    expect(reset.acknowledgedBy).toBeNull()
    expect(reset.resolvedAt).toBeNull()
  })
})

describe('weather alerts', () => {
  const verdict = (windSpeedKn: number) =>
    evaluateWeatherWindow(
      'CREW_TRANSFER',
      { windSpeedKn, windGustKn: windSpeedKn * 1.3, waveHeightM: 1.0, visibilityNm: 8 },
      now,
    )

  it('raises nothing when the window is favourable', () => {
    expect(weatherAlertsFor(operation, verdict(10), 'CB-07')).toEqual([])
  })

  it('escalates an unsafe window on work already under way', () => {
    // Stop-work conversation, not a scheduling problem.
    const [alert] = weatherAlertsFor({ ...operation, status: 'IN_PROGRESS' }, verdict(30), 'CB-07')
    expect(alert?.severity).toBe('CRITICAL')

    const [planned] = weatherAlertsFor({ ...operation, status: 'PLANNED' }, verdict(30), 'CB-07')
    expect(planned?.severity).toBe('HIGH')
  })

  it('keeps a marginal window quieter than an unsafe one', () => {
    const [marginal] = weatherAlertsFor({ ...operation, status: 'IN_PROGRESS' }, verdict(21), 'CB-07')
    expect(marginal?.severity).toBe('MEDIUM')
  })

  it('names the metric and the limit in the description', () => {
    const [alert] = weatherAlertsFor(operation, verdict(30), 'Campos Basin CB-07')

    expect(alert?.description).toContain('Campos Basin CB-07')
    expect(alert?.description).toContain('Wind')
    expect(alert?.description).toContain('30')
    // "Bad weather" would be useless; the limit it breached is the actionable part.
    expect(alert?.description).toMatch(/limit/)
  })

  it('always produces the same dedup key for the same operation', () => {
    const first = weatherAlertsFor(operation, verdict(30), 'CB-07')[0]!
    const second = weatherAlertsFor(operation, verdict(35), 'CB-07')[0]!

    // Different wind, same source: one alert, updated — not two.
    expect(alertKey(first)).toBe(alertKey(second))
    expect(alertKey(first)).toBe('weather:op-1:WEATHER')
  })
})

describe('delay alerts', () => {
  it('raises nothing for an operation that is on time', () => {
    expect(delayAlertsFor(operation, now)).toEqual([])
  })

  it('raises when an operation should have started and has not', () => {
    const late = { ...operation, plannedStart: new Date(now.getTime() - 3 * HOUR) }
    const [alert] = delayAlertsFor(late, now)

    expect(alert?.title).toContain('has not started')
    expect(alert?.description).toContain('3h ago')
  })

  it('raises when an operation runs past its planned end', () => {
    const overrunning = {
      ...operation,
      status: 'IN_PROGRESS' as const,
      actualStart: new Date(now.getTime() - 10 * HOUR),
      plannedStart: new Date(now.getTime() - 10 * HOUR),
      plannedEnd: new Date(now.getTime() - 2 * HOUR),
    }
    const [alert] = delayAlertsFor(overrunning, now)

    expect(alert?.title).toContain('running past its planned end')
  })

  it('scales severity with the operation priority', () => {
    const late = { ...operation, plannedStart: new Date(now.getTime() - HOUR) }

    expect(delayAlertsFor({ ...late, priority: 'CRITICAL' }, now)[0]?.severity).toBe('HIGH')
    expect(delayAlertsFor({ ...late, priority: 'HIGH' }, now)[0]?.severity).toBe('MEDIUM')
    expect(delayAlertsFor({ ...late, priority: 'LOW' }, now)[0]?.severity).toBe('LOW')
  })

  it('stays quiet about finished work', () => {
    const done = {
      ...operation,
      status: 'COMPLETED' as const,
      plannedStart: new Date(now.getTime() - 20 * HOUR),
      plannedEnd: new Date(now.getTime() - 10 * HOUR),
      actualStart: new Date(now.getTime() - 19 * HOUR),
    }

    expect(delayAlertsFor(done, now)).toEqual([])
    expect(delayAlertsFor({ ...done, status: 'CANCELLED' }, now)).toEqual([])
  })
})

describe('risk alerts', () => {
  const risk = {
    id: 'risk-1',
    code: 'RSK-0104',
    title: 'Crane wire beyond inspection interval',
    level: 'CRITICAL' as const,
    status: 'OPEN',
    vesselId: 'vessel-1',
    operationId: null,
  }

  it('pushes an open critical risk into the alert panel', () => {
    const [alert] = riskAlertsFor(risk)

    expect(alert?.severity).toBe('CRITICAL')
    expect(alert?.description).toBe(risk.title)
    expect(alertKey(alert!)).toBe('risk:risk-1:RISK')
  })

  it('raises high risks too, one level quieter', () => {
    expect(riskAlertsFor({ ...risk, level: 'HIGH' })[0]?.severity).toBe('HIGH')
  })

  it('ignores moderate and low risks', () => {
    expect(riskAlertsFor({ ...risk, level: 'MODERATE' })).toEqual([])
    expect(riskAlertsFor({ ...risk, level: 'LOW' })).toEqual([])
  })

  it('ignores risks that are closed, accepted or merely monitored', () => {
    for (const status of ['CLOSED', 'ACCEPTED', 'MONITORED']) {
      expect(riskAlertsFor({ ...risk, status }), status).toEqual([])
    }
  })

  it('still raises while a risk is being mitigated', () => {
    // Mitigation in progress is not the same as risk gone.
    expect(riskAlertsFor({ ...risk, status: 'MITIGATING' })).toHaveLength(1)
  })
})
