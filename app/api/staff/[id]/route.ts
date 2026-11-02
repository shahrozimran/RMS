import { apiError } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { updateStaffSchema, resetPasswordSchema } from '@/lib/utils/validation'
import { hashPassword } from '@/lib/auth/staff-auth'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const resolvedParams = await params
    const targetId = resolvedParams.id === 'me' ? session?.id : resolvedParams.id

    if (!targetId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only enforce staff read permission if they are requesting someone else's data
    if (session?.id !== targetId) {
      requirePermission(session, 'staff', 'read')
    }

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('users')
      .select('id, name, username, email, phone, status, created_at, role:roles(id,name)')
      .eq('id', targetId)
      .single()
    if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'staff', 'write')
    const body = await readJson(request)
    const resolvedParams = await params

    // Handle password reset separately
    if (body.new_password !== undefined) {
      const parsed = resetPasswordSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
      const password_hash = await hashPassword(parsed.data.new_password)
      const supabase = await createAdminClient()
      const { error: updateError } = await supabase.from('users').update({ password_hash }).eq('id', resolvedParams.id).is('auth_user_id', null).select('id').single()
      if (updateError) throw updateError
      await supabase.from('activity_logs').insert({
        user_id: session?.id, action: 'RESET_STAFF_PASSWORD', entity_type: 'user', entity_id: resolvedParams.id,
      })
      return NextResponse.json({ success: true })
    }

    const parsed = updateStaffSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
    const supabase = await createAdminClient()
    if (parsed.data.role_id !== undefined) {
      const [{ data: role }, { data: target }] = await Promise.all([
        supabase.from('roles').select('name').eq('id', parsed.data.role_id).single(),
        supabase.from('users').select('auth_user_id').eq('id', resolvedParams.id).single(),
      ])
      if (!role || !target || (role.name === 'Admin' && !target.auth_user_id)) return NextResponse.json({ error: 'Administrator accounts require Supabase Auth provisioning' }, { status: 400 })
    }
    const { data, error } = await supabase.from('users').update(parsed.data).eq('id', resolvedParams.id).select('id,name,username,status').single()
    if (error) throw error
    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'UPDATE_STAFF', entity_type: 'user', entity_id: resolvedParams.id,
      details: parsed.data,
    })
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'staff', 'delete')
    const supabase = await createAdminClient()
    const resolvedParams = await params
    const { error: deleteError } = await supabase.from('users').update({ status: 'deleted' }).eq('id', resolvedParams.id).select('id').single()
    if (deleteError) throw deleteError
    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'DELETE_STAFF', entity_type: 'user', entity_id: resolvedParams.id,
    })
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error) }
}
