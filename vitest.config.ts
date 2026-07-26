import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one database, so they must not race each other.
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      // Never the real providers in tests. Two reasons, and the first one bit:
      // a suite that talks to Open-Meteo is flaky (it failed twice, then passed
      // with no code change), and it also means CI hammers somebody's free service
      // on every push. The deterministic mocks are what the assertions want anyway.
      WEATHER_PROVIDER: 'mock',
      AIS_PROVIDER: 'mock',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
})
