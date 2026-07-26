'use server'

import { headers } from 'next/headers'
import { APIError } from 'better-auth/api'

import { auth } from '@/lib/auth/auth'
import { logger } from '@/lib/logger'

import { signInSchema } from '../schemas/sign-in'

export type SignInResult = { ok: true } | { ok: false; message: string }

/**
 * Sign in.
 *
 * The failure message is deliberately identical for "no such account", "wrong
 * password" and "archived user". Telling them apart is an account-enumeration
 * oracle, and knowing which one it was helps an attacker far more than a
 * legitimate operator, who simply retypes their password.
 */
const GENERIC_FAILURE = 'E-mail or password is incorrect.'

export async function signIn(_previous: SignInResult | null, formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? GENERIC_FAILURE }
  }

  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    })
  } catch (error) {
    if (error instanceof APIError) {
      // 429 is worth distinguishing: an operator locked out by rate limiting
      // needs to know to wait, not to keep retrying a password that is correct.
      if (error.status === 'TOO_MANY_REQUESTS') {
        return {
          ok: false as const,
          message: 'Too many attempts. Wait a few minutes and try again.',
        }
      }
      return { ok: false as const, message: GENERIC_FAILURE }
    }

    logger.error({ err: error, module: 'auth' }, 'Unexpected failure during sign-in')
    return { ok: false as const, message: 'Sign-in is unavailable right now.' }
  }

  return { ok: true as const }
}
