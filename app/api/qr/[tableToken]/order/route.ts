import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/qr/[tableToken]/order
 * Public endpoint — no auth required.
 * Customer submits their cart. Creates a qr_pending_orders row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableToken: string }> }
) {
  try {
    const { tableToken } = await params
    const body = await request.json()
    const { customer_name, items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    // Validate each item has required fields
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.unit_price === undefined) {
        return NextResponse.json({ error: 'Invalid cart item data' }, { status: 400 })
      }
    }

    const supabase = await createAdminClient()

    // Validate table token
    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('id, table_number, status, qr_token')
      .eq('qr_token', tableToken)
      .single()

    if (tableError || !table) {
      return NextResponse.json({ error: 'Invalid QR code' }, { status: 404 })
    }

    // Insert pending order
    const { data: pending, error: insertError } = await supabase
      .from('qr_pending_orders')
      .insert({
        table_id: table.id,
        table_token: tableToken,
        customer_name: customer_name || null,
        items,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ data: pending }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * GET /api/qr/[tableToken]/order?pendingId=xxx
 * Public endpoint — customer polls for their order status.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableToken: string }> }
) {
  try {
    const { tableToken } = await params
    const { searchParams } = new URL(request.url)
    const pendingId = searchParams.get('pendingId')

    if (!pendingId) {
      return NextResponse.json({ error: 'pendingId required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data, error } = await supabase
      .from('qr_pending_orders')
      .select('id, status, confirmed_order_id, created_at')
      .eq('id', pendingId)
      .eq('table_token', tableToken)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
