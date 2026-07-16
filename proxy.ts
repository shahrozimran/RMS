import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { verifyStaffToken } from '@/lib/auth/staff-auth'

// Public routes that don't need auth
const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/api/auth/logout']

// Admin-only route prefix
const ADMIN_ROUTES = '/admin'

// Staff-only route prefix
const STAFF_ROUTES = '/staff'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
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
