import { apiError } from '@/lib/api/errors'
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

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) { return apiError(error) }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createAdminClient()

    // Retrieve active shift for current staff member safely
    const { data, error } = await supabase
      .from('shifts')
      .select('id, clock_in')
      .eq('staff_id', session.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)

    if (error) throw error

    const activeShift = data && data.length > 0 ? data[0] : null
    return NextResponse.json({ activeShift })
  } catch (error) { return apiError(error) }
}
