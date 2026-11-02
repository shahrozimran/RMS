import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyStaffToken } from '@/lib/auth/staff-auth'
import { apiError } from '@/lib/api/errors'

export async function POST() {
  try {
    const token = (await cookies()).get('rms_staff_token')?.value
    if (token) {
      let userId: string | undefined
      let version: number | undefined
      try { const payload = await verifyStaffToken(token); userId = payload.userId; version = payload.sessionVersion } catch {}
      if (userId) {
        const db = await createAdminClient()
        const { error } = await db.rpc('revoke_staff_sessions', { p_user_id: userId, p_expected_version: version })
        if (error) throw error
      }
    }
    const auth = await createServerSupabaseClient()
    const { error } = await auth.auth.signOut()
    if (error) throw error
    const response = NextResponse.json({ success: true })
    response.cookies.delete('rms_staff_token')
    return response
  } catch (error) { return apiError(error) }
}
