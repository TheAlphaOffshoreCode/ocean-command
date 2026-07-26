import { env } from '@/config/env'

import { createMockAISProvider } from './mock-ais-provider'
import type { AISProvider } from './types'

export type { AISProvider, PositionSource, VesselPositionSnapshot } from './types'
export { createMockAISProvider } from './mock-ais-provider'

let instance: AISProvider | undefined

/**
 * The only way application code obtains an AIS provider. Selected once, from
 * validated configuration — nothing above this line knows which implementation
 * it is talking to, which is what makes a real feed a drop-in later.
 */
export function aisProvider(): AISProvider {
  if (!instance) {
    switch (env.AIS_PROVIDER) {
      case 'mock':
        instance = createMockAISProvider()
        break
      default: {
        // Exhaustiveness: adding a provider to the env enum without wiring it
        // here becomes a compile error rather than a runtime surprise.
        const unreachable: never = env.AIS_PROVIDER
        throw new Error(`Unsupported AIS provider: ${String(unreachable)}`)
      }
    }
  }

  return instance
}
