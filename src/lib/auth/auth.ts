import 'server-only'

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'

import { env, isProduction } from '@/config/env'
import { prisma } from '@/lib/db/client'

import { hashPassword, verifyPassword } from './password'

const ONE_HOUR = 60 * 60

/**
 * Authentication only. Authorization is ours — see docs/adr/003-authentication.md.
 * Nothing here decides what a user may do; that is the permission matrix.
 */
export const auth = betterAuth({
  appName: 'Ocean Command',
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    // Accounts are provisioned by an administrator. Public self-registration
    // into an operations platform would let anyone create a tenant.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(hash, password),
    },
  },

  session: {
    // One shift, refreshed while in use, so a console left open overnight is not
    // still authenticated in the morning.
    expiresIn: 8 * ONE_HOUR,
    updateAge: ONE_HOUR,
    additionalFields: {
      // Which organization this session is acting in. `input: false` is the
      // security-relevant part: the client cannot set it, so switching tenant is
      // a server decision rather than a field anyone can post.
      activeOrganizationId: { type: 'string', required: false, input: false },
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      // Credential endpoints get a much tighter budget than the rest.
      '/sign-in/email': { window: 900, max: 5 },
      '/forget-password': { window: 900, max: 3 },
    },
  },

  advanced: {
    cookiePrefix: 'ocean-command',
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  // Must stay last: it is what lets server actions set the session cookie.
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
