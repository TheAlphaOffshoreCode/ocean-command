import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { countAlerts, listAlerts } from '@/features/alerts/queries/list-alerts'
import { evaluateAlerts } from '@/features/alerts/services/evaluate-alerts'
import { listRisks, riskBands } from '@/features/risk/queries/list-risks'
import { scoreRisk } from '@/lib/domain/risk/risk-engine'

import { contextFor, databaseAvailable, testDb } from '../helpers/db'

describe('alerts', async () => {
  const available = await databaseAvailable()
  const suite = available ? describe : describe.skip

  suite('with a database', () => {
    let demo: ReturnType<typeof contextFor>
    let other: ReturnType<typeof contextFor>

    beforeAll(async () => {
      const [a, b] = await Promise.all([
        testDb.organization.findUniqueOrThrow({ where: { slug: 'ocean-demo' } }),
        testDb.organization.findUniqueOrThrow({ where: { slug: 'northern-marine' } }),
      ])
      demo = contextFor(a)
      other = contextFor(b)
    })

    afterEach(async () => {
      await testDb.alertEvent.deleteMany({})
      await testDb.alert.deleteMany({})
      await testDb.auditLog.deleteMany({ where: { action: 'alerts.evaluated' } })
      await testDb.sequenceCounter.deleteMany({ where: { kind: 'ALERT' } })
    })

    afterAll(() => testDb.$disconnect())

    it('raises alerts from the current state', async () => {
      const outcome = await evaluateAlerts(demo)

      // The seed has late operations and open critical risks, so there is
      // something to raise.
      expect(outcome.raised).toBeGreaterThan(0)

      const alerts = await listAlerts(demo)
      expect(alerts.length).toBe(outcome.raised)
      expect(alerts.every((alert) => alert.code.startsWith('ALT-'))).toBe(true)
    })

    it('produces one alert per condition when evaluated 96 times', async () => {
      // The acceptance criterion for this phase, and the reason the rules are
      // built around a stable key. A rule running every fifteen minutes for a day
      // must leave the panel with the alerts the state justifies — not 96 copies.
      // An alert panel that produces noise is one people learn to ignore, and then
      // a real critical alert scrolls past unread.
      const first = await evaluateAlerts(demo)
      expect(first.raised).toBeGreaterThan(0)

      for (let run = 0; run < 95; run += 1) {
        const outcome = await evaluateAlerts(demo)
        expect(outcome.raised, `run ${run + 2} raised a duplicate`).toBe(0)
      }

      const after = await listAlerts(demo, { limit: 500 })
      expect(after.length).toBe(first.raised)
    })

    it('keeps one alert per source even as the condition worsens', async () => {
      await evaluateAlerts(demo)
      const before = await listAlerts(demo, { limit: 500 })

      // Make an open risk more severe; the rule still points at the same risk.
      const risk = await testDb.risk.findFirstOrThrow({
        where: { organizationId: demo.organizationId, status: 'OPEN', level: 'HIGH' },
      })
      const worse = scoreRisk(5, 5)

      try {
        await testDb.risk.update({
          where: { id: risk.id },
          data: {
            probability: worse.probability,
            impact: worse.impact,
            score: worse.score,
            level: worse.level,
          },
        })

        const second = await evaluateAlerts(demo)
        const after = await listAlerts(demo, { limit: 500 })

        expect(second.raised).toBe(0)
        expect(second.updated).toBeGreaterThan(0)
        expect(after.length).toBe(before.length)

        // Updated in place, and escalated.
        const escalated = after.find((alert) => alert.description === risk.title)
        expect(escalated?.severity).toBe('CRITICAL')
      } finally {
        // Put the register back. A test that mutates seeded data and walks away
        // leaves the next reader — human or test — looking at a database that
        // disagrees with the seed, and this one did exactly that: the risk page
        // showed three criticals where the seed has one.
        await testDb.risk.update({
          where: { id: risk.id },
          data: {
            probability: risk.probability,
            impact: risk.impact,
            score: risk.score,
            level: risk.level,
          },
        })
      }
    })

    it('resolves an alert automatically when its condition clears', async () => {
      // Uses a risk of its own rather than the seeded register. An earlier version
      // closed every risk and then reopened them all, which quietly turned the
      // seed's CLOSED and ACCEPTED rows into OPEN ones — and made a later test in
      // this file pass or fail depending on the order it ran in.
      const scored = scoreRisk(5, 5)
      const probe = await testDb.risk.create({
        data: {
          organizationId: demo.organizationId,
          code: 'RSK-2099-0001',
          title: 'Auto-resolution probe',
          description: 'Raised, then cleared, to prove the alert closes itself.',
          category: 'OPERATIONAL',
          probability: scored.probability,
          impact: scored.impact,
          score: scored.score,
          level: scored.level,
          status: 'OPEN',
        },
      })

      try {
        await evaluateAlerts(demo)

        // Matched on the code, which the rule puts in the alert title. Matching on
        // the description was wrong: the rule uses the risk's *title* there.
        const raised = (await listAlerts(demo, { limit: 500 })).find((alert) =>
          alert.title.includes(probe.code),
        )
        expect(raised?.severity).toBe('CRITICAL')

        await testDb.risk.update({ where: { id: probe.id }, data: { status: 'CLOSED' } })

        const outcome = await evaluateAlerts(demo)
        expect(outcome.autoResolved).toBeGreaterThanOrEqual(1)

        const stillOpen = (await listAlerts(demo, { openOnly: true, limit: 500 })).find((alert) =>
          alert.title.includes(probe.code),
        )
        // An alert panel full of conditions that ended yesterday is the same noise
        // problem from the other direction.
        expect(stillOpen).toBeUndefined()
      } finally {
        await testDb.risk.delete({ where: { id: probe.id } })
      }
    })

    it('raises nothing for an organization with no operations or risks', async () => {
      const outcome = await evaluateAlerts(other)

      expect(outcome.raised).toBe(0)
      expect(await listAlerts(other)).toEqual([])
    })

    it('does not leak alerts between organizations', async () => {
      await evaluateAlerts(demo)

      expect(await listAlerts(other, { limit: 500 })).toEqual([])
      expect(await countAlerts(other)).toEqual({ open: 0, unread: 0, critical: 0, high: 0 })
      expect((await countAlerts(demo)).open).toBeGreaterThan(0)
    })

    it('counts open alerts for the shell badge without listing them', async () => {
      await evaluateAlerts(demo)

      const counts = await countAlerts(demo)
      const listed = await listAlerts(demo, { openOnly: true, limit: 500 })

      expect(counts.open).toBe(listed.length)
      expect(counts.unread).toBe(listed.filter((alert) => alert.status === 'UNREAD').length)
    })

    it('sorts worst first, because that is how a panel is read', async () => {
      await evaluateAlerts(demo)
      const alerts = await listAlerts(demo, { limit: 500 })

      const rank = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
      for (let index = 1; index < alerts.length; index += 1) {
        expect(rank[alerts[index - 1]!.severity]).toBeGreaterThanOrEqual(
          rank[alerts[index]!.severity],
        )
      }
    })
  })
})

describe('risk register', async () => {
  const available = await databaseAvailable()
  const suite = available ? describe : describe.skip

  suite('with a database', () => {
    let demo: ReturnType<typeof contextFor>
    let other: ReturnType<typeof contextFor>

    beforeAll(async () => {
      const [a, b] = await Promise.all([
        testDb.organization.findUniqueOrThrow({ where: { slug: 'ocean-demo' } }),
        testDb.organization.findUniqueOrThrow({ where: { slug: 'northern-marine' } }),
      ])
      demo = contextFor(a)
      other = contextFor(b)
    })

    afterAll(() => testDb.$disconnect())

    it('lists the seeded register worst first', async () => {
      const risks = await listRisks(demo)

      expect(risks.length).toBeGreaterThanOrEqual(12)
      for (let index = 1; index < risks.length; index += 1) {
        expect(risks[index - 1]!.score).toBeGreaterThanOrEqual(risks[index]!.score)
      }
    })

    it('stores a score that agrees with the engine', async () => {
      // The database CHECK enforces score = probability x impact; this checks the
      // band agrees too, which SQL cannot express.
      for (const risk of await listRisks(demo)) {
        const scored = scoreRisk(risk.probability, risk.impact, await riskBands(demo))
        expect(risk.score, risk.code).toBe(scored.score)
        expect(risk.level, risk.code).toBe(scored.level)
      }
    })

    it('shows another organization an empty register', async () => {
      expect(await listRisks(other)).toEqual([])
    })

    it('rejects a score the database knows is wrong', async () => {
      // Belt and braces: the CHECK constraint refuses a row where the stored score
      // disagrees with its axes, whatever the application believed.
      await expect(
        testDb.risk.create({
          data: {
            organizationId: demo.organizationId,
            code: 'RSK-9999-0001',
            title: 'Inconsistent score',
            description: 'probability 2 x impact 2 is not 25',
            category: 'OPERATIONAL',
            probability: 2,
            impact: 2,
            score: 25,
            level: 'CRITICAL',
          },
        }),
      ).rejects.toThrow()
    })
  })
})
