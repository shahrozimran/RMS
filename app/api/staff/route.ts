import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { createStaffSchema } from '@/lib/utils/validation'
import { hashPassword, generatePassword } from '@/lib/auth/staff-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'staff', 'read')
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')

    const { data, error, count } = await supabase
      .from('users')
      .select('id, name, username, email, phone, status, created_at, role:roles(id,name)', { count: 'exact' })
      .neq('role_id', null)
      .not('auth_user_id', 'is', null).is('auth_user_id', null)  // staff only (no Supabase auth)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) throw error
    return NextResponse.json({ data, count, page, limit })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'staff', 'write')
    const body = await request.json()
    const parsed = createStaffSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const password = parsed.data.password || generatePassword()
    const password_hash = await hashPassword(password)

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('users')
      .insert({
        name:          parsed.data.name,
        username:      parsed.data.username,
        password_hash,
        role_id:       parsed.data.role_id,
        email:         parsed.data.email || null,
        phone:         parsed.data.phone || null,
        created_by:    session!.id,
      })
      .select('id, name, username, email, phone, status, created_at, role:roles(id,name)')
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
      throw error
    }

    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'CREATE_STAFF', entity_type: 'user', entity_id: data.id,
      details: { username: data.username },
    })

    // Return generated password only once (so admin can share with staff)
    return NextResponse.json({ data, generated_password: password }, { status: 201 })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
