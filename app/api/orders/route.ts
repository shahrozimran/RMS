import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { createOrderSchema } from '@/lib/utils/validation'
import { buildTaxSummary, calculateGrandTotal } from '@/lib/utils/tax'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')

    let query = supabase
      .from('orders')
      .select('*, staff:users(id,name), table:tables(table_number), order_items(*, product:products(name,image_url))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    // Staff can only see their own orders
    if (session.authType === 'staff') query = query.eq('staff_id', session.id)
    if (status) query = query.eq('status', status)

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
    requirePermission(session, 'orders', 'write')
    const body = await request.json()
    const parsed = createOrderSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const supabase = await createAdminClient()
    const { items, ...orderData } = parsed.data

    // Get service charge from settings
    const { data: scSetting } = await supabase.from('system_settings').select('value').eq('key', 'service_charge').single()
    const sc = (scSetting?.value as any) ?? { type: 'percentage', value: 0 }

    // Calculate totals
    const taxSummary = buildTaxSummary(items.map(i => ({ unit_price: i.unit_price, quantity: i.quantity, tax_rate: i.tax_rate })))
    const { service_charge, total } = calculateGrandTotal({
      subtotal: taxSummary.subtotal,
      tax_amount: taxSummary.total_tax,
      service_charge_type: sc.type,
      service_charge_value: sc.value,
      discount_amount: 0,
    })

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        staff_id: session!.id,
        ...orderData,
        status: 'active',
        subtotal: taxSummary.subtotal,
        tax_amount: taxSummary.total_tax,
        service_charge,
        total,
      })
      .select()
      .single()
    if (orderError) throw orderError

    // Create order items
    const orderItems = items.map(i => ({
      order_id:     order.id,
      product_id:   i.product_id,
      variant_label:i.variant_label ?? null,
      quantity:     i.quantity,
      unit_price:   i.unit_price,
      tax_rate:     i.tax_rate,
      tax_amount:   (i.unit_price * i.quantity * i.tax_rate) / 100,
      subtotal:     i.unit_price * i.quantity,
      notes:        i.notes ?? null,
    }))
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
    if (itemsError) throw itemsError

    // Mark table as occupied
    if (orderData.table_id && orderData.order_type === 'dine_in') {
      await supabase.from('tables').update({ status: 'occupied' }).eq('id', orderData.table_id)
    }

    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'CREATE_ORDER', entity_type: 'order', entity_id: order.id,
      details: { order_type: order.order_type, total },
    })

    return NextResponse.json({ data: order }, { status: 201 })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
