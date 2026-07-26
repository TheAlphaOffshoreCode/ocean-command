/**
 * Human-readable operation codes: `OP-2026-0042`.
 *
 * This is what people say on the radio and write in a shift handover, so it has
 * to be short, ordered and unique per organization per year. The id is a cuid
 * nobody will ever read aloud.
 */

const PATTERN = /^OP-(\d{4})-(\d{4,})$/

export function formatOperationCode(year: number, sequence: number): string {
  return `OP-${year}-${String(sequence).padStart(4, '0')}`
}

export function parseOperationCode(code: string): { year: number; sequence: number } | null {
  const match = PATTERN.exec(code)
  if (!match) return null

  return { year: Number(match[1]), sequence: Number(match[2]) }
}

/**
 * Next sequence after a set of existing codes for the same year.
 *
 * Derived from the highest code rather than from a row count: counting breaks the
 * moment an operation is deleted, and would then hand out a code that already
 * exists.
 *
 * This alone is not safe under concurrency — two callers reading the same maximum
 * will propose the same sequence. The unique constraint on (organizationId, code)
 * is what actually prevents a duplicate; the caller retries on conflict. See
 * `nextOperationCode` in features/operations.
 */
export function nextSequence(existingCodes: readonly string[], year: number): number {
  const highest = existingCodes.reduce((max, code) => {
    const parsed = parseOperationCode(code)
    if (!parsed || parsed.year !== year) return max
    return Math.max(max, parsed.sequence)
  }, 0)

  return highest + 1
}
