/**
 * Vessel identifier validation. Pure functions — the Zod schemas and the seed
 * both use these, so a vessel cannot enter the system through one path with an
 * identifier the other would reject.
 */

/**
 * IMO number: seven digits where the last one is a check digit. Multiply the
 * first six by 7, 6, 5, 4, 3, 2, sum, and the last digit of that sum is the
 * check digit.
 *
 * This matters more than it looks: an IMO number is how a vessel is identified
 * across operators, port authorities and class societies. A typo that passes
 * validation becomes a vessel that cannot be cross-referenced with anything.
 */
export function isValidIMO(value: string): boolean {
  if (!/^\d{7}$/.test(value)) return false

  const digits = [...value].map(Number) as number[]
  const weighted = digits
    .slice(0, 6)
    .reduce((sum, digit, index) => sum + digit * (7 - index), 0)

  return weighted % 10 === digits[6]
}

/** Computes the check digit for six leading digits — used to build valid demo IMOs. */
export function imoCheckDigit(sixDigits: string): number {
  if (!/^\d{6}$/.test(sixDigits)) {
    throw new Error('imoCheckDigit expects exactly six digits')
  }

  return (
    [...sixDigits]
      .map(Number)
      .reduce((sum, digit, index) => sum + digit * (7 - index), 0) % 10
  )
}

/**
 * MMSI: nine digits. The first three are the MID (country), and for a ship
 * station the MID starts at 2–7. Leading 0 or 1 belongs to coast stations,
 * group calls and SAR aircraft — not to a vessel, so we reject it rather than
 * accept an identifier that will never match an AIS ship message.
 */
export function isValidMMSI(value: string): boolean {
  return /^[2-7]\d{8}$/.test(value)
}

/** Callsign: letters and digits, 3–7 characters, as issued by flag states. */
export function isValidCallsign(value: string): boolean {
  return /^[A-Z0-9]{3,7}$/.test(value)
}
