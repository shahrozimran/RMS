import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { productSchema } from '@/lib/utils/validation'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const available = searchParams.get('available')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')

    let query = supabase
      .from('products')
      .select('*, category:categories(id,name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (category) query = query.eq('category_id', parseInt(category))
    if (available !== null && available !== '') query = query.eq('is_available', available === 'true')

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({ data, count, page, limit })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'write')

    const body = await request.json()
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
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
