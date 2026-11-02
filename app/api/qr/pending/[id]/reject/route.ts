import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')
    const { id } = await params
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    const db = await createAdminClient()
    const { data, error } = await db.rpc('process_qr_order', { p_actor: session!.id, p_pending: id, p_confirm: false })
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) { return apiError(error) }
}
