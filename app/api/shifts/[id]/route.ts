import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createAdminClient()
    const resolvedParams = await params

    // 1. Clock out the active shift
    const { data, error } = await supabase
      .from('shifts')
      .update({
        clock_out: new Date().toISOString()
      })
      .eq('id', resolvedParams.id)
      .eq('staff_id', session.id)
      .is('clock_out', null)
      .select()
      .single()

    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session.id,
      action: 'CLOCK_OUT',
      entity_type: 'shift',
      entity_id: resolvedParams.id,
      details: { time: data.clock_out }
    })

    // Redirect to staff dashboard to refresh state
    return NextResponse.redirect(new URL('/staff/dashboard', request.url), { status: 303 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
