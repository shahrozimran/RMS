import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { discountSchema } from '@/lib/utils/validation'

export async function GET() {
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('discounts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'discounts', 'write')

    const body = await request.json()
    const parsed = discountSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('discounts')
      .insert({
        ...parsed.data,
        code: parsed.data.code.toUpperCase(),
        created_by: session!.id
      })
      .select()
      .single()
    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session?.id,
      action: 'CREATE_DISCOUNT',
      entity_type: 'discount',
      entity_id: data.id,
      details: { code: data.code }
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
