import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgentAdmin } from '@/lib/agents/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ApiError, apiError } from '@/lib/api/errors'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAgentAdmin()
    const id = z.uuid().safeParse((await context.params).id)
    if (!id.success) throw new ApiError('Review not found.', 404)
    const db = await createAdminClient()
    const { data, error } = await db.from('agent_runs').select('ai_review').eq('id', id.data).maybeSingle()
    if (error && ['42703', 'PGRST204'].includes(error.code)) return NextResponse.json({ data: null })
    if (error) throw error
    if (!data) throw new ApiError('Review not found.', 404)
    return NextResponse.json({ data: data.ai_review })
  } catch (error) { return apiError(error) }
}
