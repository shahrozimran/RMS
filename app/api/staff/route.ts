import { apiError, pagination } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { createStaffSchema } from '@/lib/utils/validation'
import { hashPassword, generatePassword } from '@/lib/auth/staff-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'staff', 'read')
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const { page, limit, from, to } = pagination(searchParams)

    const { data, error, count } = await supabase
      .from('users')
      .select('id, name, username, email, phone, status, created_at, role:roles(id,name)', { count: 'exact' })
      .not('role_id', 'is', null)
      .is('auth_user_id', null)  // staff only (no Supabase auth)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return NextResponse.json({ data, count, page, limit })
  } catch (error) { return apiError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'staff', 'write')
    const body = await readJson(request)
    const parsed = createStaffSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const password = parsed.data.password || generatePassword()
    const password_hash = await hashPassword(password)

    const supabase = await createAdminClient()
    const { data: role } = await supabase.from('roles').select('name').eq('id', parsed.data.role_id).single()
    if (!role || role.name === 'Admin') return NextResponse.json({ error: 'Provision administrators using the operator CLI' }, { status: 400 })
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
  } catch (error) { return apiError(error) }
}
