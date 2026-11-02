import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { createOrderSchema } from '@/lib/utils/validation'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    const db = await createAdminClient()
    let query = db.from('orders')
      .select('*,staff:users!staff_id(id,name),table:tables(table_number),order_items(*,product:products(name,image_url,tax_rate)),payments(*)').eq('id', id)
    if (session.authType === 'staff') query = query.eq('staff_id', session.id)
    const { data, error } = await query.single()
    if (error || !data) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')
    const { id } = await params
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    // No generic column or lifecycle mutation: all edits use the full validated payload.
    const parsed = createOrderSchema.safeParse(await readJson(request))
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
    const db = await createAdminClient()
    const { data, error } = await db.rpc('save_order', { p_actor: session!.id, p_payload: parsed.data, p_order_id: id })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
