import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/admin/staff/performance
 * Admin only. Returns aggregated shift and sales performance data for each employee.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.authType !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createAdminClient()

    // 1. Fetch all staff users (not admins — identified by auth_user_id IS NULL)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, username, status, role:roles(name)')
      .is('auth_user_id', null)
      .neq('status', 'deleted')
      .order('name', { ascending: true })

    if (usersError) throw usersError

    // 2. Fetch all orders to compute processed counts & total revenue
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, total, status, staff_id, source, confirmed_by')

    if (ordersError) throw ordersError

    // 3. Fetch all shifts logs
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('id, staff_id, clock_in, clock_out')
      .order('clock_in', { ascending: false })

    if (shiftsError) throw shiftsError

    // 4. Fetch confirm/reject statistics from activity logs
    const { data: activityLogs, error: logsError } = await supabase
      .from('activity_logs')
      .select('id, user_id, action')
      .in('action', ['CONFIRM_QR_ORDER', 'REJECT_QR_ORDER'])

    if (logsError) throw logsError

    // Aggregate statistics per user
    const performanceData = (users || []).map(u => {
      // Filter shifts
      const userShifts = (shifts || []).filter(s => s.staff_id === u.id)
      const activeShift = userShifts.find(s => s.clock_out === null)

      // Filter orders where this user was the assigned staff
      const userOrders = (orders || []).filter(o => o.staff_id === u.id)
      const paidOrders = userOrders.filter(o => o.status === 'paid')
      const totalAmount = paidOrders.reduce((s, o) => s + Number(o.total), 0)

      // QR confirmations (where confirmed_by matches or action log)
      const qrConfirmedCount = (orders || []).filter(o => o.source === 'qr' && o.confirmed_by === u.id).length
      
      // QR rejections (from activity log)
      const qrRejectedCount = (activityLogs || []).filter(l => l.user_id === u.id && l.action === 'REJECT_QR_ORDER').length

      return {
        id: u.id,
        name: u.name,
        username: u.username,
        role: (u.role as any)?.name || 'Staff',
        status: u.status,
        isOnDuty: !!activeShift,
        activeShiftSince: activeShift ? activeShift.clock_in : null,
        ordersProcessed: paidOrders.length,
        totalRevenue: totalAmount,
        qrConfirmed: qrConfirmedCount,
        qrRejected: qrRejectedCount,
        shiftLogs: userShifts.slice(0, 10).map(s => ({
          id: s.id,
          clockIn: s.clock_in,
          clockOut: s.clock_out
        }))
      }
    })

    return NextResponse.json({ data: performanceData })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
