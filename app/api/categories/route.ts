import { apiError } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { categorySchema } from '@/lib/utils/validation'

export async function GET() {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'read')
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'write')

    const body = await readJson(request)
    const parsed = categorySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })

    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('categories')
      .insert(parsed.data)
      .select()
      .single()
    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session?.id,
      action: 'CREATE_CATEGORY',
      entity_type: 'category',
      entity_id: String(data.id),
      details: { name: data.name }
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) { return apiError(error) }
}
