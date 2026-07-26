import type { Metadata } from 'next'

import { WeatherView } from '@/features/weather/components/weather-view'
import {
  getLocationConditions,
  weatherOverrides,
} from '@/features/weather/queries/get-conditions'
import { can } from '@/lib/auth/authorize'
import { requireTenantContext } from '@/lib/auth/tenant-context'

export const metadata: Metadata = { title: 'Weather' }

export default async function WeatherPage() {
  const ctx = await requireTenantContext()

  const [byLocation, overrides] = await Promise.all([
    getLocationConditions(ctx),
    weatherOverrides(ctx),
  ])

  // The map is keyed by id, but each entry already carries its own name — a
  // location with no observation yet still has to appear, with its name.
  const locations = [...byLocation.values()]

  return (
    <WeatherView
      locations={locations}
      overrides={overrides}
      canRefresh={can(ctx, 'vessel:status_update')}
    />
  )
}
