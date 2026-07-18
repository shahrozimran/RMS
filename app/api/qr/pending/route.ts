import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/qr/pending
 * Staff/Admin only. Returns all pending QR orders.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createAdminClient()

    const { data, error } = await supabase
      .from('qr_pending_orders')
      .select(`
        id,
        table_id,
        table_token,
        customer_name,
        items,
        status,
        confirmed_order_id,
        created_at,
        table:tables(id, table_number, section, status)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
