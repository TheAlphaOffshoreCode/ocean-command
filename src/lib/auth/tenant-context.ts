import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { prisma } from '@/lib/db/client'
import { AuthenticationError } from '@/lib/errors'

import { auth } from './auth'
import type { Role } from './permissions'

/**
 * Everything the server needs to know about who is asking.
 *
 * This is the only way to learn the caller's organization. No query or action
 * takes an organizationId parameter — see docs/SECURITY.md §3. Passing the
 * context explicitly (rather than reading ambient state deep in the stack) is
 * what turns "forgot the tenant" into a compile error.
 */
export type TenantContext = {
  userId: string
  userName: string
  userEmail: string
  organizationId: string
  organizationName: string
  role: Role
  isDemo: boolean
}

/**
 * Resolved once per request: React's `cache` dedupes it across every Server
 * Component that asks, so a page with eight panels still performs one lookup.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    throw new AuthenticationError()
  }

  // Role and organization are read fresh on every request, never from the
  // cookie: a user removed from an organization mid-shift must lose access now,
  // not when their session expires.
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      organization: { archivedAt: null },
      ...(session.session.activeOrganizationId
        ? { organizationId: session.session.activeOrganizationId }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: { organization: true, user: true },
  })

  if (!membership) {
    throw new AuthenticationError('Your account is not a member of any active organization.')
  }

  return {
    userId: membership.userId,
    userName: membership.user.name,
    userEmail: membership.user.email,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
    isDemo: membership.organization.isDemo,
  }
})

/** Null instead of throwing — for surfaces that render differently when signed out. */
export async function getOptionalTenantContext(): Promise<TenantContext | null> {
  try {
    return await getTenantContext()
  } catch {
    return null
  }
}

/**
 * For pages: redirect instead of throwing.
 *
 * A layout's redirect does not stop its pages — Next renders them in parallel —
 * so a page calling getTenantContext() directly still throws on an anonymous
 * request, which surfaces as an unhandled 401 in the logs and an error boundary
 * instead of the sign-in screen. Pages use this; queries and server actions use
 * getTenantContext(), where throwing is the correct behaviour.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getOptionalTenantContext()
  if (!ctx) redirect('/sign-in')
  return ctx
}
