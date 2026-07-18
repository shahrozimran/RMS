'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PendingQrOrder {
  id: string
  table_id: number
  customer_name: string | null
  items: { product_name: string; quantity: number; unit_price: number; variant_label?: string | null }[]
  status: 'pending' | 'confirmed' | 'rejected'
  created_at: string
  table: { table_number: string; section: string | null } | null
}

interface HistoricalQrOrder {
  id: string
  customer_name: string | null
  items: { product_name: string; quantity: number; unit_price: number; variant_label?: string | null }[]
  status: 'confirmed' | 'rejected'
  created_at: string
  table: { table_number: string } | null
}

export default function StaffQrOrdersWorkspace() {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
  const [pendingOrders, setPendingOrders] = useState<PendingQrOrder[]>([])
  const [historyOrders, setHistoryOrders] = useState<HistoricalQrOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const prevCountRef = useRef(0)
  const supabase = createClient()

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/qr/pending')
      const json = await res.json()
      if (!res.ok) return
      const orders = json.data || []

      // Play alert sound if a new order arrives
      if (orders.length > prevCountRef.current) {
        try { audioRef.current?.play() } catch {}
      }
      prevCountRef.current = orders.length
      setPendingOrders(orders)
    } catch {}
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/qr/history')
      const json = await res.json()
      if (!res.ok) return
      setHistoryOrders(json.data || [])
    } catch {}
  }, [])

  // Initial load + realtime subscription
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchPending(), fetchHistory()])
      setLoading(false)
    }
    init()

    const channel = supabase
      .channel('qr-orders-workspace')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'qr_pending_orders' },
        () => {
          fetchPending()
          fetchHistory()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchPending, fetchHistory])

  const handleConfirm = async (id: string) => {
    setProcessingId(id)
    setActionError('')
    try {
      const res = await fetch(`/api/qr/pending/${id}/confirm`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to confirm order')
      await Promise.all([fetchPending(), fetchHistory()])
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (id: string) => {
    setProcessingId(id)
    setActionError('')
    try {
      const res = await fetch(`/api/qr/pending/${id}/reject`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reject order')
      await Promise.all([fetchPending(), fetchHistory()])
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="animate-in">
      {/* Sound notification element */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA..." type="audio/wav" />
      </audio>

      {/* Header */}
      <div className="page-header">
        <h1>📱 Customer Self-Orders</h1>
        <p>Confirm or reject incoming self-service table orders in real-time.</p>
      </div>

      {actionError && (
        <div className="badge badge-red" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', display: 'block' }}>
          ⚠️ {actionError}
        </div>
      )}

      {/* Workspace Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
        <button
          className="btn"
          onClick={() => setActiveTab('pending')}
          style={{
            background: activeTab === 'pending' ? 'var(--charcoal)' : 'transparent',
            color: activeTab === 'pending' ? '#fff' : 'var(--charcoal-mid)',
            minHeight: '38px',
            padding: '6px 16px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          Incoming Queue
          {pendingOrders.length > 0 && (
            <span style={{
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '10px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 800
            }}>
              {pendingOrders.length}
            </span>
          )}
        </button>
        <button
          className="btn"
          onClick={() => setActiveTab('history')}
          style={{
            background: activeTab === 'history' ? 'var(--charcoal)' : 'transparent',
            color: activeTab === 'history' ? '#fff' : 'var(--charcoal-mid)',
            minHeight: '38px',
            padding: '6px 16px',
            borderRadius: '8px'
          }}
        >
          History Logs
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--charcoal-soft)' }}>
          Loading workspace orders...
        </div>
      ) : activeTab === 'pending' ? (
        /* PENDING ORDERS QUEUE */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {pendingOrders.map((order) => {
            const isProcessing = processingId === order.id
            const total = order.items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
            const waitTime = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000)
            const waitLabel = waitTime < 60 ? `${waitTime}s ago` : `${Math.floor(waitTime / 60)}m ago`

            return (
              <div
                key={order.id}
                className="surface-card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  border: '1.5px solid var(--accent)',
                  borderRadius: '16px',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                {/* Meta details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-orange" style={{ fontSize: '13px', padding: '4px 12px' }}>
                    🪑 Table {order.table?.table_number ?? `T${order.table_id}`}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--charcoal-soft)' }}>{waitLabel}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>
                    👤 {order.customer_name || 'Guest Customer'}
                  </span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-dark)', fontSize: '15px' }}>
                    ${total.toFixed(2)}
                  </span>
                </div>

                {/* Items Box */}
                <div style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {order.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--charcoal-mid)' }}>
                      <span>
                        <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{item.quantity}x</span>{' '}
                        {item.product_name}
                        {item.variant_label && <span style={{ opacity: 0.7 }}> ({item.variant_label})</span>}
                      </span>
                      <span>${(item.unit_price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Confirm/Reject Actions */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleReject(order.id)}
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                  >
                    Reject
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleConfirm(order.id)}
                    className="btn btn-primary"
                    style={{ flex: 2, background: 'linear-gradient(135deg, #4A7C59, #3A6B8A)', color: '#fff', border: 'none' }}
                  >
                    {isProcessing ? 'Processing…' : '✓ Confirm Order'}
                  </button>
                </div>
              </div>
            )
          })}

          {pendingOrders.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'var(--charcoal-soft)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📱</div>
              <h3 style={{ fontSize: '15px', color: 'var(--charcoal)', marginBottom: '4px' }}>Queue is Clear</h3>
              <p style={{ fontSize: '13px', margin: 0 }}>No customers have submitted self-orders recently.</p>
            </div>
          )}
        </div>
      ) : (
        /* HISTORY ORDER LOGS */
        <div className="surface-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Table</th>
                <th>Customer</th>
                <th>Items List</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {historyOrders.map((hOrder) => {
                const total = hOrder.items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
                return (
                  <tr key={hOrder.id}>
                    <td style={{ fontSize: '13px' }}>{new Date(hOrder.created_at).toLocaleTimeString()}</td>
                    <td>
                      <span className="badge badge-gray">Table {hOrder.table?.table_number ?? '?'}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{hOrder.customer_name}</td>
                    <td style={{ fontSize: '12px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hOrder.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ')}
                    </td>
                    <td style={{ fontWeight: 700 }}>${total.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${hOrder.status === 'confirmed' ? 'badge-green' : 'badge-red'}`} style={{ textTransform: 'capitalize' }}>
                        {hOrder.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {historyOrders.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--charcoal-soft)' }}>
              No QR orders processed today.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
