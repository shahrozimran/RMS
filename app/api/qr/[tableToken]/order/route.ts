import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { orderItemSchema } from '@/lib/utils/validation'
import { apiError } from '@/lib/api/errors'
import { clientKey, rateLimit } from '@/lib/api/rate-limit'

const schema = z.object({
  customer_name: z.string().trim().min(1).max(50),
  items: z.array(orderItemSchema.extend({ product_name: z.string().max(120).optional() })).min(1).max(100),
}).strict()
export async function POST(request: NextRequest, { params }: { params: Promise<{ tableToken: string }> }) {
  try {
    const { tableToken } = await params
    if (!z.uuid().safeParse(tableToken).success) return NextResponse.json({ error: 'Invalid QR code' }, { status: 404 })
    await rateLimit('qr-submit:' + clientKey(request), 100, 600)
    const parsed = schema.safeParse(await readJson(request))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid order', details: parsed.error.flatten() }, { status: 400 })
    const db = await createAdminClient()
    const { data, error } = await db.rpc('submit_qr_order', { p_token: tableToken, p_name: parsed.data.customer_name, p_items: parsed.data.items })
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) { return apiError(error) }
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ tableToken: string }> }) {
  try {
    const { tableToken } = await params
    const pendingId = request.nextUrl.searchParams.get('pendingId')
    if (!z.uuid().safeParse(tableToken).success || !z.uuid().safeParse(pendingId).success) return NextResponse.json({ error: 'Invalid order reference' }, { status: 400 })
    // Polling has its own budget, sized for shared restaurant Wi-Fi.
    await rateLimit('qr-status:' + clientKey(request), 1000, 60)
    const db = await createAdminClient()
    const { data, error } = await db.from('qr_pending_orders').select('id,status,confirmed_order_id,created_at')
      .eq('id', pendingId!).eq('table_token', tableToken).single()
    if (error || !data) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
