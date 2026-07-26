import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { getActivityFeed } from '@/features/operations/queries/activity-feed'
import { getOperation } from '@/features/operations/queries/get-operation'
import { listOperations } from '@/features/operations/queries/list-operations'
import { operationFiltersSchema } from '@/features/operations/schemas/operation'
import {
  nextOperationCode,
  withUniqueCodeRetry,
} from '@/features/operations/services/operation-code'
import { assertVesselAvailable } from '@/features/operations/services/vessel-schedule'
import { forTenant } from '@/lib/db/tenant'
import { parseOperationCode } from '@/lib/domain/operation/code'
import { DomainRuleError } from '@/lib/errors'

import { contextFor, databaseAvailable, testDb } from '../helpers/db'

const HOUR = 60 * 60 * 1000

describe('operations', async () => {
  const available = await databaseAvailable()
  const suite = available ? describe : describe.skip

  suite('with a database', () => {
    let demo: ReturnType<typeof contextFor>
    let other: ReturnType<typeof contextFor>
    let vesselId: string
    const filters = operationFiltersSchema.parse({})
    /** Every test window sits far in the future so it cannot collide with the seed. */
    const base = new Date('2031-03-01T00:00:00.000Z')

    beforeAll(async () => {
      const [a, b] = await Promise.all([
        testDb.organization.findUniqueOrThrow({ where: { slug: 'ocean-demo' } }),
        testDb.organization.findUniqueOrThrow({ where: { slug: 'northern-marine' } }),
      ])
      demo = contextFor(a)
      other = contextFor(b)

      const vessel = await testDb.vessel.findFirstOrThrow({
        where: { organizationId: a.id, name: 'OC Atlantic' },
        select: { id: true },
      })
      vesselId = vessel.id
    })

    afterEach(async () => {
      await testDb.operation.deleteMany({ where: { code: { startsWith: 'OP-2031-' } } })
      // Reset the counter too, so the sequence assertion does not depend on
      // whether this file ran before.
      await testDb.operationCounter.deleteMany({ where: { year: 2031 } })
    })

    afterAll(() => testDb.$disconnect())

    it('lists the seeded operations for its own organization only', async () => {
      const mine = await listOperations(demo, filters)
      const theirs = await listOperations(other, filters)

      expect(mine.total).toBeGreaterThanOrEqual(20)
      expect(theirs.total).toBe(0)
      expect(theirs.items).toEqual([])
      expect(await getActivityFeed(other)).toEqual([])
    })

    it('refuses to open an operation belonging to another organization', async () => {
      const [ours] = (await listOperations(demo, filters)).items

      expect(await getOperation(other, ours!.id)).toBeNull()
      expect(await getOperation(demo, ours!.id)).not.toBeNull()
    })

    it('offers next statuses from the same table the server enforces', async () => {
      const planned = (await listOperations(demo, { ...filters, status: 'PLANNED' })).items[0]
      const detail = await getOperation(demo, planned!.id)

      expect(detail?.nextStatuses).toEqual(['PREPARING', 'CANCELLED'])

      const completed = (await listOperations(demo, { ...filters, status: 'COMPLETED' })).items[0]
      const done = await getOperation(demo, completed!.id)

      expect(done?.nextStatuses).toEqual([])
    })

    it('hands out unique codes when twenty operations are created at once', async () => {
      // The test that changed the implementation. With a read-the-maximum-and-retry
      // allocator this failed at ten callers: every retry round only lets one
      // through, so the worst case needs as many attempts as there are callers.
      // The counter row allocates in a single statement, so twenty concurrent
      // creates get twenty contiguous codes and the retry never fires.
      const created = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          withUniqueCodeRetry(() =>
            forTenant(demo).$transaction(async (tx) => {
              const code = await nextOperationCode(tx, demo.organizationId, 2031)
              return tx.operation.create({
                data: {
                  code,
                  name: `Concurrent probe ${index}`,
                  type: 'SURVEY',
                  organizationId: demo.organizationId,
                  plannedStart: new Date(base.getTime() + index * 48 * HOUR),
                  plannedEnd: new Date(base.getTime() + index * 48 * HOUR + 6 * HOUR),
                },
              })
            }),
          ),
        ),
      )

      const codes = created.map((operation) => operation.code)
      expect(new Set(codes).size).toBe(20)

      // Contiguous from 1: the counter allocates, so there are no gaps and no
      // retries. Twenty concurrent callers, not ten — the retry-only version could
      // not even manage ten.
      const sequences = codes.map((code) => parseOperationCode(code)!.sequence).sort((a, b) => a - b)
      expect(sequences).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
    })

    it('starts the counter above codes that already exist', async () => {
      // The seed writes OP-2026-0001..0020 straight into the table and never
      // touches the counter; a restored backup behaves the same way. Before this
      // was handled, the first operation created through the product asked for
      // sequence 1, collided with seeded data, and burned its retries.
      const year = 2033
      await testDb.operationCounter.deleteMany({ where: { year } })

      await forTenant(demo).operation.create({
        data: {
          code: `OP-${year}-0040`,
          name: 'Pre-existing, allocated by something else',
          type: 'SURVEY',
          organizationId: demo.organizationId,
          plannedStart: new Date(`${year}-01-01T00:00:00Z`),
          plannedEnd: new Date(`${year}-01-01T06:00:00Z`),
        },
      })

      try {
        const allocated = await forTenant(demo).$transaction((tx) =>
          nextOperationCode(tx, demo.organizationId, year),
        )
        expect(allocated).toBe(`OP-${year}-0041`)

        // And from then on it is a plain increment, not another table scan.
        const next = await forTenant(demo).$transaction((tx) =>
          nextOperationCode(tx, demo.organizationId, year),
        )
        expect(next).toBe(`OP-${year}-0042`)
      } finally {
        await testDb.operation.deleteMany({ where: { code: { startsWith: `OP-${year}-` } } })
        await testDb.operationCounter.deleteMany({ where: { year } })
      }
    })

    it('refuses to commit one vessel to two overlapping operations', async () => {
      const start = new Date(base.getTime() + 200 * HOUR)
      const end = new Date(start.getTime() + 12 * HOUR)

      await forTenant(demo).operation.create({
        data: {
          code: 'OP-2031-9001',
          name: 'Holds the vessel',
          type: 'CARGO_OPERATION',
          status: 'PLANNED',
          vesselId,
          organizationId: demo.organizationId,
          plannedStart: start,
          plannedEnd: end,
        },
      })

      const overlapping = forTenant(demo).$transaction((tx) =>
        assertVesselAvailable(tx, {
          vesselId,
          window: { start: new Date(start.getTime() + 6 * HOUR), end: new Date(end.getTime() + 6 * HOUR) },
        }),
      )

      await expect(overlapping).rejects.toThrow(DomainRuleError)
      // The refusal names the operation, so an operator can act without hunting.
      await expect(overlapping).rejects.toThrow(/OP-2031-9001/)
    })

    it('allows back-to-back operations on the same vessel', async () => {
      const start = new Date(base.getTime() + 400 * HOUR)
      const end = new Date(start.getTime() + 12 * HOUR)

      await forTenant(demo).operation.create({
        data: {
          code: 'OP-2031-9002',
          name: 'Morning job',
          type: 'CARGO_OPERATION',
          status: 'PLANNED',
          vesselId,
          organizationId: demo.organizationId,
          plannedStart: start,
          plannedEnd: end,
        },
      })

      await expect(
        forTenant(demo).$transaction((tx) =>
          assertVesselAvailable(tx, {
            vesselId,
            window: { start: end, end: new Date(end.getTime() + 8 * HOUR) },
          }),
        ),
      ).resolves.toBeUndefined()
    })

    it('ignores completed and cancelled operations when checking availability', async () => {
      const start = new Date(base.getTime() + 600 * HOUR)
      const end = new Date(start.getTime() + 12 * HOUR)

      await forTenant(demo).operation.create({
        data: {
          code: 'OP-2031-9003',
          name: 'Finished job',
          type: 'CARGO_OPERATION',
          status: 'COMPLETED',
          vesselId,
          organizationId: demo.organizationId,
          plannedStart: start,
          plannedEnd: end,
        },
      })

      // A vessel is not busy because of something it already finished.
      await expect(
        forTenant(demo).$transaction((tx) =>
          assertVesselAvailable(tx, { vesselId, window: { start, end } }),
        ),
      ).resolves.toBeUndefined()
    })

    it('does not see another organization operations when checking a vessel', async () => {
      const start = new Date(base.getTime() + 800 * HOUR)
      const end = new Date(start.getTime() + 12 * HOUR)

      await forTenant(demo).operation.create({
        data: {
          code: 'OP-2031-9004',
          name: 'Ours',
          type: 'CARGO_OPERATION',
          status: 'PLANNED',
          vesselId,
          organizationId: demo.organizationId,
          plannedStart: start,
          plannedEnd: end,
        },
      })

      // Same vessel id, different tenant: the scheduling query must find nothing,
      // or one organization's schedule would leak through a conflict message.
      await expect(
        forTenant(other).$transaction((tx) =>
          assertVesselAvailable(tx, { vesselId, window: { start, end } }),
        ),
      ).resolves.toBeUndefined()
    })

    it('marks an operation delayed when it should have started and has not', async () => {
      const pastStart = new Date(Date.now() - 4 * HOUR)

      const operation = await forTenant(demo).operation.create({
        data: {
          code: 'OP-2031-9005',
          name: 'Should have started',
          type: 'SURVEY',
          status: 'READY',
          organizationId: demo.organizationId,
          plannedStart: pastStart,
          plannedEnd: new Date(pastStart.getTime() + 20 * HOUR),
        },
      })

      const listed = (await listOperations(demo, { ...filters, search: 'Should have started' }))
        .items[0]

      expect(listed?.id).toBe(operation.id)
      expect(listed?.isDelayed).toBe(true)
    })
  })
})
