import { z } from 'zod'

/**
 * Environment is parsed once, at module load. A missing or malformed variable
 * fails the boot rather than showing up as `undefined` in production later.
 *
 * Server and client variables are two separate objects on purpose: only what is
 * in `clientEnv` can ever reach the browser, and nothing there is a secret.
 */

const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
    message: 'must be a postgres:// or postgresql:// connection string',
  })

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: postgresUrl,
  DIRECT_DATABASE_URL: postgresUrl.optional(),

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters — generate with: openssl rand -base64 32'),
  BETTER_AUTH_URL: z.string().url(),

  AIS_PROVIDER: z.enum(['mock']).default('mock'),
  WEATHER_PROVIDER: z.enum(['open-meteo', 'mock']).default('open-meteo'),
  AI_PROVIDER: z.enum(['null', 'openai', 'anthropic']).default('null'),

  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  METRICS_TOKEN: z.string().min(16).optional(),
  /** Protects /api/cron/*. Unset in production means those routes refuse to run. */
  CRON_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type ServerEnv = z.infer<typeof serverSchema>

function parseServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env)

  if (!parsed.success) {
    // Print every problem at once. Fixing one variable per restart is miserable.
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${problems}`)
  }

  const value = parsed.data

  // Cross-field rules Zod cannot express field by field.
  if (value.AI_PROVIDER === 'openai' && !value.OPENAI_API_KEY) {
    throw new Error('AI_PROVIDER="openai" requires OPENAI_API_KEY')
  }
  if (value.AI_PROVIDER === 'anthropic' && !value.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER="anthropic" requires ANTHROPIC_API_KEY')
  }

  return value
}

export const env: ServerEnv = parseServerEnv()

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

/**
 * True only when metrics may be served. In production a missing token means the
 * route is never registered, rather than served openly — see SECURITY.md §8.
 */
export const metricsEnabled = !isProduction || env.METRICS_TOKEN !== undefined
