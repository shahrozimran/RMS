import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { processPaymentSchema } from '@/lib/utils/validation'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')

    const body = await request.json()
    const parsed = processPaymentSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const supabase = await createAdminClient()

    // Fetch the order to verify it exists and belongs to staff
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, total, staff_id, discount_amount')
      .eq('id', params.id)
      .single()
    if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.status === 'paid') return NextResponse.json({ error: 'Order is already paid' }, { status: 400 })
    if (session!.authType === 'staff' && order.staff_id !== session!.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { payments, discount_code, discount_amount } = parsed.data

    // Validate discount code if provided
    let finalDiscount = discount_amount
    if (discount_code) {
      const { data: discount } = await supabase
        .from('discounts')
        .select('*')
        .eq('code', discount_code.toUpperCase())
        .eq('is_active', true)
        .single()

      if (!discount) return NextResponse.json({ error: 'Invalid or expired discount code' }, { status: 400 })
      if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Discount code has expired' }, { status: 400 })
      }
      if (discount.max_uses && discount.times_used >= discount.max_uses) {
        return NextResponse.json({ error: 'Discount code has reached its usage limit' }, { status: 400 })
      }

      // Calculate discount amount
      finalDiscount = discount.type === 'percentage'
        ? (order.total * discount.value) / 100
        : discount.value

      // Increment usage count
      await supabase.from('discounts').update({ times_used: discount.times_used + 1 }).eq('id', discount.id)
    }

    // Update order with discount and status
    const newTotal = Math.max(0, order.total - finalDiscount)
    await supabase.from('orders').update({
      status: 'paid',
      discount_amount: finalDiscount,
      total: newTotal,
    }).eq('id', params.id)

    // Record payment entries
    const paymentRecords = payments.map(p => ({
      order_id:        params.id,
      method:          p.method,
      amount:          p.amount,
      cash_tendered:   p.cash_tendered ?? null,
      change_given:    p.cash_tendered ? p.cash_tendered - p.amount : null,
      transaction_ref: p.transaction_ref ?? null,
      status:          'completed',
    }))
    await supabase.from('payments').insert(paymentRecords)

    // Deduct stock atomically
    await supabase.rpc('deduct_stock_for_order', {
      p_order_id:     params.id,
      p_performed_by: session!.id,
    })

    // Free the table
    await supabase.rpc('void_order', { p_order_id: params.id }).then(() => {})
    // Actually update table status via direct query
    const { data: fullOrder } = await supabase.from('orders').select('table_id, order_type').eq('id', params.id).single()
    if (fullOrder?.order_type === 'dine_in' && fullOrder.table_id) {
      await supabase.from('tables').update({ status: 'free' }).eq('id', fullOrder.table_id)
    }

    await supabase.from('activity_logs').insert({
      user_id: session?.id, action: 'PROCESS_PAYMENT', entity_type: 'order', entity_id: params.id,
      details: { methods: payments.map(p => p.method), total: newTotal },
    })

    return NextResponse.json({ success: true, total: newTotal })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
