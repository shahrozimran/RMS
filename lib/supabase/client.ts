import { createBrowserClient } from '@supabase/ssr'
import { authCookieOptions } from '@/lib/auth/cookies'
import { supabaseUrl } from './connection.mjs'

export function createClient() {
  return createBrowserClient(
    supabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: authCookieOptions }
  )
}
