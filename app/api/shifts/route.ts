import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createAdminClient()

    // 1. Check if already clocked in
    const { data: activeShift } = await supabase
      .from('shifts')
      .select('id')
      .eq('staff_id', session.id)
      .is('clock_out', null)
      .maybeSingle()

    if (activeShift) {
      return NextResponse.json({ error: 'Already clocked in' }, { status: 400 })
    }

    // 2. Clock in
    const { data, error } = await supabase
      .from('shifts')
      .insert({
        staff_id: session.id,
        clock_in: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    await supabase.from('activity_logs').insert({
      user_id: session.id,
      action: 'CLOCK_IN',
      entity_type: 'shift',
      entity_id: data.id,
      details: { time: data.clock_in }
    })

    // Redirect to staff dashboard to refresh state
    return NextResponse.redirect(new URL('/staff/dashboard', request.url), { status: 303 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
