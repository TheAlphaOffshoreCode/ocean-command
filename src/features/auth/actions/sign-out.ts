'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth/auth'

export async function signOut() {
  // Deletes the session row, so every other tab loses access on its next
  // request rather than at token expiry.
  await auth.api.signOut({ headers: await headers() })
  redirect('/sign-in')
}
