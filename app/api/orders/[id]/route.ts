import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { voidOrderSchema, processPaymentSchema } from '@/lib/utils/validation'
import { buildTaxSummary, calculateGrandTotal } from '@/lib/utils/tax'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = await createAdminClient()

    const { data, error } = await supabase
      .from('orders')
      .select('*, staff:users(id,name), table:tables(table_number), order_items(*, product:products(name,image_url,tax_rate)), payments(*)')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Staff can only see their own orders
    if (session.authType === 'staff' && data.staff_id !== session.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')
    const body = await request.json()
    const supabase = await createAdminClient()
    const { data, error } = await supabase.from('orders').update(body).eq('id', params.id).select().single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
