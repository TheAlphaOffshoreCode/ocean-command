'use client'

import { useEffect } from 'react'

import { ErrorState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'

/**
 * Without this boundary an unhandled render error is a blank screen. In an
 * operations room a blank screen is indistinguishable from an outage, so it has
 * to say something — and `digest` is what ties what the operator sees to the
 * server log line, since the message itself never reaches the browser.
 */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Panel>
      <ErrorState
        title="This panel could not be loaded"
        description="The rest of the platform is unaffected. Retry, and if it keeps failing, quote the reference below."
        correlationId={error.digest}
        action={
          <Button variant="secondary" size="sm" onClick={reset} className="mt-2">
            Retry
          </Button>
        }
      />
    </Panel>
  )
}
