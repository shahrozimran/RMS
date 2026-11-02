import { requirePermission } from '@/lib/auth/rbac'
import { apiError } from '@/lib/api/errors'
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

    requirePermission(session, 'orders', 'write')
    const supabase = await createAdminClient()

    const { data, error } = await supabase
      .from('qr_pending_orders')
      .select(`
        id,
        table_id,
        customer_name,
        items,
        status,
        confirmed_order_id,
        created_at,
        table:tables(id, table_number, section, status)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(200)

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) { return apiError(error) }
}
