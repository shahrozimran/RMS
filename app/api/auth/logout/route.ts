import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST() {
  const response = NextResponse.json({ success: true })

  // Clear staff JWT cookie
  response.cookies.delete('rms_staff_token')

  // Sign out from Supabase (admin)
  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
  } catch {
    // Ignore — may not have a Supabase session
  }

  return response
}
