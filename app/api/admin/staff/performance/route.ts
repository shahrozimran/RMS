import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: session ? 403 : 401 })
    const db = await createAdminClient()
    const { data, error } = await db.rpc('get_staff_performance')
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
