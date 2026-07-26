import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  getLocationConditions,
  getOperationWeather,
  weatherOverrides,
} from '@/features/weather/queries/get-conditions'
import { refreshWeather } from '@/features/weather/services/refresh-weather'
import { forTenant } from '@/lib/db/tenant'

import { contextFor, databaseAvailable, testDb } from '../helpers/db'

/**
 * Weather is stored, and verdicts are derived from what is stored — never stored
 * themselves. These tests cover the round trip and the tenant boundary.
 */
describe('weather', async () => {
  const available = await databaseAvailable()
  const suite = available ? describe : describe.skip

  suite('with a database', () => {
    let demo: ReturnType<typeof contextFor>
    let other: ReturnType<typeof contextFor>
    let locationId: string
    let locationName: string

    beforeAll(async () => {
      const [a, b] = await Promise.all([
        testDb.organization.findUniqueOrThrow({ where: { slug: 'ocean-demo' } }),
        testDb.organization.findUniqueOrThrow({ where: { slug: 'northern-marine' } }),
      ])
      demo = contextFor(a)
      other = contextFor(b)

      const location = await testDb.location.findFirstOrThrow({
        where: { organizationId: a.id },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      locationId = location.id
      locationName = location.name
    })

    afterEach(async () => {
      // Includes what refreshWeather itself wrote, so one test cannot leave data
      // that makes the next one pass for the wrong reason.
      await testDb.weatherObservation.deleteMany({})
      await testDb.weatherForecast.deleteMany({})
      await testDb.auditLog.deleteMany({ where: { action: 'weather.refreshed' } })
    })

    afterAll(() => testDb.$disconnect())

    /** Conditions that are calm for anchor handling and unsafe for divers. */
    async function storeObservation(waveHeightM: number, windSpeedKn: number, observedAt: Date) {
      await forTenant(demo).weatherObservation.create({
        data: {
          organizationId: demo.organizationId,
          locationId,
          observedAt,
          windSpeedKn,
          windGustKn: windSpeedKn * 1.3,
          waveHeightM,
          visibilityNm: 8,
          source: 'SIMULATED',
          provider: 'test',
        },
      })
    }

    it('stores conditions and a forecast through the refresh service', async () => {
      // Exercises the *write* path, which the query tests do not. The first version
      // of this service used upsert, which the tenant-scoped client refuses — and
      // no test caught it, because every test wrote its fixtures with create.
      const before = new Date()
      const outcome = await refreshWeather(demo)

      expect(outcome.failures).toEqual([])
      expect(outcome.observations).toBe(outcome.locations)
      expect(outcome.forecastPoints).toBeGreaterThan(0)

      const entry = (await getLocationConditions(demo)).get(locationId)
      expect(entry?.conditions).not.toBeNull()
      expect(entry?.conditions?.observedAt.getTime()).toBeLessThanOrEqual(Date.now())
      expect(entry?.forecast.length).toBeGreaterThan(0)

      // And it is auditable, once per refresh rather than once per forecast hour.
      const audit = await testDb.auditLog.findFirst({
        where: { action: 'weather.refreshed', createdAt: { gte: before } },
      })
      expect(audit).not.toBeNull()
    })

    it('is idempotent within the same hour', async () => {
      await refreshWeather(demo)
      const afterFirst = await testDb.weatherObservation.count({
        where: { organizationId: demo.organizationId },
      })

      await refreshWeather(demo)
      const afterSecond = await testDb.weatherObservation.count({
        where: { organizationId: demo.organizationId },
      })

      // Same hour, same provider: the row is updated, not stacked.
      expect(afterSecond).toBe(afterFirst)
    })

    it('keeps every location visible, even without an observation', async () => {
      const byLocation = await getLocationConditions(demo)

      expect(byLocation.size).toBeGreaterThanOrEqual(6)
      // A location with no reading still has to appear, with its name — otherwise
      // a field silently vanishes from the weather page.
      for (const entry of byLocation.values()) {
        expect(entry.locationName).toBeTruthy()
      }
    })

    it('shows another organization nothing', async () => {
      await storeObservation(1.2, 12, new Date())

      const theirs = await getLocationConditions(other)
      for (const entry of theirs.values()) {
        expect(entry.conditions).toBeNull()
      }
      expect([...theirs.keys()]).not.toContain(locationId)
    })

    it('reads back the latest observation for a location', async () => {
      const older = new Date('2026-07-26T06:00:00.000Z')
      const newer = new Date('2026-07-26T09:00:00.000Z')

      await storeObservation(1.0, 10, older)
      await storeObservation(2.4, 24, newer)

      const entry = (await getLocationConditions(demo)).get(locationId)

      expect(entry?.conditions?.observedAt.toISOString()).toBe(newer.toISOString())
      expect(entry?.conditions?.waveHeightM).toBe(2.4)
      expect(entry?.locationName).toBe(locationName)
    })

    it('gives the same sea a different verdict per operation type', async () => {
      // 2.4 m and 24 kn: comfortable for anchor handling, unsafe for divers. This
      // is the whole reason the verdict takes the operation type.
      await storeObservation(2.4, 24, new Date())

      const overrides = await weatherOverrides(demo)
      const conditions = (await getLocationConditions(demo)).get(locationId)!.conditions!

      const { evaluateWeatherWindow } = await import('@/lib/domain/weather/weather-window')
      const metrics = {
        windSpeedKn: conditions.windSpeedKn,
        windGustKn: conditions.windGustKn,
        waveHeightM: conditions.waveHeightM,
        visibilityNm: conditions.visibilityNm,
      }

      expect(
        evaluateWeatherWindow('DIVING_OPERATION', metrics, conditions.observedAt, overrides).status,
      ).toBe('UNSAFE')
      expect(
        evaluateWeatherWindow('ANCHOR_HANDLING', metrics, conditions.observedAt, overrides).status,
      ).toBe('MARGINAL')
    })

    it('derives the verdict for an operation from its own location and type', async () => {
      await storeObservation(2.9, 30, new Date())

      const weather = await getOperationWeather(demo, {
        locationId,
        type: 'CREW_TRANSFER',
        plannedStart: new Date(),
      })

      expect(weather?.verdict.status).toBe('UNSAFE')
      // Named metrics, not just a verdict.
      expect(weather?.verdict.breaches.map((breach) => breach.metric)).toContain('windSpeedKn')
      expect(weather?.conditions.locationName).toBe(locationName)
    })

    it('reports a missing verdict as missing, never as favourable', async () => {
      // No observation stored for this location in this test.
      const weather = await getOperationWeather(demo, {
        locationId,
        type: 'CREW_TRANSFER',
        plannedStart: new Date(),
      })

      expect(weather).toBeNull()
    })

    it('has no verdict for an operation with no location', async () => {
      expect(
        await getOperationWeather(demo, {
          locationId: null,
          type: 'SURVEY',
          plannedStart: new Date(),
        }),
      ).toBeNull()
    })

    it('says when the window changes, from the stored forecast', async () => {
      const now = new Date('2026-07-26T12:00:00.000Z')
      await storeObservation(1.0, 10, now)

      const db = forTenant(demo)
      // Calm for three hours, then over the crew-transfer limit.
      for (const [index, wind] of [10, 12, 14, 27].entries()) {
        await db.weatherForecast.create({
          data: {
            organizationId: demo.organizationId,
            locationId,
            forecastFor: new Date(now.getTime() + (index + 1) * 3_600_000),
            issuedAt: now,
            windSpeedKn: wind,
            windGustKn: wind * 1.3,
            waveHeightM: 1.0,
            visibilityNm: 8,
            source: 'SIMULATED',
            provider: 'test',
          },
        })
      }

      const weather = await getOperationWeather(
        demo,
        { locationId, type: 'CREW_TRANSFER', plannedStart: now },
        { now },
      )

      expect(weather?.verdict.status).toBe('FAVORABLE')
      // "Unsafe from 16:00" is what lets a coordinator decide whether to start.
      expect(weather?.changesAt?.status).toBe('UNSAFE')
      expect(weather?.changesAt?.at.toISOString()).toBe('2026-07-26T16:00:00.000Z')
    })

    it('only returns forecast hours from now onwards', async () => {
      const now = new Date('2026-07-26T12:00:00.000Z')
      const db = forTenant(demo)

      for (const offset of [-2, -1, 1, 2]) {
        await db.weatherForecast.create({
          data: {
            organizationId: demo.organizationId,
            locationId,
            forecastFor: new Date(now.getTime() + offset * 3_600_000),
            issuedAt: now,
            windSpeedKn: 10,
            source: 'SIMULATED',
            provider: 'test',
          },
        })
      }

      const entry = (await getLocationConditions(demo, { now })).get(locationId)

      // A chart of hours that have already passed is a chart of the past pretending
      // to be a forecast.
      expect(entry?.forecast).toHaveLength(2)
      expect(entry?.forecast.every((point) => point.forecastFor >= now)).toBe(true)
    })
  })
})
