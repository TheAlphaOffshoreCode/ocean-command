import Link from 'next/link'
import { Waves } from 'lucide-react'

import { UserMenu } from '@/components/shell/user-menu'
import { countAlerts } from '@/features/alerts/queries/list-alerts'
import { NAVIGATION } from '@/config/navigation'
import { can } from '@/lib/auth/authorize'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { cn } from '@/lib/utils'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  // The real gate. Middleware only sees a cookie, and a cookie is not a session.
  const ctx = await requireTenantContext()

  // Navigation is filtered by permission, so a Viewer never sees Administration.
  // This only *reflects* authorization — every action is checked again on the
  // server, because a hidden button stops nobody who can type a URL.
  const items = NAVIGATION.filter((item) => can(ctx, item.permission))

  // Counting query, not a list: the badge is on every page in the product, so it
  // must never become the reason a page is slow.
  const alerts = can(ctx, 'alert:read')
    ? await countAlerts(ctx)
    : { open: 0, unread: 0, critical: 0, high: 0 }

  return (
    <div className="min-h-dvh">
      <header className="border-line bg-surface-raised sticky top-0 z-40 border-b">
        <div className="flex h-14 items-center gap-4 px-4">
          <Link href="/command-center" className="flex shrink-0 items-center gap-2">
            <Waves className="text-accent size-5" aria-hidden />
            <span className="text-ink text-sm font-semibold tracking-tight">Ocean Command</span>
          </Link>

          <span className="bg-line hidden h-6 w-px sm:block" aria-hidden />

          <span className="text-ink-muted hidden truncate text-xs sm:block">
            {ctx.organizationName}
          </span>

          {ctx.isDemo ? (
            // Persistent, not a one-time toast. Simulated data presented as real
            // is the one mistake this domain does not forgive.
            <span className="bg-attention-soft text-attention rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
              Demo data
            </span>
          ) : null}

          <div className="ml-auto">
            <UserMenu
              name={ctx.userName}
              email={ctx.userEmail}
              role={ctx.role}
              organization={ctx.organizationName}
            />
          </div>
        </div>
      </header>

      <div className="flex">
        <nav aria-label="Modules" className="border-line hidden w-56 shrink-0 border-r lg:block">
          <ul className="space-y-0.5 p-3">
            {items.map((item) => {
              const Icon = item.icon
              const available = 'href' in item

              return (
                <li key={item.label}>
                  {available ? (
                    <Link
                      href={item.href}
                      title={item.question}
                      className={cn(
                        'text-ink hover:bg-surface-overlay flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                      {item.label === 'Alerts' && alerts.open > 0 ? (
                        <span
                          className={cn(
                            'numeric ml-auto rounded px-1.5 text-[10px] font-semibold',
                            alerts.critical > 0
                              ? 'bg-critical-soft text-critical'
                              : 'bg-attention-soft text-attention',
                          )}
                          // The count an operator acts on is the open one; critical
                          // colours it rather than adding a second number.
                          title={`${alerts.open} open, ${alerts.critical} critical`}
                        >
                          {alerts.open}
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <span
                      title={`${item.question} — delivered in phase ${item.phase}`}
                      className="text-ink-faint flex cursor-default items-center gap-2.5 rounded px-2.5 py-2 text-sm"
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                      <span className="numeric border-line ml-auto rounded border px-1 text-[10px]">
                        P{item.phase}
                      </span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
