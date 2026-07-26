import 'dotenv/config'

import path from 'node:path'

import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 moved the connection string out of schema.prisma. Migrations use the
 * direct (unpooled) URL: a connection pooler cannot reliably run DDL, and on
 * hosted PostgreSQL the two URLs differ. Locally they are the same.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
})
