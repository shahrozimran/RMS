import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { voidOrderSchema, processPaymentSchema, createOrderSchema } from '@/lib/utils/validation'
import { buildTaxSummary, calculateGrandTotal } from '@/lib/utils/tax'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = await createAdminClient()
    const resolvedParams = await params

    const { data, error } = await supabase
      .from('orders')
      .select('*, staff:users!staff_id(id,name), table:tables(table_number), order_items(*, product:products(name,image_url,tax_rate)), payments(*)')
      .eq('id', resolvedParams.id)
      .single()

    if (error) return NextResponse.json({ error: `${error.message} (Code: ${error.code})` }, { status: 404 })

    // Staff can only see their own orders
    if (session.authType === 'staff' && data.staff_id !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')
    const body = await request.json()
    const supabase = await createAdminClient()
    const resolvedParams = await params

    // If payload contains items, we perform a full order modification
    if (body.items && Array.isArray(body.items)) {
      // Validate modify order payload
      const parsed = createOrderSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
      }
      // 1. Fetch current order to verify it can be modified (only draft/active/billed)
      const { data: currentOrder, error: fetchError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', resolvedParams.id)
        .single()

      if (fetchError || !currentOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      if (['paid', 'void', 'refunded'].includes(currentOrder.status)) {
        return NextResponse.json({ error: `Cannot modify a ${currentOrder.status} order` }, { status: 400 })
      }

      // 2. Fetch service charge settings to recalculate totals
      const { data: scSetting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'service_charge')
        .maybeSingle()

      const serviceCharge = scSetting?.value as any || { type: 'percentage', value: 0 }

      // 3. Compute tax summary and totals
      const taxSummary = buildTaxSummary(body.items)
      const { service_charge: computedSC, total: computedTotal } = calculateGrandTotal({
        subtotal: taxSummary.subtotal,
        tax_amount: taxSummary.total_tax,
        service_charge_type: serviceCharge.type,
        service_charge_value: serviceCharge.value,
        discount_amount: body.discount_amount || 0
      })

      // 4. Perform database updates
      // Delete old items
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', resolvedParams.id)

      if (deleteError) throw deleteError

      // Update parent order totals and setup details
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          table_id: body.table_id || null,
          order_type: body.order_type,
          customer_name: body.customer_name || null,
          customer_phone: body.customer_phone || null,
          customer_address: body.customer_address || null,
          subtotal: taxSummary.subtotal,
          tax_amount: taxSummary.total_tax,
          service_charge: computedSC,
          total: computedTotal,
          notes: body.notes || null,
          status: body.status || currentOrder.status
        })
        .eq('id', resolvedParams.id)
        .select()
        .single()

      if (updateError) throw updateError

      // Insert new items
      const itemsToInsert = body.items.map((i: any) => {
        const lineTotal = i.unit_price * i.quantity
        const taxAmount = parseFloat(((lineTotal * i.tax_rate) / 100).toFixed(2))
        
        return {
          order_id: resolvedParams.id,
          product_id: i.product_id,
          variant_label: i.variant_label || null,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_rate: i.tax_rate,
          tax_amount: taxAmount,
          subtotal: lineTotal,
          notes: i.notes || null,
          selected_modifiers: i.selected_modifiers || []
        }
      })

      const { error: insertError } = await supabase
        .from('order_items')
        .insert(itemsToInsert)

      if (insertError) throw insertError

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: session?.id,
        action: 'MODIFY_ORDER',
        entity_type: 'order',
        entity_id: resolvedParams.id,
        details: { items_count: itemsToInsert.length, total: computedTotal }
      })

      return NextResponse.json({ data: updatedOrder })
    }

    // Default simple update
    const { data, error } = await supabase
      .from('orders')
      .update(body)
      .eq('id', resolvedParams.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
