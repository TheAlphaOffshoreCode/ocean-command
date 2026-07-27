import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Role } from '@prisma/client'
import { hash, type Algorithm } from '@node-rs/argon2'

import { seedFleet } from './fleet'
import { seedOperations } from './operations'
import { seedRisks } from './risks'

/**
 * Deterministic demo data.
 *
 * The seed builds its own client instead of importing src/lib/db: that module is
 * marked `server-only`, which is exactly what should stop a script from reaching
 * into request-scoped code.
 *
 * Idempotent — every write is an upsert on a natural key, so running it twice
 * changes nothing. A seed that only works on an empty database is a seed nobody
 * dares run.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  }),
})

/**
 * Development-only credentials, documented in the README. This is not a secret
 * being leaked: it exists solely in a local demo tenant, and the account has no
 * meaning outside a database you seeded yourself.
 */
const DEMO_PASSWORD = 'OceanCommand2026!'

// Must match src/lib/auth/password.ts exactly: a seeded account that was hashed
// with different parameters would still verify, but it would stop being evidence
// that the real sign-in path works.
const ARGON2_OPTIONS = {
  algorithm: 2 as Algorithm, // Argon2id — ambient const enum, not readable at runtime
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

type SeedUser = {
  email: string
  name: string
  role: Role
}

const DEMO_USERS: SeedUser[] = [
  { email: 'admin@oceancommand.demo', name: 'Ana Ribeiro', role: Role.ADMINISTRATOR },
  { email: 'manager@oceancommand.demo', name: 'Marcos Tavares', role: Role.OPERATIONS_MANAGER },
  { email: 'operator@oceancommand.demo', name: 'Júlia Moreira', role: Role.OPERATOR },
  { email: 'viewer@oceancommand.demo', name: 'Rafael Costa', role: Role.VIEWER },
]

async function upsertMember(organizationId: string, user: SeedUser, passwordHash: string) {
  const record = await prisma.user.upsert({
    where: { email: user.email },
    update: { name: user.name },
    create: { email: user.email, name: user.name, emailVerified: true },
  })

  // Better Auth keeps the credential on Account, not User. Matching its shape
  // here is what makes a seeded account sign in through the real flow rather
  // than a special path that proves nothing.
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: record.id } },
    update: { password: passwordHash },
    create: {
      providerId: 'credential',
      accountId: record.id,
      userId: record.id,
      password: passwordHash,
    },
  })

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: record.id, organizationId } },
    update: { role: user.role },
    create: { userId: record.id, organizationId, role: user.role },
  })

  return record
}

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, ARGON2_OPTIONS)

  const demo = await prisma.organization.upsert({
    where: { slug: 'ocean-demo' },
    update: { name: 'Ocean Command Demo', isDemo: true },
    create: {
      name: 'Ocean Command Demo',
      slug: 'ocean-demo',
      timezone: 'America/Sao_Paulo',
      isDemo: true,
    },
  })

  for (const user of DEMO_USERS) {
    await upsertMember(demo.id, user, passwordHash)
  }

  // A second tenant exists so isolation can be *proved* rather than asserted.
  // Every query module gets a test that runs as this organization and expects to
  // see none of the first one's data.
  const other = await prisma.organization.upsert({
    where: { slug: 'northern-marine' },
    update: { name: 'Northern Marine (isolation fixture)', isDemo: true },
    create: {
      name: 'Northern Marine (isolation fixture)',
      slug: 'northern-marine',
      isDemo: true,
    },
  })

  await upsertMember(
    other.id,
    {
      email: 'admin@northern-marine.demo',
      name: 'Helena Braga',
      role: Role.ADMINISTRATOR,
    },
    passwordHash,
  )

  const fleet = await seedFleet(prisma, demo.id)
  const operations = await seedOperations(prisma, demo.id)
  const risks = await seedRisks(prisma, demo.id)

  const [organizations, users, memberships] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.membership.count(),
  ])

  console.log(
    `Seed complete — ${organizations} organizations, ${users} users, ${memberships} memberships, ` +
      `${fleet.vessels} vessels, ${fleet.locations} locations, ${operations.operations} operations, ` +
      `${risks.risks} risks.`,
  )
  console.log('All seeded records are DEMO data. Sign in with the credentials in the README.')
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
