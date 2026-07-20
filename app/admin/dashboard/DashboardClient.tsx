'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
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
  paid:     'var(--success)',
  active:   'var(--accent-dark)',
  billed:   'var(--info)',
  void:     'var(--charcoal-soft)',
  refunded: 'var(--warning)',
}

const STATUS_BG: Record<string, string> = {
  paid:     'var(--success-bg)',
  active:   'var(--accent-bg)',
  billed:   'var(--info-bg)',
  void:     'var(--surface-hover)',
  refunded: 'var(--warning-bg)',
}

const PIE_COLORS = ['#C8A97E', '#3A6B8A', '#4A7C59', '#9C7A2E', '#9B3A3A']

// KPI icons as SVG
const KpiIcons = {
  revenue: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  orders: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
    </svg>
  ),
  active: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  staff: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
      <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85"/>
    </svg>
  ),
}

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
        supabase.from('orders')
          .select('id, status, order_type, total, created_at, staff:users!staff_id(name), table:tables(table_number)')
          .in('status', ['active','billed'])
          .order('created_at', { ascending: false })
          .then(({ data }) => { if (data) setLiveOrders(data) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const fmt = (n: number) => formatCurrency(n, currency)

  const kpis = [
    { id: 'kpi-revenue', label: "Today's Revenue",  value: fmt(todayRevenue),  IconC: KpiIcons.revenue, accent: 'var(--accent)' },
    { id: 'kpi-orders',  label: "Today's Orders",   value: todayOrderCount,    IconC: KpiIcons.orders,  accent: 'var(--info)' },
    { id: 'kpi-active',  label: 'Active Orders',     value: liveOrders.length,  IconC: KpiIcons.active,  accent: 'var(--success)' },
    { id: 'kpi-staff',   label: 'Staff Accounts',    value: staffOnlineCount,   IconC: KpiIcons.staff,   accent: 'var(--charcoal-mid)' },
  ]

  return (
    <div className="animate-in">
      {/* Page header */}
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>{new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '16px', marginBottom: '28px' }}>
        {kpis.map(k => (
          <div key={k.id} id={k.id} className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `color-mix(in srgb, ${k.accent} 12%, white)`,
                border: `1px solid color-mix(in srgb, ${k.accent} 20%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: k.accent,
              }}>
                <k.IconC />
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 600,
                color: 'var(--charcoal-soft)',
                background: 'var(--surface-raised)',
                padding: '3px 9px', borderRadius: 999,
                border: '1px solid var(--border)',
              }}>Live</span>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--charcoal)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{k.value}</div>
              <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)', marginTop: '4px' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', marginBottom: '24px' }}>
        {/* Top selling items bar chart */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px', color: 'var(--charcoal)' }}>Top Selling Items</h3>
          {topItems.length === 0
            ? <div style={{ textAlign:'center', color:'var(--charcoal-soft)', padding:'40px 0', fontSize:'14px' }}>No sales data yet for today</div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topItems} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="product_name" tick={{ fill: 'var(--charcoal-soft)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--charcoal-soft)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--charcoal)', boxShadow: 'var(--shadow-md)', fontSize: 13 }}
                    cursor={{ fill: 'var(--surface-raised)' }}
                    formatter={(v: any) => [v, 'Qty Sold']}
                  />
                  <Bar dataKey="qty_sold" fill="var(--accent)" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Order type pie */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px', color: 'var(--charcoal)' }}>Order Types</h3>
          {recentOrders.length === 0
            ? <div style={{ textAlign:'center', color:'var(--charcoal-soft)', padding:'40px 0', fontSize:'14px' }}>No orders yet</div>
            : (() => {
                const typeMap = recentOrders.reduce((acc: any, o) => {
                  acc[o.order_type] = (acc[o.order_type] || 0) + 1
                  return acc
                }, {})
                const pieData = Object.entries(typeMap).map(([name, value]) => ({ name, value }))
                return (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} dataKey="value" paddingAngle={3}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--charcoal)', boxShadow: 'var(--shadow-md)', fontSize: 13 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )
              })()
          }
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'12px' }}>
            {['dine_in','takeaway','delivery'].map((t,i) => (
              <span key={t} style={{ fontSize:'12px', color:'var(--charcoal-soft)', display:'flex', alignItems:'center', gap:'5px' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:PIE_COLORS[i], display:'inline-block' }}/>
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
            <h3 style={{ fontSize:'14px', fontWeight:700, color:'var(--charcoal)' }}>Active Orders</h3>
            <span className="badge badge-orange pulse-glow">{liveOrders.length} Live</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxHeight:'280px', overflowY:'auto' }}>
            {liveOrders.length === 0
              ? <div style={{ textAlign:'center', color:'var(--charcoal-soft)', padding:'32px 0', fontSize:'14px' }}>No active orders right now</div>
              : liveOrders.map((o: any) => (
                <div key={o.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'11px 14px',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius:'10px',
                }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'var(--charcoal)' }}>
                      {o.order_type === 'dine_in' ? `Table ${o.table?.table_number ?? '?'}` : o.order_type.replace('_',' ')}
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--charcoal-soft)', marginTop:'2px' }}>{o.staff?.name ?? 'Unknown'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:'14px', fontWeight:700, color:'var(--charcoal)' }}>{fmt(o.total)}</div>
                    <span style={{
                      fontSize:'11px',
                      color: STATUS_COLORS[o.status] ?? 'var(--charcoal-soft)',
                      background: STATUS_BG[o.status] ?? 'var(--surface-hover)',
                      fontWeight:600,
                      padding:'2px 8px', borderRadius:999,
                      textTransform:'capitalize',
                    }}>{o.status}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Recent Orders */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize:'14px', fontWeight:700, color:'var(--charcoal)', marginBottom:'16px' }}>Recent Orders</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxHeight:'280px', overflowY:'auto' }}>
            {recentOrders.length === 0
              ? <div style={{ textAlign:'center', color:'var(--charcoal-soft)', padding:'32px 0', fontSize:'14px' }}>No orders yet</div>
              : recentOrders.map((o: any) => (
                <div key={o.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'11px 14px',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius:'10px',
                }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'var(--charcoal)' }}>
                      {o.order_type === 'dine_in' ? `Table ${o.table?.table_number ?? '?'}` : o.order_type.replace('_',' ')}
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--charcoal-soft)', marginTop:'2px' }}>{new Date(o.created_at).toLocaleTimeString('en-US')}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:'14px', fontWeight:700, color:'var(--charcoal)' }}>{fmt(o.total)}</div>
                    <span style={{
                      fontSize:'11px',
                      color: STATUS_COLORS[o.status] ?? 'var(--charcoal-soft)',
                      background: STATUS_BG[o.status] ?? 'var(--surface-hover)',
                      fontWeight:600,
                      padding:'2px 8px', borderRadius:999,
                      textTransform:'capitalize',
                    }}>{o.status}</span>
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
