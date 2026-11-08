import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { supabaseUrl } from '@/lib/supabase/connection.mjs'

function pagePolicy(nonce: string) {
  let connections = "'self'"
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (configured) {
    const database = supabaseUrl(configured)
    connections += ` ${database} ${database.replace(/^http/, 'ws')}`
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "media-src 'self' data:",
    `connect-src ${connections}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) {
    // Cookie-authenticated mutations must originate from this application.
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin')
      let expectedOrigin = process.env.APP_ORIGIN || request.nextUrl.origin
      // Next dev normalizes nextUrl to localhost even when the browser uses
      // 127.0.0.1. Honor only loopback Host values for this local-development case.
      const localHost = request.headers.get('host')
      if (!process.env.APP_ORIGIN && process.env.NODE_ENV === 'development' && localHost
          && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(localHost)) {
        expectedOrigin = `${request.nextUrl.protocol}//${localHost}`
      }
      const site = request.headers.get('sec-fetch-site')
      if (site === 'cross-site' || (origin && origin !== expectedOrigin) ||
          (!origin && site === 'same-site' && request.headers.has('cookie'))) {
        return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
      }
      const length = Number(request.headers.get('content-length') || 0)
      const maximum = pathname === '/api/upload' ? 6 * 1024 * 1024 : 256 * 1024
      if (length > maximum) return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    }
    // Every API enforces its own authentication close to privileged data access.
    const response = NextResponse.next()
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return response
  }
  if (pathname === '/') return NextResponse.redirect(new URL('/login', request.url))
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const policy = pagePolicy(nonce)
  const next = () => {
    const headers = new Headers(request.headers)
    headers.set('Content-Security-Policy', policy)
    return NextResponse.next({ request: { headers } })
  }
  const protectedPage = /^\/(admin|staff)(\/|$)/.test(pathname)
  const response = protectedPage ? await updateSession(request, next) : next()
  response.headers.set('Content-Security-Policy', policy)
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico$|icons/|manifest\\.json$|sw\\.js$|(?:file|globe|next|vercel|window)\\.svg$).*)'],
}
