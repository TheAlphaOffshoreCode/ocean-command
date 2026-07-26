import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'

/**
 * Integration tests run against the local development database. If it is not
 * reachable, they skip loudly rather than failing the suite: a developer without
 * Docker running should still get the unit tests, and CI provides a real
 * PostgreSQL service so nothing is skipped there.
 */
export const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  }),
})

export async function databaseAvailable(): Promise<boolean> {
  try {
    await testDb.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export function contextFor(organization: {
  id: string
  name: string
  isDemo: boolean
}): TenantContext {
  return {
    userId: 'test-user',
    userName: 'Test User',
    userEmail: 'test@example.com',
    organizationId: organization.id,
    organizationName: organization.name,
    role: 'ADMINISTRATOR',
    isDemo: organization.isDemo,
  }
}
