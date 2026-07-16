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
  total: number
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

export default function StaffOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchCurrency()
    fetchOrders()
  }, [])

  const fetchCurrency = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'currency').single()
    if (data?.value) setCurrency(data.value as any)
  }

  const fetchOrders = async () => {
    try {
      // 1. Get current logged in user (staff member)
      const { data: { user } } = await supabase.auth.getUser()
      const staffAuthId = user?.id

      if (!staffAuthId) {
        // Look for staff JWT cookie fallback via session details
        // In client component we rely on supabase client session if available
        // Or if we are custom staff logged in, we fetch from our local storage
      }

      // Check current session
      const { data: sessionData } = await supabase.auth.getSession()

      // Unified check: we query '/api/orders' which enforces staff filter on backend
      const res = await fetch('/api/orders')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setOrders(json.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>My Orders History</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            View and manage your shift orders.
          </p>
        </div>
        <Link id="new-order-float-btn" href="/staff/orders/new" className="btn btn-primary">
          ＋ New Order
        </Link>
      </div>

      {error && <div className="badge badge-red" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

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
                <th>Table / Source</th>
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
                    {o.order_type === 'dine_in' ? (
                      <span className="badge badge-gray">Table {o.table?.table_number ?? '?'}</span>
                    ) : (
                      <span className="badge badge-blue">{o.order_type}</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {formatCurrency(o.total, currency)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[o.status] || 'badge-gray'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td>
                    <Link href={`/staff/orders/${o.id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                      View / Actions
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗒</div>
            <p>You haven't taken any orders in this session yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
