import { describe, expect, it } from 'vitest'

import {
  imoCheckDigit,
  isValidCallsign,
  isValidIMO,
  isValidMMSI,
} from '@/lib/domain/vessel/identifiers'

describe('IMO number', () => {
  it('accepts numbers with a correct check digit', () => {
    // Published examples: the check digit is what makes these valid, not the shape.
    expect(isValidIMO('9074729')).toBe(true)
    expect(isValidIMO('8814275')).toBe(true)
    expect(isValidIMO('9395044')).toBe(true)
  })

  it('rejects a single-digit typo that keeps the right shape', () => {
    // This is the failure the checksum exists for: seven digits, wrong vessel.
    expect(isValidIMO('9074728')).toBe(false)
    expect(isValidIMO('9074739')).toBe(false)
  })

  it('rejects anything that is not exactly seven digits', () => {
    for (const value of ['', '907472', '90747290', 'IMO9074729', '907472a', ' 9074729']) {
      expect(isValidIMO(value), value).toBe(false)
    }
  })

  it('computes the check digit the validator expects', () => {
    expect(imoCheckDigit('907472')).toBe(9)
    expect(`941020${imoCheckDigit('941020')}`).toSatisfy(isValidIMO)
  })

  it('refuses to compute a check digit from the wrong input length', () => {
    expect(() => imoCheckDigit('90747')).toThrow()
    expect(() => imoCheckDigit('9074729')).toThrow()
  })
})

describe('MMSI', () => {
  it('accepts nine digits with a ship-station MID', () => {
    expect(isValidMMSI('710100011')).toBe(true) // Brazil
    expect(isValidMMSI('232000000')).toBe(true) // United Kingdom
  })

  it('rejects MIDs that do not belong to a ship station', () => {
    // 0 and 1 are coast stations, group calls and SAR aircraft. Accepting them
    // would mean storing an identifier that can never match a ship message.
    expect(isValidMMSI('010000000')).toBe(false)
    expect(isValidMMSI('111000000')).toBe(false)
    expect(isValidMMSI('810000000')).toBe(false)
    expect(isValidMMSI('910000000')).toBe(false)
  })

  it('rejects wrong lengths', () => {
    expect(isValidMMSI('71010001')).toBe(false)
    expect(isValidMMSI('7101000110')).toBe(false)
  })
})

describe('callsign', () => {
  it('accepts 3 to 7 uppercase letters and digits', () => {
    expect(isValidCallsign('PPOC1')).toBe(true)
    expect(isValidCallsign('ABC')).toBe(true)
    expect(isValidCallsign('A1B2C3D')).toBe(true)
  })

  it('rejects lowercase, spaces and the wrong length', () => {
    expect(isValidCallsign('ppoc1')).toBe(false)
    expect(isValidCallsign('AB')).toBe(false)
    expect(isValidCallsign('ABCDEFGH')).toBe(false)
    expect(isValidCallsign('PP OC')).toBe(false)
  })
})
