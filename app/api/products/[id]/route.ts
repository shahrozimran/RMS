import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { productSchema } from '@/lib/utils/validation'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createAdminClient()
  const resolvedParams = await params
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(id,name), product_ingredients(*, ingredient:ingredients(id,name,unit))')
    .eq('id', resolvedParams.id)
    .single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'write')
    const body = await request.json()
    const parsed = productSchema.partial().safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const supabase = await createAdminClient()
    const resolvedParams = await params
    const { data, error } = await supabase.from('products').update(parsed.data).eq('id', resolvedParams.id).select().single()
    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'UPDATE_PRODUCT', entity_type: 'product', entity_id: resolvedParams.id,
      details: parsed.data,
    })
    return NextResponse.json({ data })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'delete')
    const supabase = await createAdminClient()
    const resolvedParams = await params
    const { error } = await supabase.from('products').delete().eq('id', resolvedParams.id)
    if (error) throw error
    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'DELETE_PRODUCT', entity_type: 'product', entity_id: resolvedParams.id,
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
