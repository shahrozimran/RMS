import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { voidOrderSchema } from '@/lib/utils/validation'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'void')
    const { id } = await params
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    const parsed = voidOrderSchema.safeParse(await readJson(request))
    if (!parsed.success) return NextResponse.json({ error: 'Reason required' }, { status: 400 })
    const db = await createAdminClient()
    const { error } = await db.rpc('void_order', { p_order_id: id, p_reason: parsed.data.reason, p_approved_by: session!.id })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error) }
}
