import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { tableCountSchema } from '@/lib/utils/validation'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const db = await createAdminClient()
    const { data, error } = await db.from('tables')
      .select(session.role === 'Admin' ? '*' : 'id,table_number,section,capacity,status').order('id')
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'settings', 'write')
    const parsed = tableCountSchema.safeParse(await readJson(request))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid table count' }, { status: 400 })
    const db = await createAdminClient()
    const { data, error } = await db.rpc('configure_tables', { p_actor: session!.id, p_count: parsed.data.count })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
