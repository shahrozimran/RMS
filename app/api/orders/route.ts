import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { createOrderSchema } from '@/lib/utils/validation'
import { ApiError, apiError, pagination } from '@/lib/api/errors'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const params = request.nextUrl.searchParams
    const { page, limit, from, to } = pagination(params)
    const db = await createAdminClient()
    let query = db.from('orders').select('*,staff:users!staff_id(id,name),table:tables(table_number)', { count: 'exact' })
      .order('created_at', { ascending: false }).range(from, to)
    if (session.authType === 'staff') query = query.eq('staff_id', session.id)
    const status = params.get('status')
    if (status) {
      if (!['draft','active','billed','paid','void','refunded'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      query = query.eq('status', status)
    }
    const { data, error, count } = await query
    if (error) throw error
    return NextResponse.json({ data, count, page, limit })
  } catch (error) { return apiError(error) }
}
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')
    const parsed = createOrderSchema.safeParse(await readJson(request))
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
    const key = request.headers.get('Idempotency-Key')
    if (key !== null && !z.uuid().safeParse(key).success) throw new ApiError('Invalid order request ID.')
    const db = await createAdminClient()
    const { data, error } = await db.rpc('save_order', { p_actor: session!.id, p_payload: { ...parsed.data, ...(key ? { _request_id: key } : {}) } })
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) { return apiError(error) }
}
