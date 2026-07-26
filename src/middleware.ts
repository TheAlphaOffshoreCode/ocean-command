import { NextResponse, type NextRequest } from 'next/server'

/**
 * Per-request CSP with a nonce. Next injects the nonce into its own scripts when
 * it finds one in this header, which is what lets us ban 'unsafe-inline'.
 *
 * Route protection is NOT done here. Middleware can only read the session
 * cookie, and a cookie's presence is not proof of a valid session — the real
 * check happens in the layout via getTenantContext(). Doing it here as well
 * would look like security while being a redirect at best.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`, // Tailwind injects styles; no user input reaches them
    `img-src 'self' blob: data: https://*.basemaps.cartocdn.com`,
    `font-src 'self'`,
    `connect-src 'self' https://api.open-meteo.com https://marine-api.open-meteo.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    ...(process.env.NODE_ENV === 'production' ? [`upgrade-insecure-requests`] : []),
  ].join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    // Everything except static assets and images, which need no CSP and would
    // only pay the middleware cost.
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
