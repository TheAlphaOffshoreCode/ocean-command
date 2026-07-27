import type { Metadata } from 'next'
import { CircleDot } from 'lucide-react'

import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/shared/states'
import { ActivityFeed } from '@/features/operations/components/activity-feed'
import { getActivityFeed } from '@/features/operations/queries/activity-feed'
import { NAVIGATION } from '@/config/navigation'
import { can } from '@/lib/auth/authorize'
import { permissionsForRole } from '@/lib/auth/permissions'
import { requireTenantContext } from '@/lib/auth/tenant-context'

export const metadata: Metadata = { title: 'Command Center' }

export default async function CommandCenterPage() {
  const ctx = await requireTenantContext()
  const permissions = permissionsForRole(ctx.role)
  const activity = await getActivityFeed(ctx, 10)

  // Filtered by permission, exactly like the sidebar. Listing modules the caller
  // cannot open would tell an operator that an administration area exists and
  // would contradict the navigation beside it.
  const pending = NAVIGATION.filter((item) => !('href' in item) && can(ctx, item.permission))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-ink text-xl font-semibold tracking-tight">Command Center</h1>
        <p className="text-ink-muted mt-1 text-sm">
          What needs my attention right now, and can we keep operating?
        </p>
      </div>

      <Panel>
        <PanelHeader
          title="Operational Status"
          description="Derived from weather, asset health, open risks and unresolved alerts"
        />
        <PanelBody>
          {/*
            Three of the four inputs exist now (weather, risks, alerts); asset
            health lands in phase 6. Still no status is claimed: a readiness score
            missing a quarter of its formula is exactly the number someone would
            trust without it deserving to be trusted.
          */}
          <div className="flex items-start gap-3">
            <CircleDot className="text-ink-faint mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-ink text-sm font-medium">Not computable yet</p>
              <p className="text-ink-muted mt-1 max-w-2xl text-xs">
                Weather, open risks and unresolved alerts are all in place. The last input — asset
                health — arrives in phase 6, and the score is only shown once every factor behind it
                is real. Until then this panel says it cannot measure, rather than showing a
                reassuring status nobody computed.
              </p>
            </div>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Activity"
          description="Operation events, newest first"
        />
        <PanelBody className="p-0">
          <ActivityFeed entries={activity} />
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Your access"
            description={`${ctx.role.replace('_', ' ').toLowerCase()} · ${permissions.length} permissions`}
          />
          <PanelBody>
            {/* Real data, and useful: it is the RBAC matrix as this session sees
                it. Signing in as another role visibly changes this list. */}
            <ul className="flex flex-wrap gap-1.5">
              {permissions.map((permission) => (
                <li
                  key={permission}
                  className="border-line text-ink-muted numeric rounded border px-1.5 py-0.5 text-[11px]"
                >
                  {permission}
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Modules" description="Delivered per phase" />
          <PanelBody className="p-0">
            {pending.length === 0 ? (
              <EmptyState title="Every module is available" />
            ) : (
              <ul className="divide-line divide-y">
                {pending.map((item) => (
                  <li key={item.label} className="flex items-center gap-3 px-4 py-2.5">
                    <item.icon className="text-ink-faint size-4 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-ink text-xs font-medium">{item.label}</p>
                      <p className="text-ink-faint truncate text-[11px]">{item.question}</p>
                    </div>
                    <span className="numeric border-line text-ink-faint ml-auto rounded border px-1.5 py-0.5 text-[10px]">
                      Phase {'phase' in item ? item.phase : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  )
}
