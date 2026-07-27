import 'server-only'

import { Prisma } from '@prisma/client'

import type { TenantTransaction } from './with-audit'

/**
 * Atomic allocation of human-readable codes, shared by every module that has them.
 *
 * The argument, learned the hard way in phase 3: reading `MAX(code)` and retrying
 * on the unique constraint does not survive concurrency. Each retry round lets
 * exactly one caller through, so the worst case needs as many attempts as there
 * are callers — it breaks precisely when the product is busy. A ten-way test
 * exhausted five retries.
 *
 * One upsert on a counter row does it in a single statement. PostgreSQL serialises
 * the concurrent updates on that row, and different organizations, kinds and years
 * never contend.
 *
 * The first allocation for a (kind, year) derives its starting point from codes
 * that already exist — the seed writes them directly, and a restored backup
 * arrives with them — so the first code created through the product does not
 * collide with data that was already there.
 */

export type SequenceKind = 'OPERATION' | 'ALERT' | 'RISK' | 'INCIDENT'

/** Which table and column to look at when initialising a counter from existing data. */
const SOURCE: Record<SequenceKind, { table: string; prefix: string }> = {
  OPERATION: { table: 'Operation', prefix: 'OP' },
  ALERT: { table: 'Alert', prefix: 'ALT' },
  RISK: { table: 'Risk', prefix: 'RSK' },
  INCIDENT: { table: 'Incident', prefix: 'INC' },
}

export function formatCode(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`
}

export async function nextCode(
  tx: TenantTransaction,
  organizationId: string,
  kind: SequenceKind,
  year: number,
): Promise<string> {
  const { table, prefix } = SOURCE[kind]
  const codePrefix = `${prefix}-${year}-`

  // The organization is passed in rather than read back from the client: raw SQL
  // bypasses the tenant extension, which is the point of the escape hatch and also
  // its danger.
  //
  // Prisma.raw for the table name is safe here — it comes from the SOURCE map
  // above, never from a caller — and it has to be raw because an identifier cannot
  // be a bound parameter.
  const rows = await tx.$queryRaw<Array<{ lastSequence: number }>>(Prisma.sql`
    INSERT INTO "SequenceCounter" ("organizationId", "kind", "year", "lastSequence")
    VALUES (
      ${organizationId},
      ${kind},
      ${year},
      COALESCE(
        (
          SELECT MAX(NULLIF(regexp_replace("code", '^[A-Z]+-[0-9]{4}-', ''), '')::int)
          FROM ${Prisma.raw(`"${table}"`)}
          WHERE "organizationId" = ${organizationId}
            AND "code" LIKE ${`${codePrefix}%`}
        ),
        0
      ) + 1
    )
    ON CONFLICT ("organizationId", "kind", "year")
    DO UPDATE SET "lastSequence" = "SequenceCounter"."lastSequence" + 1
    RETURNING "lastSequence"
  `)

  const sequence = rows[0]?.lastSequence
  if (sequence === undefined) {
    throw new Error(`Code allocation for ${kind} returned no sequence`)
  }

  return formatCode(prefix, year, sequence)
}
