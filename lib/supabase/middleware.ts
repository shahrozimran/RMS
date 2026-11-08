import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authCookieOptions } from '@/lib/auth/cookies'
import { supabaseUrl } from './connection.mjs'

export async function updateSession(request: NextRequest, next = () => NextResponse.next({ request })) {
  let supabaseResponse = next()

  const supabase = createServerClient(
    supabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = next()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verify/refresh the token with cached public keys when supported. The data
  // access layer still checks getUser() and current database permissions.
  await supabase.auth.getClaims()

  return supabaseResponse
}
