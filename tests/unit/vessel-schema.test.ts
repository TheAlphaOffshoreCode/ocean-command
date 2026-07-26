import { describe, expect, it } from 'vitest'

import { createVesselSchema, fleetFiltersSchema } from '@/features/fleet/schemas/vessel'

/**
 * The schemas are a security control, not a convenience: they are the allow-list
 * that decides what reaches the database. Worth testing for what they *reject*
 * and for what they refuse to carry through.
 */

const valid = {
  name: 'OC Reviewer',
  type: 'PSV',
  flag: 'br',
  imo: '9074729',
  mmsi: '710100011',
  callsign: 'pp0c9',
}

describe('createVesselSchema', () => {
  it('accepts a well-formed vessel and normalises case', () => {
    const parsed = createVesselSchema.parse(valid)

    expect(parsed.flag).toBe('BR')
    expect(parsed.callsign).toBe('PP0C9')
    expect(parsed.status).toBe('AVAILABLE')
  })

  it('treats empty optional strings as absent rather than invalid', () => {
    // Browsers post '' for untouched inputs. Failing on that would make every
    // optional field effectively required.
    const parsed = createVesselSchema.parse({
      ...valid,
      imo: '',
      mmsi: '',
      callsign: '',
      operator: '',
    })

    expect(parsed.imo).toBeUndefined()
    expect(parsed.mmsi).toBeUndefined()
    expect(parsed.callsign).toBeUndefined()
  })

  it('rejects an IMO whose check digit does not match', () => {
    const result = createVesselSchema.safeParse({ ...valid, imo: '9074728' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('check digit')
  })

  it('rejects an MMSI that is not a ship station', () => {
    expect(createVesselSchema.safeParse({ ...valid, mmsi: '010000000' }).success).toBe(false)
  })

  it('rejects a flag that is not two letters', () => {
    expect(createVesselSchema.safeParse({ ...valid, flag: 'BRA' }).success).toBe(false)
    expect(createVesselSchema.safeParse({ ...valid, flag: '' }).success).toBe(false)
  })

  it('rejects implausible dimensions', () => {
    expect(createVesselSchema.safeParse({ ...valid, lengthM: 0 }).success).toBe(false)
    expect(createVesselSchema.safeParse({ ...valid, lengthM: 900 }).success).toBe(false)
    expect(createVesselSchema.safeParse({ ...valid, lengthM: 'not a number' }).success).toBe(false)
    expect(createVesselSchema.parse({ ...valid, lengthM: '87.9' }).lengthM).toBe(87.9)
  })

  it('does not carry server-owned fields through', () => {
    // Mass assignment: an input schema is an allow-list, so a client that posts a
    // tenant or a position must have those values dropped, not honoured.
    const parsed = createVesselSchema.parse({
      ...valid,
      organizationId: 'another-tenant',
      id: 'chosen-by-client',
      lastLatitude: -1,
      archivedAt: new Date(),
    } as Record<string, unknown>)

    expect(parsed).not.toHaveProperty('organizationId')
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('lastLatitude')
    expect(parsed).not.toHaveProperty('archivedAt')
  })

  it('rejects an unknown vessel type instead of coercing it', () => {
    expect(createVesselSchema.safeParse({ ...valid, type: 'SPACESHIP' }).success).toBe(false)
  })
})

describe('fleetFiltersSchema', () => {
  it('applies defaults for an empty query string', () => {
    const parsed = fleetFiltersSchema.parse({})

    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(25)
    expect(parsed.sort).toBe('name')
    expect(parsed.direction).toBe('asc')
  })

  it('caps the page size a caller can ask for', () => {
    // Otherwise ?pageSize=100000 is a free table scan for anyone with a session.
    expect(fleetFiltersSchema.safeParse({ pageSize: 1_000 }).success).toBe(false)
    expect(fleetFiltersSchema.safeParse({ pageSize: 1 }).success).toBe(false)
    expect(fleetFiltersSchema.parse({ pageSize: '50' }).pageSize).toBe(50)
  })

  it('rejects a sort column that is not in the allow-list', () => {
    // The value goes into an orderBy key, so an open-ended string here would let a
    // caller order by any column in the table.
    expect(fleetFiltersSchema.safeParse({ sort: 'imo' }).success).toBe(false)
    expect(fleetFiltersSchema.safeParse({ direction: 'sideways' }).success).toBe(false)
  })

  it('rejects a negative or zero page', () => {
    expect(fleetFiltersSchema.safeParse({ page: 0 }).success).toBe(false)
    expect(fleetFiltersSchema.safeParse({ page: -3 }).success).toBe(false)
  })
})
