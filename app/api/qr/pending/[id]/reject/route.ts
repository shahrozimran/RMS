import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * POST /api/qr/pending/[id]/reject
 * Staff/Admin only. Rejects a pending QR order.
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

    const { error } = await supabase
      .from('qr_pending_orders')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('status', 'pending')

    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session.id,
      action: 'REJECT_QR_ORDER',
      entity_type: 'qr_pending_order',
      entity_id: id,
      details: { rejected_by: session.name },
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
