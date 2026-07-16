import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'My Dashboard' }

export default async function StaffDashboardPage() {
  const session = await getSession()
  const supabase = await createAdminClient()

  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  const [
    { data: todayOrders },
    { data: activeOrders },
    { data: activeShift },
  ] = await Promise.all([
    supabase.from('orders').select('total, status').eq('staff_id', session?.id).gte('created_at', startOfDay).eq('status', 'paid'),
    supabase.from('orders').select('id, status, order_type, total, table:tables(table_number)').eq('staff_id', session?.id).in('status', ['active','billed']).order('created_at', { ascending: false }),
    supabase.from('shifts').select('id, clock_in').eq('staff_id', session?.id).is('clock_out', null).single(),
  ])

  const todayRevenue = (todayOrders ?? []).reduce((s, o) => s + Number(o.total), 0)

  return (
    <div className="animate-in">
      {/* Greeting */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800 }}>
          Good {today.getHours() < 12 ? 'Morning' : today.getHours() < 17 ? 'Afternoon' : 'Evening'}, {session?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
          {today.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
        </p>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '16px', marginBottom: '28px' }}>
        <div className="kpi-card" id="kpi-my-revenue">
          <span style={{ fontSize: '24px' }}>💰</span>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800 }}>${todayRevenue.toFixed(2)}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>My Sales Today</div>
          </div>
        </div>
        <div className="kpi-card" id="kpi-my-orders">
          <span style={{ fontSize: '24px' }}>🧾</span>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800 }}>{todayOrders?.length ?? 0}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Orders Completed</div>
          </div>
        </div>
        <div className="kpi-card" id="kpi-active">
          <span style={{ fontSize: '24px' }}>⚡</span>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800 }}>{activeOrders?.length ?? 0}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Active Orders</div>
          </div>
        </div>
      </div>

      {/* Clock In/Out + Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Shift Status</h3>
          {activeShift
            ? (
              <div>
                <div className="badge badge-green" style={{ marginBottom: '12px' }}>● Clocked In</div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Since {new Date(activeShift.clock_in).toLocaleTimeString()}
                </p>
                <ClockOutButton shiftId={activeShift.id} />
              </div>
            )
            : (
              <div>
                <div className="badge badge-gray" style={{ marginBottom: '12px' }}>○ Not Clocked In</div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Clock in to start tracking your shift
                </p>
                <ClockInButton />
              </div>
            )
          }
        </div>

        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link id="qa-new-order" href="/staff/orders/new" className="btn btn-primary" style={{ textDecoration: 'none', width: '100%' }}>
              ＋ Take New Order
            </Link>
            <Link id="qa-my-orders" href="/staff/orders" className="btn btn-secondary" style={{ textDecoration: 'none', width: '100%' }}>
              🗒 View My Orders
            </Link>
          </div>
        </div>
      </div>

      {/* Active Orders */}
      {(activeOrders?.length ?? 0) > 0 && (
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>My Active Orders</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '12px' }}>
            {activeOrders?.map((o: any) => (
              <Link key={o.id} href={`/staff/orders/${o.id}`} style={{ textDecoration: 'none' }}>
                <div className="glass-card" style={{ padding: '16px', cursor: 'pointer' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {o.order_type === 'dine_in' ? `Table ${o.table?.table_number}` : o.order_type.replace('_',' ')}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--brand-400)' }}>${Number(o.total).toFixed(2)}</div>
                  <span className={`badge ${o.status === 'billed' ? 'badge-blue' : 'badge-orange'}`} style={{ marginTop: '8px' }}>
                    {o.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Small client components for clock actions
function ClockInButton() {
  return (
    <form action="/api/shifts" method="POST">
      <button id="clock-in-btn" type="submit" className="btn btn-primary">
        ▶ Clock In
      </button>
    </form>
  )
}

function ClockOutButton({ shiftId }: { shiftId: string }) {
  return (
    <form action={`/api/shifts/${shiftId}`} method="POST">
      <input type="hidden" name="_method" value="PUT" />
      <button id="clock-out-btn" type="submit" className="btn btn-secondary">
        ■ Clock Out
      </button>
    </form>
  )
}
