import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The container everything on a command surface sits in. Named Panel rather than
 * Card because that is what it is on this product: an instrument panel, not a
 * marketing card.
 */
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-surface-raised border-line rounded-panel border', className)}
      {...props}
    />
  )
}

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b px-4 py-3">
      <div>
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">{title}</h2>
        {description ? <p className="text-ink-faint mt-0.5 text-xs">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}
