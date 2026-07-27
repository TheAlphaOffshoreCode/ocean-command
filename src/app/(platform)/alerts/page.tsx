import type { Metadata } from 'next'

import { AlertsView } from '@/features/alerts/components/alerts-view'
import { listAlerts } from '@/features/alerts/queries/list-alerts'
import { can } from '@/lib/auth/authorize'
import { requireTenantContext } from '@/lib/auth/tenant-context'

export const metadata: Metadata = { title: 'Alerts' }

export default async function AlertsPage() {
  const ctx = await requireTenantContext()
  const alerts = await listAlerts(ctx, { limit: 200 })

  // Which buttons appear is decided here; whether the action succeeds is decided
  // again on the server. Acknowledge and resolve are deliberately different
  // permissions — see docs/SECURITY.md §4.
  return (
    <AlertsView
      alerts={alerts}
      canAcknowledge={can(ctx, 'alert:acknowledge')}
      canResolve={can(ctx, 'alert:resolve')}
      canEvaluate={can(ctx, 'alert:acknowledge')}
    />
  )
}
