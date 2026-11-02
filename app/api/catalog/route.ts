import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'read')
    const db = await createAdminClient()
    const { data, error } = await db.rpc('get_pos_catalog')
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) { return apiError(error) }
}
