import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import { env, isProduction } from '@/config/env'

/**
 * The raw client. Nothing outside `src/lib/db` may import this — ESLint enforces
 * it. Feature code uses `forTenant(ctx)`, which cannot forget the tenant filter.
 *
 * Prisma 7 takes the connection through a driver adapter rather than a `url` in
 * the schema.
 */
const createClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
  })

// One client per process. Next's dev server re-evaluates modules on every edit,
// and a new pool per reload exhausts Postgres connections within a few saves.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createClient()

if (!isProduction) globalForPrisma.prisma = prisma

export type { PrismaClient }
