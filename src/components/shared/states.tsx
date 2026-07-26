import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Loading / Empty / Error, as shared components rather than something each page
 * improvises. Every screen has to handle all four states — the fourth being
 * success — and a page that only handles the happy path is a page that breaks
 * on the first bad day.
 */

function Frame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <Frame>
      <Loader2 className="text-ink-faint size-5 animate-spin" aria-hidden />
      <p className="text-ink-muted text-sm" role="status">
        {label}…
      </p>
    </Frame>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Frame>
      <Inbox className="text-ink-faint size-6" aria-hidden />
      <p className="text-ink text-sm font-medium">{title}</p>
      {description ? <p className="text-ink-faint max-w-sm text-xs">{description}</p> : null}
      {action}
    </Frame>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  correlationId,
  action,
}: {
  title?: string
  description?: string
  correlationId?: string
  action?: ReactNode
}) {
  return (
    <Frame>
      <AlertTriangle className="text-critical size-6" aria-hidden />
      <p className="text-ink text-sm font-medium">{title}</p>
      {description ? <p className="text-ink-muted max-w-sm text-xs">{description}</p> : null}
      {/* The id is what connects an operator's screenshot to a log line. */}
      {correlationId ? <p className="text-ink-faint numeric text-xs">ref {correlationId}</p> : null}
      {action}
    </Frame>
  )
}
