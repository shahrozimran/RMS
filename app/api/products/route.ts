import { apiError, pagination } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { productSchema } from '@/lib/utils/validation'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'read')
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const available = searchParams.get('available')
    const { page, limit, from, to } = pagination(searchParams, 50)

    let query = supabase
      .from('products')
      .select('*, category:categories(id,name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (category) query = query.eq('category_id', parseInt(category))
    if (available !== null && available !== '') query = query.eq('is_available', available === 'true')

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({ data, count, page, limit })
  } catch (error) { return apiError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'write')

    const body = await readJson(request)
    const parsed = productSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase.from('products').insert(parsed.data).select().single()
    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'CREATE_PRODUCT', entity_type: 'product', entity_id: data.id,
      details: { name: data.name },
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) { return apiError(error) }
}
