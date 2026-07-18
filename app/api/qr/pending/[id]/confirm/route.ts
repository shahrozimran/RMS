import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { buildTaxSummary, calculateGrandTotal } from '@/lib/utils/tax'

/**
 * POST /api/qr/pending/[id]/confirm
 * Staff/Admin only. Confirms a pending QR order:
 * 1. Creates a real order in `orders` with source='qr', staff_id = confirming staff
 * 2. Creates order_items
 * 3. Marks table as 'occupied'
 * 4. Updates qr_pending_orders.status = 'confirmed'
 * 5. Logs activity
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = await createAdminClient()

    // 1. Fetch the pending order
    const { data: pending, error: fetchError } = await supabase
      .from('qr_pending_orders')
      .select('*, table:tables(id, table_number, status)')
      .eq('id', id)
      .eq('status', 'pending')
      .single()

    if (fetchError || !pending) {
      return NextResponse.json(
        { error: 'Pending order not found or already processed' },
        { status: 404 }
      )
    }

    // 2. Get service charge setting
    const { data: scSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'service_charge')
      .single()
    const sc = (scSetting?.value as any) ?? { type: 'percentage', value: 0 }

    // 3. Calculate totals from items
    const items: any[] = pending.items
    const taxSummary = buildTaxSummary(
      items.map(i => ({
        unit_price: Number(i.unit_price),
        quantity: Number(i.quantity),
        tax_rate: Number(i.tax_rate),
      }))
    )
    const { service_charge, total } = calculateGrandTotal({
      subtotal: taxSummary.subtotal,
      tax_amount: taxSummary.total_tax,
      service_charge_type: sc.type,
      service_charge_value: sc.value,
      discount_amount: 0,
    })

    // 4. Create the real order with source='qr', staff_id = confirming staff
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        staff_id: session.id,           // Confirming staff gets the order
        confirmed_by: session.id,
        table_id: pending.table_id,
        order_type: 'dine_in',
        source: 'qr',
        status: 'active',
        customer_name: pending.customer_name || null,
        subtotal: taxSummary.subtotal,
        tax_amount: taxSummary.total_tax,
        service_charge,
        total,
      })
      .select()
      .single()

    if (orderError) throw orderError

    // 5. Create order items
    const orderItems = items.map(i => ({
      order_id: order.id,
      product_id: i.product_id,
      variant_label: i.variant_label ?? null,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      tax_rate: Number(i.tax_rate),
      tax_amount: (Number(i.unit_price) * Number(i.quantity) * Number(i.tax_rate)) / 100,
      subtotal: Number(i.unit_price) * Number(i.quantity),
      notes: i.notes ?? null,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)
    if (itemsError) throw itemsError

    // 6. Mark table as occupied
    await supabase
      .from('tables')
      .update({ status: 'occupied' })
      .eq('id', pending.table_id)

    // 7. Mark pending order as confirmed
    const { error: updateError } = await supabase
      .from('qr_pending_orders')
      .update({
        status: 'confirmed',
        confirmed_order_id: order.id,
      })
      .eq('id', id)
    if (updateError) throw updateError

    // 8. Activity log
    await supabase.from('activity_logs').insert({
      user_id: session.id,
      action: 'CONFIRM_QR_ORDER',
      entity_type: 'order',
      entity_id: order.id,
      details: {
        pending_id: id,
        table_id: pending.table_id,
        table_number: (pending.table as any)?.table_number,
        total,
        source: 'qr',
      },
    })

    return NextResponse.json({ data: order }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
