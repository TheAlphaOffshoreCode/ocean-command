import 'server-only'

import { prisma } from './client'

/**
 * The few reads that legitimately cross tenants.
 *
 * Everything else goes through `forTenant(ctx)`. Keeping these here — named,
 * few, and in the one directory allowed to touch the raw client — is what stops
 * "this case is special" from becoming an exception per feature directory, which
 * is how a tenant boundary erodes.
 *
 * Anything added to this file should be a system operation with no user behind
 * it, and it must not return tenant-owned records.
 */

export type SystemOrganization = {
  id: string
  name: string
  isDemo: boolean
}

/**
 * Used by scheduled jobs that have to iterate tenants (the AIS refresh runs one
 * organization at a time, each with its own scoped context).
 */
export function listActiveOrganizations(): Promise<SystemOrganization[]> {
  return prisma.organization.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, isDemo: true },
    orderBy: { createdAt: 'asc' },
  })
}
