import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockWeatherProvider } from '@/providers/weather/mock'
import { createOpenMeteoProvider } from '@/providers/weather/open-meteo'
import { metresToNauticalMiles } from '@/providers/weather/types'
import { ProviderError } from '@/lib/errors'

const at = { latitude: -25.31, longitude: -43.02 }

describe('unit conversion', () => {
  it('converts metres of visibility to nautical miles', () => {
    // Open-Meteo reports visibility in metres. Passing it through would put
    // "33440 NM" on screen, which is roughly one and a half times the equator.
    expect(metresToNauticalMiles(33_440)).toBe(18.1)
    expect(metresToNauticalMiles(1852)).toBe(1)
    expect(metresToNauticalMiles(0)).toBe(0)
  })

  it('keeps absent as absent', () => {
    expect(metresToNauticalMiles(null)).toBeNull()
    expect(metresToNauticalMiles(undefined)).toBeNull()
    expect(metresToNauticalMiles(Number.NaN)).toBeNull()
  })
})

describe('Open-Meteo provider', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Shapes copied from live responses, not invented. */
  const atmosphere = {
    current: {
      time: '2026-07-26T22:00',
      wind_speed_10m: 4.8,
      wind_gusts_10m: 7.2,
      wind_direction_10m: 174,
      temperature_2m: 21.1,
      surface_pressure: 1019,
      precipitation: 0,
      visibility: 33_440,
    },
  }

  const marine = {
    current: {
      time: '2026-07-26T22:00',
      wave_height: 1.72,
      wave_direction: 164,
      wave_period: 9.45,
      swell_wave_height: 1.34,
      swell_wave_period: 8.95,
      swell_wave_direction: 184,
      sea_surface_temperature: 22.9,
    },
  }

  function stubFetch(handler: (url: string) => unknown) {
    vi.stubGlobal('fetch', (input: string | URL) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => handler(String(input)),
      } as Response),
    )
  }

  it('maps both endpoints into one observation, in our units', async () => {
    stubFetch((url) => (url.includes('marine') ? marine : atmosphere))

    const observation = await createOpenMeteoProvider().getCurrentWeather(at)

    expect(observation.windSpeedKn).toBe(4.8)
    expect(observation.windGustKn).toBe(7.2)
    expect(observation.waveHeightM).toBe(1.72)
    expect(observation.swellHeightM).toBe(1.34)
    expect(observation.seaTempC).toBe(22.9)
    // The conversion, end to end.
    expect(observation.visibilityNm).toBe(18.1)
    expect(observation.source).toBe('REAL')
    expect(observation.provider).toBe('open-meteo')
  })

  it('reads the timestamp as UTC', async () => {
    // Open-Meteo returns "2026-07-26T22:00" with no zone marker. Parsed naively it
    // becomes local time, and every observation lands hours off.
    stubFetch((url) => (url.includes('marine') ? marine : atmosphere))

    const observation = await createOpenMeteoProvider().getCurrentWeather(at)
    expect(observation.observedAt.toISOString()).toBe('2026-07-26T22:00:00.000Z')
  })

  it('asks for knots rather than converting wind itself', async () => {
    const urls: string[] = []
    stubFetch((url) => {
      urls.push(url)
      return url.includes('marine') ? marine : atmosphere
    })

    await createOpenMeteoProvider().getCurrentWeather(at)

    expect(urls.some((url) => url.includes('wind_speed_unit=kn'))).toBe(true)
  })

  it('still returns the atmosphere when the marine host fails', async () => {
    // Sea state lives on a different host. Losing it should degrade the
    // observation, not lose the wind as well — and the window evaluation reports
    // the missing metric rather than assuming flat water.
    vi.stubGlobal('fetch', (input: string | URL) => {
      if (String(input).includes('marine')) return Promise.reject(new Error('host down'))
      return Promise.resolve({ ok: true, status: 200, json: async () => atmosphere } as Response)
    })

    const observation = await createOpenMeteoProvider().getCurrentWeather(at)

    expect(observation.windSpeedKn).toBe(4.8)
    expect(observation.waveHeightM).toBeNull()
  })

  it('raises a ProviderError when the forecast host answers badly', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 503, json: async () => ({}) } as Response),
    )

    await expect(createOpenMeteoProvider().getCurrentWeather(at)).rejects.toThrow(ProviderError)
  })

  it('maps the hourly series positionally', async () => {
    stubFetch(() => ({
      hourly: {
        time: ['2026-07-26T00:00', '2026-07-26T01:00', '2026-07-26T02:00'],
        wind_speed_10m: [10, 12, null],
        wind_gusts_10m: [14, 16, 18],
        wind_direction_10m: [180, 185, 190],
        precipitation: [0, 0.2, 0],
        visibility: [24_000, 9_260, null],
      },
    }))

    const forecast = await createOpenMeteoProvider().getForecast(at, 3)

    expect(forecast).toHaveLength(3)
    expect(forecast[0]?.forecastFor.toISOString()).toBe('2026-07-26T00:00:00.000Z')
    expect(forecast[1]?.windSpeedKn).toBe(12)
    expect(forecast[1]?.visibilityNm).toBe(5)
    // A gap in one series must not shift the others.
    expect(forecast[2]?.windSpeedKn).toBeNull()
    expect(forecast[2]?.windGustKn).toBe(18)
  })
})

describe('mock weather provider', () => {
  const fixed = new Date('2026-07-26T12:00:00.000Z')
  const provider = createMockWeatherProvider({ now: () => fixed })

  it('is deterministic for the same point and hour', async () => {
    const first = await provider.getCurrentWeather(at)
    const second = await createMockWeatherProvider({ now: () => fixed }).getCurrentWeather(at)

    expect(first).toEqual(second)
  })

  it('gives different points different weather', async () => {
    const here = await provider.getCurrentWeather(at)
    const elsewhere = await provider.getCurrentWeather({ latitude: -20.1, longitude: -39.4 })

    expect(here.windSpeedKn).not.toBe(elsewhere.windSpeedKn)
  })

  it('stays within plausible offshore ranges over three days', async () => {
    // A simulator producing 90-knot winds or negative wave heights would make the
    // whole demo unbelievable, and would exercise the window rules dishonestly.
    const forecast = await provider.getForecast(at, 72)
    const marine = await provider.getMarineForecast(at, 72)

    for (const point of forecast) {
      expect(point.windSpeedKn!).toBeGreaterThan(0)
      expect(point.windSpeedKn!).toBeLessThan(45)
      expect(point.windGustKn!).toBeGreaterThanOrEqual(point.windSpeedKn!)
      expect(point.visibilityNm!).toBeGreaterThan(0)
    }

    for (const point of marine) {
      expect(point.waveHeightM!).toBeGreaterThan(0)
      expect(point.waveHeightM!).toBeLessThan(8)
      expect(point.swellHeightM!).toBeLessThanOrEqual(point.waveHeightM!)
    }
  })

  it('labels everything simulated', async () => {
    expect((await provider.getCurrentWeather(at)).source).toBe('SIMULATED')
    expect((await provider.getForecast(at, 2)).every((p) => p.source === 'SIMULATED')).toBe(true)
  })

  it('returns hourly points on the hour', async () => {
    const forecast = await provider.getForecast(at, 4)

    expect(forecast).toHaveLength(4)
    for (const point of forecast) {
      expect(point.forecastFor.getUTCMinutes()).toBe(0)
      expect(point.forecastFor.getUTCSeconds()).toBe(0)
    }
  })
})
