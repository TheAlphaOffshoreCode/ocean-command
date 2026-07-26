'use server'

import { revalidatePath } from 'next/cache'

import { authorize } from '@/lib/auth/authorize'
import { getTenantContext } from '@/lib/auth/tenant-context'
import { isAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

import { refreshWeather } from '../services/refresh-weather'

export type RefreshResult =
  | { ok: true; observations: number; forecastPoints: number; failures: number }
  | { ok: false; error: string }

export async function refreshWeatherAction(): Promise<RefreshResult> {
  try {
    const ctx = await getTenantContext()
    // Reading weather is open to every role; pulling from the provider costs an
    // external call, so it sits with the roles that operate the system.
    authorize(ctx, 'vessel:status_update')

    const outcome = await refreshWeather(ctx)

    revalidatePath('/weather')
    revalidatePath('/operations')
    revalidatePath('/command-center')

    return {
      ok: true,
      observations: outcome.observations,
      forecastPoints: outcome.forecastPoints,
      failures: outcome.failures.length,
    }
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message }

    const correlationId = crypto.randomUUID()
    logger.error({ err: error, module: 'weather', correlationId }, 'Weather refresh failed')
    return { ok: false, error: `Something went wrong. Reference ${correlationId}.` }
  }
}
