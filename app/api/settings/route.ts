import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { apiError } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { settingSchema, POS_SETTING_KEYS } from '@/lib/utils/settings'
import { z } from 'zod'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const db = await createAdminClient()
    let query = db.from('system_settings').select('key,value')
    if (session.role !== 'Admin') query = query.in('key', POS_SETTING_KEYS)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ settings: Object.fromEntries((data || []).map(s => [s.key,s.value])) })
  } catch (error) { return apiError(error) }
}
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'settings', 'write')
    const body = await readJson(request)
    const parsed = z.array(settingSchema).min(1).max(10).safeParse(Array.isArray(body) ? body : [body])
    if (!parsed.success) return NextResponse.json({ error: 'Invalid settings', details: parsed.error.flatten() }, { status: 400 })
    if (new Set(parsed.data.map(s => s.key)).size !== parsed.data.length) return NextResponse.json({ error: 'Duplicate setting keys' }, { status: 400 })
    const db = await createAdminClient()
    const { data, error } = await db.from('system_settings').upsert(parsed.data.map(s => ({ ...s, updated_by: session!.id, updated_at: new Date().toISOString() }))).select('key,value')
    if (error) throw error
    await db.from('activity_logs').insert({ user_id: session!.id, action: 'UPDATE_SETTING', entity_type: 'settings', details: { keys: parsed.data.map(s => s.key) } })
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
