import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission, PermissionError } from '@/lib/auth/rbac'
import { voidOrderSchema } from '@/lib/utils/validation'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    requirePermission(session, 'orders', 'void')
    const body = await request.json()
    const parsed = voidOrderSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Reason required', details: parsed.error.flatten() }, { status: 400 })

    const supabase = await createAdminClient()
    const { error } = await supabase.rpc('void_order', {
      p_order_id:    params.id,
      p_reason:      parsed.data.reason,
      p_approved_by: session!.id,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
