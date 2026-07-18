import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { verifyStaffToken } from '@/lib/auth/staff-auth'
import { isRateLimited } from '@/lib/utils/rate-limiter'

// ─── Public route matcher ────────────────────────────────────────
// /order/* and /api/qr/[token]/* are fully public (customer self-ordering).
// /api/qr/pending/* requires staff auth — must NOT be marked as public.
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/login') return true
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname.startsWith('/order')) return true  // Customer QR ordering page
  // Allow /api/qr/[token] and /api/qr/[token]/order but NOT /api/qr/pending/
  if (pathname.startsWith('/api/qr/') && !pathname.startsWith('/api/qr/pending')) return true
  return false
}

// Admin-only route prefix
const ADMIN_ROUTES = '/admin'

// Staff-only route prefix
const STAFF_ROUTES = '/staff'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── Rate Limiting for Public QR Endpoints ─────────────────────
  if (pathname.startsWith('/api/qr/') && !pathname.startsWith('/api/qr/pending')) {
    const ip = (request as any).ip || request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1'

    if (pathname.endsWith('/order')) {
      // 5 order submissions per 10 minutes per IP
      const limited = isRateLimited(`qr-order-${ip}`, 5, 10 * 60 * 1000)
      if (limited) {
        return NextResponse.json(
          { error: 'Too many orders. Please wait 10 minutes before submitting again.' },
          { status: 429 }
        )
      }
    } else {
      // 30 menu reads / queries per minute per IP
      const limited = isRateLimited(`qr-read-${ip}`, 30, 60 * 1000)
      if (limited) {
        return NextResponse.json(
          { error: 'Too many requests. Please slow down.' },
          { status: 429 }
        )
      }
    }
  }

  // Allow public routes (no auth needed)
  if (isPublicRoute(pathname)) {
    return await updateSession(request)
  }

  // Check for staff JWT (for staff routes)
  if (pathname.startsWith(STAFF_ROUTES) || pathname.startsWith('/api/')) {
    const staffToken = request.cookies.get('rms_staff_token')?.value
    if (staffToken) {
      try {
        const payload = await verifyStaffToken(staffToken)
        if (payload && pathname.startsWith(ADMIN_ROUTES)) {
          // Staff trying to access admin — redirect
          return NextResponse.redirect(new URL('/staff/dashboard', request.url))
        }
        return await updateSession(request)
      } catch {
        // Invalid token — redirect to login
        const response = NextResponse.redirect(new URL('/login', request.url))
        response.cookies.delete('rms_staff_token')
        return response
      }
    }
  }

  // Refresh Supabase Admin session
  const response = await updateSession(request)

  // For admin routes — check Supabase auth
  if (pathname.startsWith(ADMIN_ROUTES)) {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Redirect root to login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js).*)',
  ],
}
