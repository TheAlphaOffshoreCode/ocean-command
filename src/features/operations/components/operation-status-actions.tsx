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
  /** Set when a move needs a reason before it can be sent. */
  const [awaitingReason, setAwaitingReason] = useState<OperationStatus | null>(null)
  const [reason, setReason] = useState('')
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

  function send(to: OperationStatus, note?: string) {
    setError(null)
    setPendingTarget(to)

    startTransition(async () => {
      const result = await transitionOperation({ id: operationId, to, note })
      setPendingTarget(null)

      if (!result.ok) {
        setError(result.error)
        return
      }

      setAwaitingReason(null)
      setReason('')
      router.refresh()
    })
  }

  function onPick(to: OperationStatus) {
    // Suspending and cancelling change the shape of the record enough that the
    // history needs to say why. Asked for inline rather than with window.prompt:
    // a browser dialog cannot be styled, read by the page, or filled by anyone
    // using a keyboard-driven workflow comfortably.
    if (to === OperationStatus.SUSPENDED || to === OperationStatus.CANCELLED) {
      setError(null)
      setAwaitingReason(to)
      return
    }
    send(to)
  }

  if (awaitingReason) {
    const required = awaitingReason === OperationStatus.SUSPENDED

    return (
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = reason.trim()
          if (required && !trimmed) {
            setError('A reason is required to suspend an operation.')
            return
          }
          send(awaitingReason, trimmed || undefined)
        }}
      >
        <label htmlFor="transition-reason" className="text-ink-muted block text-xs">
          Why is this operation being {label(awaitingReason).toLowerCase()}?
          {required ? null : <span className="text-ink-faint"> (optional)</span>}
        </label>
        <textarea
          id="transition-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
          autoFocus
          className="border-line bg-surface text-ink focus:border-accent w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
          placeholder="Goes into the operation's history"
        />

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Working…' : `Confirm ${label(awaitingReason)}`}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setAwaitingReason(null)
              setReason('')
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>

        {error ? (
          <p role="alert" className="bg-critical-soft text-critical rounded px-2 py-1.5 text-xs">
            {error}
          </p>
        ) : null}
      </form>
    )
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
            onClick={() => onPick(next)}
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
