import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getVessel } from '@/features/fleet/queries/get-vessel'
import { listFleetOverview, listVessels } from '@/features/fleet/queries/list-vessels'
import { fleetFiltersSchema } from '@/features/fleet/schemas/vessel'

import { contextFor, databaseAvailable, testDb } from '../helpers/db'

/**
 * Isolation test for the fleet query module. One of these exists per query module
 * — see docs/adr/005-multi-tenancy.md — because the filter being applied is an
 * application-level guarantee, and guarantees that are not tested are hopes.
 */
describe('fleet queries', async () => {
  const available = await databaseAvailable()
  const suite = available ? describe : describe.skip

  suite('with a database', () => {
    let demo: ReturnType<typeof contextFor>
    let other: ReturnType<typeof contextFor>
    const filters = fleetFiltersSchema.parse({})

    beforeAll(async () => {
      const [a, b] = await Promise.all([
        testDb.organization.findUniqueOrThrow({ where: { slug: 'ocean-demo' } }),
        testDb.organization.findUniqueOrThrow({ where: { slug: 'northern-marine' } }),
      ])
      demo = contextFor(a)
      other = contextFor(b)
    })

    afterAll(() => testDb.$disconnect())

    it('keeps vessels without a position in the fleet list', async () => {
      // The map skips them; the list must not. Filtering on having a position
      // made a vessel that never reported vanish from its own fleet.
      const overview = await listFleetOverview(demo)
      const titan = overview.find((vessel) => vessel.name === 'OC Titan')

      expect(titan).toBeDefined()
      expect(overview.length).toBeGreaterThanOrEqual(8)
    })

    it('lists the seeded fleet for its own organization', async () => {
      const page = await listVessels(demo, filters)

      expect(page.total).toBeGreaterThanOrEqual(8)
      expect(page.items.map((vessel) => vessel.name)).toContain('OC Atlantic')
      expect(page.page).toBe(1)
    })

    it('shows another organization an empty fleet', async () => {
      const page = await listVessels(other, filters)

      expect(page.total).toBe(0)
      expect(page.items).toEqual([])
      expect(await listFleetOverview(other)).toEqual([])
    })

    it('refuses to open a vessel belonging to another organization', async () => {
      const [ours] = (await listVessels(demo, filters)).items
      expect(ours).toBeDefined()

      // Holding the id is not authorization; the page turns this null into a 404.
      expect(await getVessel(other, ours!.id)).toBeNull()
      expect(await getVessel(demo, ours!.id)).not.toBeNull()
    })

    it('filters by type and status inside the tenant', async () => {
      const psv = await listVessels(demo, { ...filters, type: 'PSV' })
      expect(psv.items.every((vessel) => vessel.type === 'PSV')).toBe(true)
      expect(psv.total).toBeGreaterThan(0)

      const maintenance = await listVessels(demo, { ...filters, status: 'MAINTENANCE' })
      expect(maintenance.items.every((vessel) => vessel.status === 'MAINTENANCE')).toBe(true)
    })

    it('searches by name and by IMO', async () => {
      const byName = await listVessels(demo, { ...filters, search: 'sentinel' })
      expect(byName.items.map((vessel) => vessel.name)).toContain('OC Sentinel')

      const target = byName.items[0]
      expect(target?.imo).toBeTruthy()

      const byImo = await listVessels(demo, { ...filters, search: target!.imo! })
      expect(byImo.items.map((vessel) => vessel.id)).toContain(target!.id)
    })

    it('paginates rather than returning the whole table', async () => {
      const firstPage = await listVessels(demo, { ...filters, pageSize: 3, page: 1 })
      const secondPage = await listVessels(demo, { ...filters, pageSize: 3, page: 2 })

      expect(firstPage.items).toHaveLength(3)
      expect(firstPage.total).toBeGreaterThan(3)

      const overlap = firstPage.items
        .map((vessel) => vessel.id)
        .filter((id) => secondPage.items.some((vessel) => vessel.id === id))
      expect(overlap).toEqual([])
    })

    it('excludes archived vessels from the fleet view', async () => {
      const vessel = await testDb.vessel.create({
        data: {
          name: 'OC Archived Probe',
          type: 'PSV',
          flag: 'BR',
          organizationId: demo.organizationId,
          archivedAt: new Date(),
        },
      })

      try {
        const page = await listVessels(demo, { ...filters, search: 'Archived Probe' })
        expect(page.items).toEqual([])
        expect(await getVessel(demo, vessel.id)).toBeNull()
      } finally {
        await testDb.vessel.delete({ where: { id: vessel.id } })
      }
    })
  })
})
