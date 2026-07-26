import 'server-only'

import { Prisma } from '@prisma/client'

import { formatOperationCode } from '@/lib/domain/operation/code'
import type { TenantTransaction } from '@/lib/db/with-audit'

/**
 * Allocates the next operation code for the year, atomically.
 *
 * The obvious implementation — read `MAX(code)`, increment, retry on conflict —
 * does not survive concurrency. Ten simultaneous creates all read the same
 * maximum, all propose the same sequence, and each retry round only lets one
 * through: the worst case needs as many attempts as there are callers, so it fails
 * precisely when the product is busy. Measured, not assumed: the integration test
 * for ten parallel creates exhausted five retries.
 *
 * A single upsert on a per-(organization, year) counter row does it in one
 * statement. PostgreSQL serialises the concurrent updates on that row, so the
 * lock is as narrow as the problem: creating operations for different
 * organizations, or in different years, never contends.
 *
 * Sequences can show gaps when a transaction takes a code and then rolls back.
 * That is how sequences behave, and a gap is much cheaper than a duplicate.
 *
 * The organization is passed in rather than read back from the client: raw SQL
 * bypasses the tenant extension, which is the point of the escape hatch and also
 * its danger. A first version asked the scoped client for "its" organization —
 * except `Organization` has no organizationId, so the extension does not filter
 * it and the query would happily return somebody else's row. Callers pass
 * ctx.organizationId, which is the only trustworthy source.
 */
export async function nextOperationCode(
  tx: TenantTransaction,
  organizationId: string,
  year: number,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ lastSequence: number }>>(Prisma.sql`
    INSERT INTO "OperationCounter" ("organizationId", "year", "lastSequence")
    VALUES (${organizationId}, ${year}, 1)
    ON CONFLICT ("organizationId", "year")
    DO UPDATE SET "lastSequence" = "OperationCounter"."lastSequence" + 1
    RETURNING "lastSequence"
  `)

  const sequence = rows[0]?.lastSequence
  if (sequence === undefined) {
    throw new Error('Operation code allocation returned no sequence')
  }

  return formatOperationCode(year, sequence)
}

const MAX_ATTEMPTS = 3

/**
 * Retries a create whose code lost a race.
 *
 * With the counter above this should never fire. It stays as a backstop for the
 * case the counter cannot cover: a code inserted by hand, a restored backup, a
 * migration that seeded rows without touching the counter.
 */
export async function withUniqueCodeRetry<T>(
  attempt: (attemptNumber: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown

  for (let attemptNumber = 1; attemptNumber <= MAX_ATTEMPTS; attemptNumber += 1) {
    try {
      return await attempt(attemptNumber)
    } catch (error) {
      if (!isCodeCollision(error)) throw error
      lastError = error
    }
  }

  throw lastError
}

/** A unique-constraint violation specifically on the code column. */
function isCodeCollision(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const candidate = error as { code?: unknown; meta?: { target?: unknown } }
  if (candidate.code !== 'P2002') return false

  const target = candidate.meta?.target
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')]

  return fields.some((field) => field.toLowerCase().includes('code'))
}
