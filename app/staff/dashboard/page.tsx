'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { pollVisible } from '@/lib/utils/poll'
import { apiGet } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, CalendarDays, ClipboardList, Clock3, DollarSign, Flame, LogIn, LogOut, Plus, QrCode } from 'lucide-react'
import { readSettings } from '@/lib/api/client'
import { DEFAULT_CURRENCY, formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import EmptyState from '@/components/ui/EmptyState'
import WorkspaceLoading from '@/components/ui/WorkspaceLoading'

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
function QrOrdersPanel({ currency }: { currency: CurrencyConfig }) {
  const router = useRouter()
  const [pendingOrders, setPendingOrders] = useState<PendingQrOrder[]>([])
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const prevCountRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
    // Custom staff sessions authenticate through the same-origin API.
    return pollVisible(fetchPending)
  }, [fetchPending])

  const handleConfirm = async (id: string) => {
    setProcessingId(id)
    setActionErrors(e => ({ ...e, [id]: '' }))
    try {
      const res = await fetch(`/api/qr/pending/${id}/confirm`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to confirm')
      
      // Auto-redirect to kitchen receipt print screen
      if (json.data?.id) {
        router.push(`/staff/orders/${json.data.id}/kitchen-receipt`)
      } else {
        fetchPending()
      }
    } catch (e) {
      setActionErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : 'Unable to process this order.' }))
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
    } catch (e) {
      setActionErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : 'Unable to process this order.' }))
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
        background: 'linear-gradient(135deg, rgba(44,121,85,0.08), rgba(44,121,85,0.03))',
        border: '1px solid rgba(44,121,85,0.25)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 28,
        animation: 'pulse-border 2s ease-in-out infinite',
      }}>
        <style>{`
          @keyframes pulse-border {
            0%, 100% { border-color: rgba(44,121,85,0.25); box-shadow: 0 0 0 0 rgba(44,121,85,0); }
            50% { border-color: rgba(44,121,85,0.5); box-shadow: 0 0 0 6px rgba(44,121,85,0.05); }
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
              background: 'var(--accent-bg)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
            }}></div>
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
            background: 'var(--accent-dark)', color: '#fff', borderRadius: 20,
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
                      {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatCurrency(total,currency)} · {waitLabel}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, color: 'var(--accent)', fontWeight: 600,
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
                    {isProcessing ? 'Processing…' : 'Confirm order'}
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
  const [session,setSession]=useState<{name:string;id:string}|null>(null)
  const [summary,setSummary]=useState({todayRevenue:0,todayOrderCount:0})
  const [orders,setOrders]=useState<ActiveOrder[]>([])
  const [shift,setShift]=useState<{id:string;clock_in:string}|null>(null)
  const [currency,setCurrency]=useState<CurrencyConfig>(DEFAULT_CURRENCY)
  const [loading,setLoading]=useState(true)
  const [clockAction,setClockAction]=useState('')
  const [error,setError]=useState('')
  const [ready,setReady]=useState(false)
  const loadDashboard=useCallback(async()=>{
    try{
      const now=new Date();const from=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString()
      const [profile,totals,active,shifts,settings]=await Promise.all([
        apiGet<{data:{id:string;name:string}}>('/api/staff/me'),
        apiGet<{todayRevenue:number;todayOrderCount:number}>('/api/staff/summary?from='+encodeURIComponent(from)),
        apiGet<{data:ActiveOrder[]}>('/api/orders?status=active&limit=50'),
        apiGet<{activeShift:{id:string;clock_in:string}|null}>('/api/shifts'),readSettings()
      ])
      setSession(profile.data);setSummary(totals);setOrders(active.data);setShift(shifts.activeShift)
      const c=settings.find(s=>s.key==='currency');if(c?.key==='currency')setCurrency(c.value)
      setError('');setReady(true)
    }catch(e){setError(e instanceof Error?e.message:'Unable to load your workspace.')}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{void Promise.resolve().then(loadDashboard)},[loadDashboard])
  async function handleClock(action:'in'|'out'){
    setClockAction(action);setError('')
    try{
      const response=action==='in'?await fetch('/api/shifts',{method:'POST'}):await fetch(`/api/shifts/${shift?.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({clock_out:new Date().toISOString()})})
      if(!response.ok){const data=await response.json();throw new Error(data.error||'Unable to update your shift.')}
      await loadDashboard()
    }catch(e){setError(e instanceof Error?e.message:'Unable to update your shift.')}finally{setClockAction('')}
  }
  if(loading||!ready)return <WorkspaceLoading error={error} onRetry={()=>{setError('');setLoading(true);void loadDashboard()}}/>
  const today=new Date();const greeting=today.getHours()<12?'morning':today.getHours()<17?'afternoon':'evening'
  const fmt=(n:number)=>formatCurrency(n,currency)
  return <div className="animate-in"><div className="workspace-title"><div><span className="eyebrow">Your service workspace</span><h1>Good {greeting}, {session?.name.split(' ')[0]}.</h1><p>A fresh service. A chance to make someone’s day.</p></div><div className="workspace-title-actions"><span className="date-pill"><CalendarDays size={14}/>{today.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</span><Link href="/staff/orders/new" className="btn btn-primary"><Plus size={15}/>Take an order</Link></div></div>
  {error&&<div className="alert" role="alert">{error}</div>}<QrOrdersPanel currency={currency}/>
  <div className="staff-metrics">{[{id:'kpi-my-revenue',label:'Your sales today',value:fmt(summary.todayRevenue),foot:'Completed payments',Icon:DollarSign},{id:'kpi-my-orders',label:'Orders completed',value:summary.todayOrderCount,foot:'Your service today',Icon:ClipboardList},{id:'kpi-active',label:'Active orders',value:orders.length,foot:'Currently in your care',Icon:Flame}].map(m=><div className="metric-card" key={m.id} id={m.id}><div className="metric-top">{m.label}<span className="metric-icon"><m.Icon size={17}/></span></div><div className="metric-value num">{m.value}</div><div className="metric-foot">{m.foot}</div></div>)}</div>
  <div className="staff-dashboard-columns"><section className="panel"><div className="panel-heading"><div><h2>Your shift</h2><p>A little structure for a smoother day</p></div><Clock3 size={18} className="muted"/></div><div style={{padding:'8px 22px 22px'}}><span className={`badge ${shift?'badge-green':'badge-gray'}`}>{shift?'Clocked in':'Off the clock'}</span><p style={{fontSize:12,color:'var(--charcoal-soft)',margin:'15px 0 20px'}}>{shift?`Your shift started at ${new Date(shift.clock_in).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}.`:'Ready for service? Clock in to begin your shift.'}</p><button id={shift?'clock-out-btn':'clock-in-btn'} className={`btn ${shift?'btn-secondary':'btn-primary'}`} disabled={!!clockAction} onClick={()=>handleClock(shift?'out':'in')}>{shift?<LogOut size={14}/>:<LogIn size={14}/>} {clockAction?'Updating shift…':shift?'End your shift':'Start your shift'}</button></div></section>
  <section className="panel"><div className="panel-heading"><div><h2>A good place to start</h2><p>Your most useful shortcuts</p></div><ArrowUpRight size={17} className="muted"/></div><div className="staff-quick-actions"><Link id="qa-new-order" href="/staff/orders/new"><span><Plus size={17}/></span><div><strong>Take a new order</strong><small>Something delicious, coming right up</small></div><ArrowRight size={14}/></Link><Link id="qa-my-orders" href="/staff/orders"><span><ClipboardList size={17}/></span><div><strong>View your orders</strong><small>Keep track of every table and ticket</small></div><ArrowRight size={14}/></Link><Link href="/staff/qr-orders"><span><QrCode size={17}/></span><div><strong>Incoming guest orders</strong><small>Confirm orders placed from the table</small></div><ArrowRight size={14}/></Link></div></section></div>
  <section className="panel"><div className="panel-heading"><div><h2>In your care</h2><p>Your active orders</p></div><Link href="/staff/orders">All orders<ArrowUpRight size={13}/></Link></div>{orders.length?<div className="staff-order-grid">{orders.map(o=><Link key={o.id} href={`/staff/orders/${o.id}`} className="staff-order-card"><div className="row space-between"><span className="order-number"><ClipboardList size={17}/></span><span className={`badge ${o.status==='billed'?'badge-blue':'badge-green'}`}>{o.status}</span></div><h3>{o.order_type==='dine_in'?`Table ${o.table?.table_number||'—'}`:o.order_type.replace('_',' ')}</h3><div className="row space-between"><strong className="num">{fmt(Number(o.total))}</strong><ArrowUpRight size={15}/></div></Link>)}</div>:<EmptyState title="Ready for your next guest" description="Your active orders will appear here as you start service." action={<Link className="btn btn-secondary btn-sm" href="/staff/orders/new">Take your first order<ArrowRight size={13}/></Link>}/>}</section></div>
}
