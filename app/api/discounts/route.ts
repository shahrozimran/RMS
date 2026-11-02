import { apiError } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { discountSchema } from '@/lib/utils/validation'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'discounts', 'read')
    const supabase = await createAdminClient()
    let query = supabase
      .from('discounts')
      .select('*')
      .order('created_at', { ascending: false })
    if (session!.role !== 'Admin') query = query.eq('is_active', true)
    const code = request.nextUrl.searchParams.get('code')
    if (code) query = query.eq('code', code.toUpperCase().slice(0,30))
    const { data, error } = await query.limit(200)

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'discounts', 'write')

    const body = await readJson(request)
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
  } catch (error) { return apiError(error) }
}
