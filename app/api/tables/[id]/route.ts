import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { apiError } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { z } from 'zod'

const schema = z.object({ status: z.enum(['free','occupied','reserved','cleaning']).optional(),
  capacity: z.number().int().min(1).max(50).optional(), regenerate_qr: z.boolean().optional() }).strict().refine(v => Object.keys(v).length > 0)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'write')
    const parsed = schema.safeParse(await readJson(request))
    const id = Number((await params).id)
    if (!parsed.success || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid table update' }, { status: 400 })
    if (parsed.data.capacity !== undefined || parsed.data.regenerate_qr) requirePermission(session, 'settings', 'write')
    const db = await createAdminClient()
    const { data, error } = await db.rpc('mutate_table', { p_actor: session!.id, p_table: id,
      p_status: parsed.data.status, p_capacity: parsed.data.capacity, p_regenerate: parsed.data.regenerate_qr ?? false })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
