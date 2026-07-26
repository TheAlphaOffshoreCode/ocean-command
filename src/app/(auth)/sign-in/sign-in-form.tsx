'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

import { signIn, type SignInResult } from '@/features/auth/actions/sign-in'
import { Button } from '@/components/ui/button'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  )
}

const field =
  'w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-faint focus:border-accent focus:outline-none'

export function SignInForm() {
  const [state, formAction] = useActionState<SignInResult | null, FormData>(signIn, null)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-ink-muted block text-xs font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={field}
          placeholder="you@company.com"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-ink-muted block text-xs font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </div>

      {state && !state.ok ? (
        // role="alert" so a screen reader announces the failure instead of
        // leaving someone waiting for a page that already came back.
        <p
          role="alert"
          className="bg-critical-soft text-critical flex items-start gap-2 rounded px-3 py-2 text-xs"
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
