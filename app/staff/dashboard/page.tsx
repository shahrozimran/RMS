'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

/* ─── Types ─────────────────────────────────────────── */
interface PendingQrOrder {
  id: string
  table_id: number
  customer_name: string | null
  items: { product_name: string; quantity: number; unit_price: number; variant_label?: string | null }[]
  status: 'pending' | 'confirmed' | 'rejected'
  created_at: string
  table: { table_number: string; section: string | null } | null
}

interface ActiveOrder {
  id: string
  status: string
  order_type: string
  total: number
  table: { table_number: string } | null
}

/* ─── QR Incoming Orders Panel ───────────────────────── */
function QrOrdersPanel() {
  const [pendingOrders, setPendingOrders] = useState<PendingQrOrder[]>([])
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const prevCountRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const supabase = createClient()

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/qr/pending')
      const json = await res.json()
      if (!res.ok) return
      const orders: PendingQrOrder[] = json.data || []

      // Play notification sound if new orders arrived
      if (orders.length > prevCountRef.current) {
        try { audioRef.current?.play() } catch {}
      }
      prevCountRef.current = orders.length
      setPendingOrders(orders)
    } catch {}
  }, [])

  useEffect(() => {
    fetchPending()

    // Supabase realtime subscription on qr_pending_orders
    const channel = supabase
      .channel('qr-pending-panel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'qr_pending_orders' },
        () => { fetchPending() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchPending])

  const handleConfirm = async (id: string) => {
    setProcessingId(id)
    setActionErrors(e => ({ ...e, [id]: '' }))
    try {
      const res = await fetch(`/api/qr/pending/${id}/confirm`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to confirm')
      fetchPending()
    } catch (e: any) {
      setActionErrors(prev => ({ ...prev, [id]: e.message }))
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (id: string) => {
    setProcessingId(id)
    setActionErrors(e => ({ ...e, [id]: '' }))
    try {
      const res = await fetch(`/api/qr/pending/${id}/reject`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reject')
      fetchPending()
    } catch (e: any) {
      setActionErrors(prev => ({ ...prev, [id]: e.message }))
    } finally {
      setProcessingId(null)
    }
  }

  if (pendingOrders.length === 0) return null

  return (
    <>
      {/* Invisible audio element for notification sound */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA..." type="audio/wav" />
      </audio>

      <div style={{
        background: 'linear-gradient(135deg, rgba(255,165,0,0.08), rgba(255,100,0,0.05))',
        border: '1px solid rgba(255,165,0,0.25)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 28,
        animation: 'pulse-border 2s ease-in-out infinite',
      }}>
        <style>{`
          @keyframes pulse-border {
            0%, 100% { border-color: rgba(255,165,0,0.25); box-shadow: 0 0 0 0 rgba(255,165,0,0); }
            50% { border-color: rgba(255,165,0,0.5); box-shadow: 0 0 0 6px rgba(255,165,0,0.05); }
          }
          @keyframes slideInCard {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,165,0,0.15)',
              border: '1px solid rgba(255,165,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
            }}>📱</div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--charcoal)', margin: 0 }}>
                Incoming QR Orders
              </h3>
              <p style={{ fontSize: 12, color: 'var(--charcoal-soft)', margin: 0 }}>
                Customers are waiting for confirmation
              </p>
            </div>
          </div>
          <span style={{
            background: '#ff8c00', color: '#fff', borderRadius: 20,
            padding: '4px 12px', fontSize: 13, fontWeight: 800
          }}>
            {pendingOrders.length} Pending
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pendingOrders.map(order => {
            const isProcessing = processingId === order.id
            const itemCount = order.items.reduce((s, i) => s + i.quantity, 0)
            const total = order.items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
            const waitTime = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000)
            const waitLabel = waitTime < 60 ? `${waitTime}s ago` : `${Math.floor(waitTime / 60)}m ago`

            return (
              <div key={order.id} style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px',
                animation: 'slideInCard 0.3s ease-out',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        background: 'rgba(0,180,255,0.12)', color: 'var(--info)',
                        border: '1px solid rgba(0,180,255,0.2)',
                        borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700
                      }}>
                        {order.table?.table_number ?? `Table ${order.table_id}`}
                      </span>
                      {order.customer_name && (
                        <span style={{ fontSize: 12, color: 'var(--charcoal-soft)' }}>
                          👤 {order.customer_name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--charcoal-soft)' }}>
                      {itemCount} item{itemCount !== 1 ? 's' : ''} · ${total.toFixed(2)} · {waitLabel}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, color: 'rgba(255,165,0,0.8)', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}>
                    QR Order
                  </span>
                </div>

                {/* Items preview */}
                <div style={{
                  background: 'var(--surface)', borderRadius: 8, padding: '8px 12px',
                  marginBottom: 12, fontSize: 12, color: 'var(--charcoal-soft)', lineHeight: 1.7
                }}>
                  {order.items.slice(0, 4).map((item, idx) => (
                    <div key={idx}>
                      <span style={{ fontWeight: 600, color: 'var(--charcoal)' }}>{item.quantity}×</span>{' '}
                      {item.product_name}
                      {item.variant_label && <span style={{ opacity: 0.6 }}> ({item.variant_label})</span>}
                    </div>
                  ))}
                  {order.items.length > 4 && (
                    <div style={{ opacity: 0.5 }}>+{order.items.length - 4} more item{order.items.length - 4 !== 1 ? 's' : ''}…</div>
                  )}
                </div>

                {actionErrors[order.id] && (
                  <div style={{ fontSize: 11, color: 'var(--error)', marginBottom: 8, padding: '4px 8px', background: 'var(--error-bg)', borderRadius: 6 }}>
                    {actionErrors[order.id]}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    id={`qr-reject-${order.id}`}
                    disabled={isProcessing}
                    onClick={() => handleReject(order.id)}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 9, border: '1px solid rgba(255,71,87,0.3)',
                      background: 'rgba(255,71,87,0.08)', color: 'var(--error)',
                      fontWeight: 600, fontSize: 13, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.6 : 1
                    }}
                  >
                    ✕ Reject
                  </button>
                  <button
                    id={`qr-confirm-${order.id}`}
                    disabled={isProcessing}
                    onClick={() => handleConfirm(order.id)}
                    style={{
                      flex: 2, padding: '9px 0', borderRadius: 9, border: 'none',
                      background: isProcessing ? 'var(--surface-3)' : 'linear-gradient(135deg, #00c896, #00b4d8)',
                      color: isProcessing ? 'var(--charcoal-soft)' : '#fff',
                      fontWeight: 700, fontSize: 13, cursor: isProcessing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isProcessing ? 'Processing…' : '✓ Confirm Order'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/* ─── Main Dashboard Page ────────────────────────────── */
export default function StaffDashboardPage() {
  const [session, setSession] = useState<{ name: string; id: string } | null>(null)
  const [todayOrders, setTodayOrders] = useState<any[]>([])
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])
  const [activeShift, setActiveShift] = useState<{ id: string; clock_in: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [clockAction, setClockAction] = useState('')
  const supabase = createClient()

  const today = new Date()

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      // Get session info
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: dbUser } = await supabase
          .from('users')
          .select('id, name')
          .eq('auth_user_id', user.id)
          .single()
        if (dbUser) setSession(dbUser)
      } else {
        // Staff JWT — get from API
        const res = await fetch('/api/staff/me').catch(() => null)
        if (res?.ok) {
          const json = await res.json()
          setSession(json)
        }
      }

      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

      // Use admin client to query — need to use fetch for auth-aware queries
      const [ordersRes, activeRes, shiftRes] = await Promise.all([
        fetch('/api/orders?status=paid&limit=200'),
        fetch('/api/orders?status=active&limit=50'),
        fetch('/api/shifts'),
      ])

      const ordersJson = ordersRes.ok ? await ordersRes.json() : { data: [] }
      const activeJson = activeRes.ok ? await activeRes.json() : { data: [] }
      const shiftJson = shiftRes.ok ? await shiftRes.json() : { activeShift: null }

      // Filter to today only
      const todayPaid = (ordersJson.data || []).filter((o: any) => o.created_at >= startOfDay)
      setTodayOrders(todayPaid)
      setActiveOrders(activeJson.data || [])
      setActiveShift(shiftJson.activeShift || null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total), 0)

  const handleClock = async (action: 'in' | 'out') => {
    setClockAction(action)
    try {
      if (action === 'in') {
        await fetch('/api/shifts', { method: 'POST' })
      } else if (activeShift) {
        await fetch(`/api/shifts/${activeShift.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clock_out: new Date().toISOString() }) })
      }
      await loadDashboard()
    } catch {}
    setClockAction('')
  }

  const greeting = today.getHours() < 12 ? 'Morning' : today.getHours() < 17 ? 'Afternoon' : 'Evening'
  const firstName = session?.name?.split(' ')[0] || 'there'

  return (
    <div className="animate-in">
      {/* Greeting */}
      <div className="page-header">
        <h1>Good {greeting}, {firstName}</h1>
        <p>{today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* ── QR Incoming Orders Panel (real-time) ── */}
      <QrOrdersPanel />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '16px', marginBottom: '28px' }}>
        <div className="kpi-card" id="kpi-my-revenue">
          <div style={{ width:36, height:36, borderRadius:9, background:'var(--accent-bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-dark)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color:'var(--charcoal)', letterSpacing:'-0.03em' }}>${todayRevenue.toFixed(2)}</div>
            <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)' }}>My Sales Today</div>
          </div>
        </div>
        <div className="kpi-card" id="kpi-my-orders">
          <div style={{ width:36, height:36, borderRadius:9, background:'var(--info-bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color:'var(--charcoal)', letterSpacing:'-0.03em' }}>{todayOrders.length}</div>
            <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)' }}>Orders Completed</div>
          </div>
        </div>
        <div className="kpi-card" id="kpi-active">
          <div style={{ width:36, height:36, borderRadius:9, background:'var(--success-bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color:'var(--charcoal)', letterSpacing:'-0.03em' }}>{activeOrders.length}</div>
            <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)' }}>Active Orders</div>
          </div>
        </div>
      </div>

      {/* Clock In/Out + Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color:'var(--charcoal)' }}>Shift Status</h3>
          {activeShift ? (
            <div>
              <div className="badge badge-green" style={{ marginBottom: '12px' }}>● Clocked In</div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Since {new Date(activeShift.clock_in).toLocaleTimeString()}
              </p>
              <button
                id="clock-out-btn"
                className="btn btn-secondary"
                disabled={clockAction !== ''}
                onClick={() => handleClock('out')}
              >
                {clockAction === 'out' ? 'Clocking out…' : '■ Clock Out'}
              </button>
            </div>
          ) : (
            <div>
              <div className="badge badge-gray" style={{ marginBottom: '12px' }}>○ Not Clocked In</div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Clock in to start tracking your shift
              </p>
              <button
                id="clock-in-btn"
                className="btn btn-primary"
                disabled={clockAction !== ''}
                onClick={() => handleClock('in')}
              >
                {clockAction === 'in' ? 'Clocking in…' : '▶ Clock In'}
              </button>
            </div>
          )}
        </div>

        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color:'var(--charcoal)' }}>Quick Actions</h3>
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
      {activeOrders.length > 0 && (
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color:'var(--charcoal)' }}>My Active Orders</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '12px' }}>
            {activeOrders.map((o: any) => (
              <Link key={o.id} href={`/staff/orders/${o.id}`} style={{ textDecoration: 'none' }}>
                <div className="glass-card" style={{ padding: '16px', cursor: 'pointer' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '4px' }}>
                    {o.order_type === 'dine_in' ? `Table ${o.table?.table_number}` : o.order_type.replace('_',' ')}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-dark)' }}>${Number(o.total).toFixed(2)}</div>
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
