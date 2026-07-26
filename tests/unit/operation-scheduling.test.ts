import { describe, expect, it } from 'vitest'

import { formatOperationCode, nextSequence, parseOperationCode } from '@/lib/domain/operation/code'
import {
  assertValidWindow,
  describeConflicts,
  findScheduleConflicts,
  windowsOverlap,
  type ScheduledOperation,
} from '@/lib/domain/operation/scheduling'
import { DomainRuleError } from '@/lib/errors'

const at = (iso: string) => new Date(iso)

const existing: ScheduledOperation[] = [
  {
    id: 'op-1',
    code: 'OP-2026-0001',
    name: 'Cargo transfer',
    start: at('2026-07-26T06:00:00Z'),
    end: at('2026-07-26T18:00:00Z'),
  },
  {
    id: 'op-2',
    code: 'OP-2026-0002',
    name: 'Crew transfer',
    start: at('2026-07-27T06:00:00Z'),
    end: at('2026-07-27T10:00:00Z'),
  },
]

describe('windowsOverlap', () => {
  it('detects a partial overlap from either side', () => {
    const a = { start: at('2026-07-26T00:00:00Z'), end: at('2026-07-26T08:00:00Z') }
    const b = { start: at('2026-07-26T06:00:00Z'), end: at('2026-07-26T18:00:00Z') }

    expect(windowsOverlap(a, b)).toBe(true)
    expect(windowsOverlap(b, a)).toBe(true)
  })

  it('detects containment', () => {
    const outer = { start: at('2026-07-26T00:00:00Z'), end: at('2026-07-27T00:00:00Z') }
    const inner = { start: at('2026-07-26T08:00:00Z'), end: at('2026-07-26T10:00:00Z') }

    expect(windowsOverlap(outer, inner)).toBe(true)
    expect(windowsOverlap(inner, outer)).toBe(true)
  })

  it('treats back-to-back operations as no conflict', () => {
    // Half-open comparison. Jobs that hand over at 18:00 are normal, and flagging
    // them would make the check cry wolf on every well-planned schedule.
    const morning = { start: at('2026-07-26T06:00:00Z'), end: at('2026-07-26T18:00:00Z') }
    const evening = { start: at('2026-07-26T18:00:00Z'), end: at('2026-07-27T02:00:00Z') }

    expect(windowsOverlap(morning, evening)).toBe(false)
  })

  it('does not flag windows that merely touch at one instant', () => {
    const a = { start: at('2026-07-26T06:00:00Z'), end: at('2026-07-26T06:00:00Z') }
    expect(windowsOverlap(a, existing[0]!)).toBe(false)
  })
})

describe('findScheduleConflicts', () => {
  it('returns the operations a proposed window collides with', () => {
    const conflicts = findScheduleConflicts(
      { start: at('2026-07-26T12:00:00Z'), end: at('2026-07-27T08:00:00Z') },
      existing,
    )

    expect(conflicts.map((operation) => operation.code)).toEqual(['OP-2026-0001', 'OP-2026-0002'])
  })

  it('ignores the operation being rescheduled', () => {
    // Without this, moving an operation by an hour would collide with itself.
    const conflicts = findScheduleConflicts(
      { start: at('2026-07-26T07:00:00Z'), end: at('2026-07-26T19:00:00Z') },
      existing,
      'op-1',
    )

    expect(conflicts).toEqual([])
  })

  it('finds nothing in a free window', () => {
    expect(
      findScheduleConflicts(
        { start: at('2026-07-26T18:00:00Z'), end: at('2026-07-27T06:00:00Z') },
        existing,
      ),
    ).toEqual([])
  })
})

describe('assertValidWindow', () => {
  it('rejects an end before or equal to the start', () => {
    expect(() =>
      assertValidWindow({ start: at('2026-07-26T10:00:00Z'), end: at('2026-07-26T09:00:00Z') }),
    ).toThrow(DomainRuleError)

    expect(() =>
      assertValidWindow({ start: at('2026-07-26T10:00:00Z'), end: at('2026-07-26T10:00:00Z') }),
    ).toThrow(/after the planned start/)
  })
})

describe('describeConflicts', () => {
  it('names the operation when there is one, so the message is actionable', () => {
    expect(describeConflicts([existing[0]!])).toContain('OP-2026-0001')
    expect(describeConflicts([existing[0]!])).toContain('Cargo transfer')
  })

  it('lists the codes when there are several', () => {
    const message = describeConflicts(existing)
    expect(message).toContain('OP-2026-0001')
    expect(message).toContain('OP-2026-0002')
  })
})

describe('operation codes', () => {
  it('formats and parses a round trip', () => {
    expect(formatOperationCode(2026, 42)).toBe('OP-2026-0042')
    expect(parseOperationCode('OP-2026-0042')).toEqual({ year: 2026, sequence: 42 })
  })

  it('rejects anything that is not a code', () => {
    for (const value of ['', 'OP-2026', 'OP-26-0042', 'RSK-2026-0042', 'OP-2026-004']) {
      expect(parseOperationCode(value), value).toBeNull()
    }
  })

  it('continues from the highest sequence of the year', () => {
    expect(nextSequence(['OP-2026-0001', 'OP-2026-0007', 'OP-2026-0003'], 2026)).toBe(8)
  })

  it('starts at 1 for a year with no operations', () => {
    expect(nextSequence([], 2026)).toBe(1)
    expect(nextSequence(['OP-2025-0099'], 2026)).toBe(1)
  })

  it('keeps counting past four digits', () => {
    // The reason the caller reads every code for the year instead of ordering by
    // code in SQL: lexicographically 'OP-2026-9999' sorts above 'OP-2026-10000',
    // which would start handing out duplicates at exactly 10 000 operations.
    expect(nextSequence(['OP-2026-9999'], 2026)).toBe(10_000)
    expect(nextSequence(['OP-2026-9999', 'OP-2026-10000'], 2026)).toBe(10_001)
    expect(formatOperationCode(2026, 10_000)).toBe('OP-2026-10000')
    expect(parseOperationCode('OP-2026-10000')).toEqual({ year: 2026, sequence: 10_000 })
  })

  it('ignores codes from other years when counting', () => {
    expect(nextSequence(['OP-2025-0500', 'OP-2026-0002'], 2026)).toBe(3)
  })
})
