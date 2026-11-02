import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const from = request.nextUrl.searchParams.get('from')
    if (!from || !Number.isFinite(Date.parse(from))) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    const db = await createAdminClient()
    const { data, error } = await db.rpc('get_staff_dashboard', { p_actor: session.id, p_from_date: from })
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) { return apiError(error) }
}
