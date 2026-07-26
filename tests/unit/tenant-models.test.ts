import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { TENANT_MODELS } from '@/lib/db/tenant'

/**
 * Reads the schema and asserts that every model carrying `organizationId` is
 * registered for tenant scoping.
 *
 * Without this, adding a model is a two-step change where forgetting the second
 * step produces a table that silently reads across organizations — the exact
 * failure this architecture is built to make impossible. The list cannot be kept
 * in sync by discipline; it has to be checked.
 */
describe('tenant model registry', () => {
  const schema = readFileSync(
    path.resolve(import.meta.dirname, '../../prisma/schema.prisma'),
    'utf8',
  )

  const modelsWithOrganizationId = [...schema.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)]
    .filter(([, , body]) => /^\s*organizationId\s+String/m.test(body ?? ''))
    .map(([, name]) => name!)

  it('finds the tenant-owned models in the schema', () => {
    expect(modelsWithOrganizationId.length).toBeGreaterThan(10)
  })

  it('registers every model that has an organizationId column', () => {
    const missing = modelsWithOrganizationId.filter((model) => !TENANT_MODELS.has(model))
    expect(missing, `add these to TENANT_MODELS in src/lib/db/tenant.ts: ${missing.join(', ')}`).toEqual(
      [],
    )
  })

  it('does not register models that no longer have one', () => {
    const stale = [...TENANT_MODELS].filter((model) => !modelsWithOrganizationId.includes(model))
    expect(stale, `these are no longer tenant-owned: ${stale.join(', ')}`).toEqual([])
  })
})
