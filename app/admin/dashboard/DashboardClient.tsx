'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  todayRevenue:     number
  todayOrderCount:  number
  activeOrderCount: number
  staffOnlineCount: number
  topItems:         any[]
  recentOrders:     any[]
  activeOrders:     any[]
  currency:         CurrencyConfig
}

const STATUS_COLORS: Record<string, string> = {
  paid:     '#22c55e',
  active:   '#f97316',
  billed:   '#3b82f6',
  void:     '#6b7280',
  refunded: '#eab308',
}

const PIE_COLORS = ['#f97316','#3b82f6','#22c55e','#eab308','#a855f7']

export default function AdminDashboardClient({
  todayRevenue, todayOrderCount, activeOrderCount, staffOnlineCount,
  topItems, recentOrders, activeOrders, currency,
}: Props) {
  const [liveOrders, setLiveOrders] = useState(activeOrders)

  // Realtime subscription for active orders
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        // Refetch active orders on any change
        supabase.from('orders')
          .select('id, status, order_type, total, created_at, staff:users(name), table:tables(table_number)')
          .in('status', ['active','billed'])
          .order('created_at', { ascending: false })
          .then(({ data }) => { if (data) setLiveOrders(data) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const fmt = (n: number) => formatCurrency(n, currency)

  const kpis = [
    { id: 'kpi-revenue',  label: "Today's Revenue",   value: fmt(todayRevenue),    icon: '💰', color: '#f97316' },
    { id: 'kpi-orders',   label: "Today's Orders",    value: todayOrderCount,      icon: '🧾', color: '#3b82f6' },
    { id: 'kpi-active',   label: 'Active Orders',      value: liveOrders.length,    icon: '⚡', color: '#22c55e' },
    { id: 'kpi-staff',    label: 'Staff Accounts',     value: staffOnlineCount,     icon: '👥', color: '#a855f7' },
  ]

  return (
    <div className="animate-in">
      {/* Page header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '14px' }}>
          {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '16px', marginBottom: '28px' }}>
        {kpis.map(k => (
          <div key={k.id} id={k.id} className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '24px' }}>{k.icon}</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: k.color, background: `${k.color}18`, padding: '3px 10px', borderRadius: 999 }}>Live</span>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>{k.value}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', marginBottom: '24px' }}>
        {/* Top selling items bar chart */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px' }}>Top Selling Items (Today)</h3>
          {topItems.length === 0
            ? <div style={{ textAlign:'center', color:'var(--text-muted)', padding:'40px 0', fontSize:'14px' }}>No sales data yet for today</div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topItems} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="product_name" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e1e27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f8fafc' }}
                    formatter={(v: any) => [v, 'Qty Sold']}
                  />
                  <Bar dataKey="qty_sold" fill="#f97316" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Order type pie */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px' }}>Order Types</h3>
          {recentOrders.length === 0
            ? <div style={{ textAlign:'center', color:'var(--text-muted)', padding:'40px 0', fontSize:'14px' }}>No orders yet</div>
            : (() => {
                const typeMap = recentOrders.reduce((acc: any, o) => {
                  acc[o.order_type] = (acc[o.order_type] || 0) + 1
                  return acc
                }, {})
                const pieData = Object.entries(typeMap).map(([name, value]) => ({ name, value }))
                return (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1e1e27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f8fafc' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )
              })()
          }
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'12px' }}>
            {['dine_in','takeaway','delivery'].map((t,i) => (
              <span key={t} style={{ fontSize:'12px', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'5px' }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background:PIE_COLORS[i], display:'inline-block' }}/>
                {t.replace('_',' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Active Orders + Recent Orders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Live Active Orders */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <h3 style={{ fontSize:'15px', fontWeight:700 }}>Active Orders</h3>
            <span className="badge badge-orange pulse-glow">{liveOrders.length} Live</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px', maxHeight:'280px', overflow:'auto' }}>
            {liveOrders.length === 0
              ? <div style={{ textAlign:'center', color:'var(--text-muted)', padding:'32px 0', fontSize:'14px' }}>No active orders right now</div>
              : liveOrders.map((o: any) => (
                <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:'var(--surface-3)', borderRadius:'10px' }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)' }}>
                      {o.order_type === 'dine_in' ? `Table ${o.table?.table_number ?? '?'}` : o.order_type.replace('_',' ')}
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>{o.staff?.name ?? 'Unknown'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:'14px', fontWeight:700, color:'var(--text-primary)' }}>{fmt(o.total)}</div>
                    <span style={{ fontSize:'11px', color: STATUS_COLORS[o.status] ?? '#94a3b8', fontWeight:600, textTransform:'capitalize' }}>{o.status}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Recent Orders */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize:'15px', fontWeight:700, marginBottom:'16px' }}>Recent Orders</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px', maxHeight:'280px', overflow:'auto' }}>
            {recentOrders.length === 0
              ? <div style={{ textAlign:'center', color:'var(--text-muted)', padding:'32px 0', fontSize:'14px' }}>No orders yet</div>
              : recentOrders.map((o: any) => (
                <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:'var(--surface-3)', borderRadius:'10px' }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)' }}>
                      {o.order_type === 'dine_in' ? `Table ${o.table?.table_number ?? '?'}` : o.order_type.replace('_',' ')}
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>{new Date(o.created_at).toLocaleTimeString()}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:'14px', fontWeight:700, color:'var(--text-primary)' }}>{fmt(o.total)}</div>
                    <span style={{ fontSize:'11px', color: STATUS_COLORS[o.status] ?? '#94a3b8', fontWeight:600, textTransform:'capitalize' }}>{o.status}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
