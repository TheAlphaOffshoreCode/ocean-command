import 'server-only'

import { nextCode } from '@/lib/db/sequence'
import type { TenantTransaction } from '@/lib/db/with-audit'

/**
 * Allocates the next operation code (OP-2026-0042).
 *
 * The allocation itself lives in lib/db/sequence, shared with alerts and, later,
 * incidents — the concurrency argument is the same everywhere and worth having in
 * exactly one place.
 */
export function nextOperationCode(
  tx: TenantTransaction,
  organizationId: string,
  year: number,
): Promise<string> {
  return nextCode(tx, organizationId, 'OPERATION', year)
}

const MAX_ATTEMPTS = 3

/**
 * Retries a create whose code lost a race.
 *
 * With the counter this should never fire. It stays as a backstop for what the
 * counter cannot cover: a code inserted by hand, or a restored backup whose
 * counter row did not come with it.
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
