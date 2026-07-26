import type { Metadata } from 'next'

import { FleetView } from '@/features/fleet/components/fleet-view'
import { listFleetOverview } from '@/features/fleet/queries/list-vessels'
import { can } from '@/lib/auth/authorize'
import { requireTenantContext } from '@/lib/auth/tenant-context'

export const metadata: Metadata = { title: 'Fleet' }

export default async function FleetPage() {
  const ctx = await requireTenantContext()
  const vessels = await listFleetOverview(ctx)

  // The button is hidden from roles that cannot sync — and the action checks the
  // same permission again server-side, because hiding a control stops nobody.
  return <FleetView vessels={vessels} canSync={can(ctx, 'vessel:status_update')} />
}
