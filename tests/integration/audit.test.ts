import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withAudit } from '@/lib/db/with-audit'

import { contextFor, databaseAvailable, testDb } from '../helpers/db'

describe('audit trail', async () => {
  const available = await databaseAvailable()
  const suite = available ? describe : describe.skip

  suite('with a database', () => {
    let context: ReturnType<typeof contextFor>
    const vesselIds: string[] = []

    beforeAll(async () => {
      const org = await testDb.organization.findUniqueOrThrow({ where: { slug: 'ocean-demo' } })
      context = contextFor(org)
    })

    afterAll(async () => {
      await testDb.auditLog.deleteMany({ where: { entityType: 'VesselTestFixture' } })
      if (vesselIds.length > 0) {
        await testDb.vessel.deleteMany({ where: { id: { in: vesselIds } } })
      }
      await testDb.$disconnect()
    })

    it('writes an audit row for the mutation it wraps', async () => {
      const vessel = await withAudit(
        context,
        (created: { id: string }) => ({
          action: 'vessel.created',
          entityType: 'VesselTestFixture',
          entityId: created.id,
          after: { name: 'OC Audit Probe' },
        }),
        (tx) =>
          tx.vessel.create({
            data: {
              name: 'OC Audit Probe',
              type: 'PSV',
              flag: 'BR',
              organizationId: context.organizationId,
            },
          }),
      )
      vesselIds.push(vessel.id)

      const entry = await testDb.auditLog.findFirst({
        where: { entityType: 'VesselTestFixture', entityId: vessel.id },
      })

      expect(entry).not.toBeNull()
      expect(entry?.action).toBe('vessel.created')
      expect(entry?.actorId).toBe(context.userId)
      expect(entry?.organizationId).toBe(context.organizationId)
    })

    it('leaves nothing behind when the mutation fails', async () => {
      const before = await testDb.auditLog.count({ where: { entityType: 'VesselTestFixture' } })

      await expect(
        withAudit(
          context,
          { action: 'vessel.created', entityType: 'VesselTestFixture', entityId: 'never' },
          async (tx) => {
            await tx.vessel.create({
              data: {
                name: 'OC Rollback Probe',
                type: 'PSV',
                flag: 'BR',
                organizationId: context.organizationId,
              },
            })
            throw new Error('domain rule refused this')
          },
        ),
      ).rejects.toThrow('domain rule refused this')

      // Neither the row nor its audit entry may survive: an audit trail that can
      // disagree with the data is worse than none, because it is trusted.
      const after = await testDb.auditLog.count({ where: { entityType: 'VesselTestFixture' } })
      expect(after).toBe(before)

      const orphan = await testDb.vessel.findFirst({ where: { name: 'OC Rollback Probe' } })
      expect(orphan).toBeNull()
    })

    it('redacts sensitive fields before storing them', async () => {
      const vessel = await withAudit(
        context,
        (created: { id: string }) => ({
          action: 'vessel.created',
          entityType: 'VesselTestFixture',
          entityId: created.id,
          after: { name: 'OC Redaction Probe', password: 'should-never-be-stored' },
        }),
        (tx) =>
          tx.vessel.create({
            data: {
              name: 'OC Redaction Probe',
              type: 'PSV',
              flag: 'BR',
              organizationId: context.organizationId,
            },
          }),
      )
      vesselIds.push(vessel.id)

      const entry = await testDb.auditLog.findFirst({
        where: { entityType: 'VesselTestFixture', entityId: vessel.id },
      })
      const after = entry?.after as Record<string, unknown> | null

      expect(after?.password).toBe('[redacted]')
      expect(JSON.stringify(after)).not.toContain('should-never-be-stored')
    })
  })
})
