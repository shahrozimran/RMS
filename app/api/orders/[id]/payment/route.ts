import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { processPaymentSchema } from '@/lib/utils/validation'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')
    const { id } = await params
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    const parsed = processPaymentSchema.safeParse(await readJson(request))
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
    const db = await createAdminClient()
    const { data, error } = await db.rpc('settle_order', { p_actor: session!.id, p_order: id,
      p_payments: parsed.data.payments, p_code: parsed.data.discount_code,
      p_manual_discount: parsed.data.discount_code ? 0 : parsed.data.discount_amount })
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) { return apiError(error) }
}
