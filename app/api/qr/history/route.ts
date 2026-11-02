import { requirePermission } from '@/lib/auth/rbac'
import { apiError } from '@/lib/api/errors'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/qr/history
 * Staff/Admin only. Returns historical (confirmed or rejected) QR orders.
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
        customer_name,
        items,
        status,
        created_at,
        table:tables(table_number)
      `)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) { return apiError(error) }
}
