import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { forTenant } from '@/lib/db/tenant'

import { contextFor, databaseAvailable, testDb } from '../helpers/db'

/**
 * The test this whole architecture exists for.
 *
 * Two organizations, one query layer. If any of these assertions ever fails,
 * one company can read another company's vessel positions — the worst failure
 * this system is capable of.
 */
describe('tenant isolation', async () => {
  const available = await databaseAvailable()
  const suite = available ? describe : describe.skip

  suite('with a database', () => {
    let contextA: ReturnType<typeof contextFor>
    let contextB: ReturnType<typeof contextFor>
    const createdIds: string[] = []

    beforeAll(async () => {
      const [orgA, orgB] = await Promise.all([
        testDb.organization.findUniqueOrThrow({ where: { slug: 'ocean-demo' } }),
        testDb.organization.findUniqueOrThrow({ where: { slug: 'northern-marine' } }),
      ])
      contextA = contextFor(orgA)
      contextB = contextFor(orgB)
    })

    afterAll(async () => {
      if (createdIds.length > 0) {
        await testDb.vessel.deleteMany({ where: { id: { in: createdIds } } })
      }
      await testDb.$disconnect()
    })

    it('overrides an organizationId supplied by the caller', async () => {
      // Stronger than checking that the right tenant is stamped: here the write
      // explicitly asks for *another* organization, the way a tampered payload
      // or a copy-pasted bug would, and the layer overrules it.
      const vessel = await forTenant(contextA).vessel.create({
        data: {
          name: 'OC Isolation Probe A',
          type: 'PSV',
          flag: 'BR',
          organizationId: contextB.organizationId,
        },
      })
      createdIds.push(vessel.id)

      expect(vessel.organizationId).toBe(contextA.organizationId)
      expect(vessel.organizationId).not.toBe(contextB.organizationId)
    })

    it('does not return another organization records', async () => {
      const vessel = await forTenant(contextA).vessel.create({
        data: {
          name: 'OC Isolation Probe B',
          type: 'AHTS',
          flag: 'BR',
          organizationId: contextA.organizationId,
        },
      })
      createdIds.push(vessel.id)

      const seenByB = await forTenant(contextB).vessel.findMany()
      expect(seenByB.map((row) => row.id)).not.toContain(vessel.id)

      const seenByA = await forTenant(contextA).vessel.findMany()
      expect(seenByA.map((row) => row.id)).toContain(vessel.id)
    })

    it('cannot reach another organization record by its id', async () => {
      const vessel = await forTenant(contextA).vessel.create({
        data: {
          name: 'OC Isolation Probe C',
          type: 'OSRV',
          flag: 'BR',
          organizationId: contextA.organizationId,
        },
      })
      createdIds.push(vessel.id)

      // Knowing the id is not authorization. This is the IDOR case.
      const stolen = await forTenant(contextB).vessel.findFirst({ where: { id: vessel.id } })
      expect(stolen).toBeNull()
    })

    it('cannot update or delete across organizations', async () => {
      const vessel = await forTenant(contextA).vessel.create({
        data: {
          name: 'OC Isolation Probe D',
          type: 'DSV',
          flag: 'BR',
          organizationId: contextA.organizationId,
        },
      })
      createdIds.push(vessel.id)

      const updated = await forTenant(contextB).vessel.updateMany({
        where: { id: vessel.id },
        data: { name: 'renamed by another tenant' },
      })
      expect(updated.count).toBe(0)

      const deleted = await forTenant(contextB).vessel.deleteMany({ where: { id: vessel.id } })
      expect(deleted.count).toBe(0)

      const intact = await forTenant(contextA).vessel.findFirst({ where: { id: vessel.id } })
      expect(intact?.name).toBe('OC Isolation Probe D')
    })

    it('counts only the caller organization rows', async () => {
      const [countA, countB] = await Promise.all([
        forTenant(contextA).vessel.count(),
        forTenant(contextB).vessel.count(),
      ])
      const total = await testDb.vessel.count()

      expect(countA + countB).toBeLessThanOrEqual(total)
      expect(countB).toBe(0)
    })

    it('refuses operations that cannot carry a tenant filter', async () => {
      // findUnique addresses a row by unique key alone. Rather than silently
      // returning another tenant's row, the layer refuses the call.
      await expect(
        forTenant(contextB).vessel.findUnique({ where: { id: createdIds[0]! } }),
      ).rejects.toThrow(/cannot be tenant-scoped/)
    })
  })
})
