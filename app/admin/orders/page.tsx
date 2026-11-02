'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import Link from 'next/link'

interface Order {
  id: string
  created_at: string
  status: 'draft' | 'active' | 'billed' | 'paid' | 'void' | 'refunded'
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  source: 'staff' | 'qr'
  total: number
  staff: { name: string } | null
  table: { table_number: string } | null
}

const STATUS_CLASS: Record<string, string> = {
  paid: 'badge-green',
  active: 'badge-orange',
  billed: 'badge-blue',
  void: 'badge-red',
  refunded: 'badge-yellow',
  draft: 'badge-gray'
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchCurrency()
    fetchOrders()

    // Realtime orders update
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [statusFilter, typeFilter, sourceFilter, page])

  const fetchCurrency = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'currency').single()
    if (data?.value) setCurrency(data.value as any)
  }

  const fetchOrders = async () => {
    try {
      let query = supabase
        .from('orders')
        .select('id, created_at, status, order_type, source, total, staff:users!staff_id(name), table:tables(table_number)', { count: 'exact' })
        .order('created_at', { ascending: false }).range((page-1)*50,page*50-1)

      if (statusFilter) query = query.eq('status', statusFilter)
      if (typeFilter) query = query.eq('order_type', typeFilter)
      if (sourceFilter) query = query.eq('source', sourceFilter)

      const { data, error, count } = await query
      if (error) throw error
      setOrders((data as any) || [])
      setCount(count || 0)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const qrOrderCount = orders.filter(o => o.source === 'qr').length

  return (
    <div className="animate-in">
      <div className="page-header">
        <span className="eyebrow">Keep the service flowing</span><h1>Every order, in one place.</h1>
        <p>Real-time view of all restaurant transactions, billing status, and table sessions.</p>
      </div>

      {error && <div className="badge badge-red" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      {/* QR orders callout (if any in current view) */}
      {qrOrderCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(0,180,255,0.07)', border: '1px solid rgba(0,180,255,0.2)',
          borderRadius: 12, padding: '12px 18px', marginBottom: 20
        }}>
          <span style={{ fontSize: 20 }}>📱</span>
          <span style={{ fontSize: 13, color: 'var(--info)', fontWeight: 600 }}>
            {qrOrderCount} QR-sourced order{qrOrderCount !== 1 ? 's' : ''} in this view
          </span>
          {sourceFilter !== 'qr' && (
            <button
              style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(0,180,255,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: 12, color: 'var(--info)', cursor: 'pointer' }}
              onClick={() => setSourceFilter('qr')}
            >
              Show only QR orders
            </button>
          )}
          {sourceFilter === 'qr' && (
            <button
              style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', fontSize: 12, color: 'var(--charcoal-soft)', cursor: 'pointer' }}
              onClick={() => setSourceFilter('')}
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Filters bar */}
      <nav aria-label="Order pages" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-secondary btn-sm" disabled={page === 1 || loading} onClick={() => setPage(p => p-1)}>Previous</button>
        <span>Page {page} · {count} orders</span>
        <button className="btn btn-secondary btn-sm" disabled={page*50 >= count || loading} onClick={() => setPage(p => p+1)}>Next</button>
      </nav>
      <div className="surface-card" style={{ padding: '16px', display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="input-group" style={{ width: '160px' }}>
          <label className="input-label" htmlFor="order-status-filter">Status</label>
          <select
            id="order-status-filter"
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minHeight: '36px', padding: '6px 12px' }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="billed">Billed</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        <div className="input-group" style={{ width: '160px' }}>
          <label className="input-label" htmlFor="order-type-filter">Order Type</label>
          <select
            id="order-type-filter"
            className="input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ minHeight: '36px', padding: '6px 12px' }}
          >
            <option value="">All Types</option>
            <option value="dine_in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
          </select>
        </div>

        <div className="input-group" style={{ width: '160px' }}>
          <label className="input-label" htmlFor="order-source-filter">Source</label>
          <select
            id="order-source-filter"
            className="input"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{ minHeight: '36px', padding: '6px 12px' }}
          >
            <option value="">All Sources</option>
            <option value="staff">Staff POS</option>
            <option value="qr">QR Self-Order</option>
          </select>
        </div>
      </div>

      {/* Table view */}
      <div className="surface-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading orders...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Time</th>
                <th>Type</th>
                <th>Source</th>
                <th>Table / Info</th>
                <th>Staff</th>
                <th>Total Bill</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>#{o.id.substring(0, 8)}...</td>
                  <td style={{ fontSize: '13px' }}>{new Date(o.created_at).toLocaleTimeString()}</td>
                  <td style={{ textTransform: 'capitalize' }}>{o.order_type.replace('_', ' ')}</td>
                  <td>
                    {o.source === 'qr' ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'rgba(0,180,255,0.1)', color: 'var(--info)',
                        border: '1px solid rgba(0,180,255,0.2)',
                        borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700
                      }}>
                        📱 QR Order
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'rgba(255,255,255,0.04)', color: 'var(--charcoal-soft)',
                        border: '1px solid var(--border)',
                        borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 600
                      }}>
                        🖥 Staff POS
                      </span>
                    )}
                  </td>
                  <td>
                    {o.order_type === 'dine_in' ? (
                      <span className="badge badge-gray">Table {o.table?.table_number ?? '?'}</span>
                    ) : (
                      <span className="badge badge-blue">{o.order_type}</span>
                    )}
                  </td>
                  <td>{o.staff?.name || <span style={{ color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>System</span>}</td>
                  <td style={{ fontWeight: 600, color: 'var(--charcoal)' }}>
                    {formatCurrency(o.total, currency)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[o.status] || 'badge-gray'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                      Audit & Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--charcoal-soft)' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--charcoal-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
            <p style={{ fontSize:'14px' }}>No orders found matching the filter criteria.</p>
          </div>
        )}
      </div>
    </div>
  )
}
