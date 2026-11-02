import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) {
    // Cookie-authenticated mutations must originate from this application.
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin')
      const expectedOrigin = process.env.APP_ORIGIN || request.nextUrl.origin
      if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expectedOrigin)) {
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
  // Public QR pages never need a Supabase Auth round trip.
  if (pathname === '/order' || pathname.startsWith('/order/')) return NextResponse.next()
  const response = await updateSession(request)
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.svg$).*)'],
}
