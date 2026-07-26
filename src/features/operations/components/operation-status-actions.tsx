'use client'

import { OperationStatus } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { transitionOperation } from '@/features/operations/actions/operation-actions'
import { label } from '@/lib/domain/operation/transitions'

/**
 * The buttons come from the server's own transition table, so the UI cannot offer
 * a move the action will refuse. It is still checked again on the server: this is
 * a convenience, not the control.
 */
export function OperationStatusActions({
  operationId,
  status,
  nextStatuses,
  canTransition,
  canCancel,
}: {
  operationId: string
  status: OperationStatus
  nextStatuses: OperationStatus[]
  canTransition: boolean
  canCancel: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pendingTarget, setPendingTarget] = useState<OperationStatus | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const permitted = nextStatuses.filter((next) =>
    next === OperationStatus.CANCELLED ? canCancel : canTransition,
  )

  if (permitted.length === 0) {
    return (
      <p className="text-ink-faint text-xs">
        {nextStatuses.length === 0
          ? `${label(status)} is a final status.`
          : 'Your role cannot change this operation.'}
      </p>
    )
  }

  function move(to: OperationStatus) {
    setError(null)

    // Suspending without a reason leaves the history unusable next week, so the
    // note is asked for here rather than rejected by the server.
    let note: string | undefined
    if (to === OperationStatus.SUSPENDED) {
      const reason = window.prompt('Why is this operation being suspended?')?.trim()
      if (!reason) return
      note = reason
    }

    setPendingTarget(to)
    startTransition(async () => {
      const result = await transitionOperation({ id: operationId, to, note })
      setPendingTarget(null)

      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {permitted.map((next) => (
          <Button
            key={next}
            size="sm"
            variant={next === OperationStatus.CANCELLED ? 'danger' : 'primary'}
            disabled={isPending}
            onClick={() => move(next)}
          >
            {isPending && pendingTarget === next ? 'Working…' : label(next)}
          </Button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="bg-critical-soft text-critical rounded px-2 py-1.5 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
