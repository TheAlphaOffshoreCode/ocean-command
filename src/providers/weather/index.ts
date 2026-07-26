import { env } from '@/config/env'

import { createMockWeatherProvider } from './mock'
import { createOpenMeteoProvider } from './open-meteo'
import type { WeatherProvider } from './types'

export type {
  WeatherForecastPoint,
  WeatherObservationSnapshot,
  WeatherProvider,
  WeatherSource,
} from './types'
export { createMockWeatherProvider } from './mock'
export { createOpenMeteoProvider } from './open-meteo'

let instance: WeatherProvider | undefined

/**
 * The only way application code obtains a weather provider. Nothing above this
 * line knows whether it is talking to Open-Meteo or the simulator.
 */
export function weatherProvider(): WeatherProvider {
  if (!instance) {
    switch (env.WEATHER_PROVIDER) {
      case 'open-meteo':
        instance = createOpenMeteoProvider()
        break
      case 'mock':
        instance = createMockWeatherProvider()
        break
      default: {
        // Adding a provider to the env enum without wiring it here is a compile
        // error rather than a runtime surprise.
        const unreachable: never = env.WEATHER_PROVIDER
        throw new Error(`Unsupported weather provider: ${String(unreachable)}`)
      }
    }
  }

  return instance
}
