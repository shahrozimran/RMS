import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'

export async function GET() {
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')

    if (error) throw error
    // Format into single key-value object
    const settingsObj = (data || []).reduce((acc: any, curr) => {
      acc[curr.key] = curr.value
      return acc
    }, {})

    return NextResponse.json({ settings: settingsObj })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'settings', 'write')

    const body = await request.json()
    const { key, value } = body
    if (!key) return NextResponse.json({ error: 'Key is required' }, { status: 400 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('system_settings')
      .upsert({
        key,
        value,
        updated_by: session!.id,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session?.id,
      action: 'UPDATE_SETTING',
      entity_type: 'settings',
      entity_id: key,
      details: { value }
    })

    return NextResponse.json({ data })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
