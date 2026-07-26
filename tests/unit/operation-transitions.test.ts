import { OperationStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  ACTIVE_STATUSES,
  allowedTransitions,
  assertTransitionAllowed,
  canTransition,
  isTerminal,
  timestampsFor,
} from '@/lib/domain/operation/transitions'
import { DomainRuleError } from '@/lib/errors'

const ALL = Object.values(OperationStatus)

describe('operation transitions', () => {
  it('walks the happy path an operator actually walks', () => {
    const path: OperationStatus[] = ['PLANNED', 'PREPARING', 'READY', 'IN_PROGRESS', 'COMPLETED']

    for (let i = 1; i < path.length; i += 1) {
      expect(canTransition(path[i - 1]!, path[i]!), `${path[i - 1]} → ${path[i]}`).toBe(true)
    }
  })

  it('refuses to jump straight to Completed', () => {
    // A completed operation that was never in progress has no actual start, so the
    // record of when the work happened would be a hole.
    expect(canTransition('PLANNED', 'COMPLETED')).toBe(false)
    expect(canTransition('PREPARING', 'COMPLETED')).toBe(false)
    expect(canTransition('READY', 'COMPLETED')).toBe(false)
  })

  it('refuses to reopen a terminal operation', () => {
    for (const to of ALL) {
      expect(canTransition('COMPLETED', to), `COMPLETED → ${to}`).toBe(false)
      expect(canTransition('CANCELLED', to), `CANCELLED → ${to}`).toBe(false)
    }

    expect(() => assertTransitionAllowed('COMPLETED', 'PLANNED')).toThrow(DomainRuleError)
    expect(() => assertTransitionAllowed('COMPLETED', 'PLANNED')).toThrow(/final status/)
  })

  it('allows stepping back when a job turns out not to be ready', () => {
    expect(canTransition('READY', 'PREPARING')).toBe(true)
    expect(canTransition('PREPARING', 'PLANNED')).toBe(true)
  })

  it('suspends work under way instead of cancelling it outright', () => {
    // Stop work, then decide — which is the sequence an operations room follows.
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(false)
    expect(canTransition('IN_PROGRESS', 'SUSPENDED')).toBe(true)
    expect(canTransition('SUSPENDED', 'CANCELLED')).toBe(true)
    expect(canTransition('SUSPENDED', 'IN_PROGRESS')).toBe(true)
  })

  it('rejects a transition to the same status with its own message', () => {
    expect(() => assertTransitionAllowed('IN_PROGRESS', 'IN_PROGRESS')).toThrow(/already/)
  })

  it('names the possible moves when it refuses one', () => {
    // The refusal has to be actionable: "from here it can only become X, Y".
    try {
      assertTransitionAllowed('PLANNED', 'IN_PROGRESS')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError)
      expect((error as DomainRuleError).message).toContain('Preparing')
    }
  })

  it('has no unreachable status other than the starting one', () => {
    const reachable = new Set(ALL.flatMap((status) => allowedTransitions(status)))

    for (const status of ALL) {
      if (status === 'PLANNED') continue
      expect(reachable.has(status), `${status} is unreachable`).toBe(true)
    }
  })

  it('marks exactly Completed and Cancelled as terminal', () => {
    expect(isTerminal('COMPLETED')).toBe(true)
    expect(isTerminal('CANCELLED')).toBe(true)

    for (const status of ACTIVE_STATUSES) {
      expect(isTerminal(status), status).toBe(false)
      expect(allowedTransitions(status).length).toBeGreaterThan(0)
    }
  })
})

describe('timestamps implied by a transition', () => {
  const now = new Date('2026-07-26T12:00:00.000Z')
  const fresh = { actualStart: null, actualEnd: null }

  it('stamps the start when work begins', () => {
    expect(timestampsFor('IN_PROGRESS', fresh, now).actualStart).toEqual(now)
  })

  it('does not restamp the start when work resumes', () => {
    // A job suspended and resumed started when it first started; overwriting that
    // would erase the delay it is evidence of.
    const started = { actualStart: new Date('2026-07-26T06:00:00.000Z'), actualEnd: null }
    expect(timestampsFor('IN_PROGRESS', started, now).actualStart).toBeUndefined()
  })

  it('clears a previously stamped end when work resumes', () => {
    const ended = {
      actualStart: new Date('2026-07-26T06:00:00.000Z'),
      actualEnd: new Date('2026-07-26T10:00:00.000Z'),
    }
    expect(timestampsFor('IN_PROGRESS', ended, now).actualEnd).toBeNull()
  })

  it('stamps the end on completion, and a start if somehow missing', () => {
    const started = { actualStart: new Date('2026-07-26T06:00:00.000Z'), actualEnd: null }
    expect(timestampsFor('COMPLETED', started, now).actualEnd).toEqual(now)
    expect(timestampsFor('COMPLETED', started, now).actualStart).toBeUndefined()
    expect(timestampsFor('COMPLETED', fresh, now).actualStart).toEqual(now)
  })

  it('gives a cancelled operation no completion time', () => {
    const started = { actualStart: new Date('2026-07-26T06:00:00.000Z'), actualEnd: null }
    const result = timestampsFor('CANCELLED', started, now)

    expect(result.actualEnd).toBeNull()
    // It did start, and that stays true.
    expect(result.actualStart).toBeUndefined()
  })

  it('touches nothing on preparation steps', () => {
    expect(timestampsFor('PREPARING', fresh, now)).toEqual({})
    expect(timestampsFor('READY', fresh, now)).toEqual({})
  })
})
