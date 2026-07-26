import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Waves } from 'lucide-react'

import { getOptionalTenantContext } from '@/lib/auth/tenant-context'

import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage() {
  if (await getOptionalTenantContext()) redirect('/command-center')

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Waves className="text-accent size-7" aria-hidden />
          <div>
            <h1 className="text-ink text-lg font-semibold tracking-tight">Ocean Command</h1>
            <p className="text-ink-faint text-xs">Offshore Operations Intelligence Platform</p>
          </div>
        </div>

        <SignInForm />

        {/* Demo credentials belong on screen for a demo tenant, not hidden in a
            README nobody opens before clicking. They are development-only. */}
        <div className="border-line text-ink-faint mt-8 space-y-1 border-t pt-4 text-xs">
          <p className="text-ink-muted font-medium">Demo access</p>
          <p>
            <code className="numeric">admin@oceancommand.demo</code> ·{' '}
            <code className="numeric">manager@</code> · <code className="numeric">operator@</code> ·{' '}
            <code className="numeric">viewer@</code>
          </p>
          <p>
            Password <code className="numeric">OceanCommand2026!</code> — seeded demo data only.
          </p>
        </div>
      </div>
    </main>
  )
}
