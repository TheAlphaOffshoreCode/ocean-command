'use client'

import { VesselStatus } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { updateVesselStatus } from '@/features/fleet/actions/vessel-actions'

const LABELS: Record<VesselStatus, string> = {
  IN_OPERATION: 'In operation',
  IN_TRANSIT: 'In transit',
  STANDBY: 'Standby',
  AT_PORT: 'At port',
  AVAILABLE: 'Available',
  MAINTENANCE: 'Maintenance',
  UNAVAILABLE: 'Unavailable',
}

/**
 * Status reporting is the operator's job at 03:00, so it is one control and one
 * click — not a form behind an edit screen they do not have permission to open.
 */
export function VesselStatusControl({
  vesselId,
  status,
}: {
  vesselId: string
  status: VesselStatus
}) {
  const [current, setCurrent] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onChange(next: VesselStatus) {
    const previous = current
    setCurrent(next)
    setError(null)

    startTransition(async () => {
      const result = await updateVesselStatus({ id: vesselId, status: next })

      if (!result.ok) {
        // Put the control back where it was: showing a status the server refused
        // would leave the operator believing they reported something they did not.
        setCurrent(previous)
        setError(result.error)
        return
      }

      // The action revalidated the path, but this component owns its own state, so
      // without a refresh the badge in the header would keep showing the old
      // status — two different answers on one screen.
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <label htmlFor="vessel-status" className="text-ink-faint block text-[11px]">
        Operational status
      </label>
      <select
        id="vessel-status"
        value={current}
        disabled={pending}
        onChange={(event) => onChange(event.target.value as VesselStatus)}
        className="border-line bg-surface text-ink focus:border-accent w-full rounded border px-2 py-1.5 text-xs focus:outline-none disabled:opacity-60"
      >
        {Object.values(VesselStatus).map((value) => (
          <option key={value} value={value}>
            {LABELS[value]}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-critical text-[11px]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
