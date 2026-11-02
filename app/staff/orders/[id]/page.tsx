'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { readSettings } from '@/lib/api/client'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import Link from 'next/link'

interface OrderItem {
  id: string
  variant_label: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  tax_amount: number
  subtotal: number
  notes: string | null
  product: { name: string } | null
}

interface OrderDetail {
  id: string
  created_at: string
  status: 'draft' | 'active' | 'billed' | 'paid' | 'void' | 'refunded'
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  subtotal: number
  tax_amount: number
  service_charge: number
  discount_amount: number
  total: number
  notes: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_address: string | null
  table: { table_number: string } | null
  order_items: OrderItem[]
}

const STATUS_CLASS: Record<string, string> = {
  paid: 'badge-green',
  active: 'badge-orange',
  billed: 'badge-blue',
  void: 'badge-red',
  refunded: 'badge-yellow',
  draft: 'badge-gray'
}

export default function StaffOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [error, setError] = useState('')


  useEffect(() => {
    fetchCurrency()
    fetchOrderDetail()
  }, [id])

  const fetchCurrency = async () => {
    const data = (await readSettings()).find(s => s.key === 'currency')
    if (data?.value) setCurrency(data.value as any)
  }

  const fetchOrderDetail = async () => {
    try {
      const res = await fetch(`/api/orders/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load order details')
      setOrder(json.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading order details...</div>
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)', fontWeight: 600 }}>Error: {error}</div>
  if (!order) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Order not found.</div>

  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <div className="animate-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <Link href="/staff/orders" style={{ textDecoration: 'none', color: 'var(--text-muted)', fontSize: '14px' }}>
            ← Back to My Orders
          </Link>
          <h1 style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px' }}>
            Order Details: #{order.id.substring(0, 8)}
          </h1>
        </div>
        <span className={`badge ${STATUS_CLASS[order.status] || 'badge-gray'}`} style={{ fontSize: '13px', padding: '6px 12px' }}>
          {order.status}
        </span>
      </div>

      {error && <div className="badge badge-red" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px', display: 'block' }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Core Order Setup Details */}
        <div className="surface-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Order Setup</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Order Mode:</span>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', textTransform: 'capitalize' }}>
                {order.order_type.replace('_', ' ')}
              </p>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Table / Source:</span>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                {order.order_type === 'dine_in' ? `Table ${order.table?.table_number ?? '?'}` : 'Takeaway/Delivery'}
              </p>
            </div>
            {order.customer_name && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Customer Name:</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{order.customer_name}</p>
              </div>
            )}
            {order.customer_phone && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Phone:</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{order.customer_phone}</p>
              </div>
            )}
          </div>

          {order.order_type === 'delivery' && order.customer_address && (
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Delivery Address:</span>
              <p style={{ fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>{order.customer_address}</p>
            </div>
          )}

          {order.notes && (
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Special Instructions:</span>
              <p style={{ fontSize: '13px', fontStyle: 'italic', marginTop: '2px' }}>"{order.notes}"</p>
            </div>
          )}
        </div>

        {/* Order Items Table */}
        <div className="surface-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Items Summary</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {order.order_items.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', fontSize: '14px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {item.product?.name}
                    {item.variant_label && <span style={{ color: 'var(--brand-400)', fontSize: '11px' }}> ({item.variant_label})</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {item.quantity} × {fmt(item.unit_price)} | Tax: {item.tax_rate}%
                  </div>
                  {item.notes && <div style={{ fontSize: '11px', color: 'var(--brand-300)', marginTop: '2px', fontStyle: 'italic' }}>* {item.notes}</div>}
                </div>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {fmt(item.subtotal)}
                </div>
              </div>
            ))}
          </div>

          {/* Pricing Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '16px', borderTop: '1px dashed var(--border)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal (Before Tax):</span>
              <span style={{ color: 'var(--text-primary)' }}>{fmt(order.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Taxes:</span>
              <span style={{ color: 'var(--text-primary)' }}>{fmt(order.tax_amount)}</span>
            </div>
            {order.service_charge > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Service Charge:</span>
                <span style={{ color: 'var(--text-primary)' }}>{fmt(order.service_charge)}</span>
              </div>
            )}
            {order.discount_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Discount Applied:</span>
                <span style={{ color: 'var(--success)' }}>-{fmt(order.discount_amount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-primary)' }}>Total Bill Amount:</span>
              <span style={{ color: 'var(--brand-400)' }}>{fmt(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Primary Call to Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(order.status === 'active' || order.status === 'billed' || order.status === 'draft') && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                id="proceed-billing-btn"
                className="btn btn-primary btn-lg"
                onClick={() => router.push(`/staff/orders/${order.id}/bill`)}
                style={{ flex: 1 }}
              >
                💵 Proceed to Checkout
              </button>
              <button
                id="modify-order-btn"
                className="btn btn-secondary btn-lg"
                onClick={() => router.push(`/staff/orders/${order.id}/edit`)}
                style={{ flex: 1 }}
              >
                ✏️ Modify Order
              </button>
            </div>
          )}

          {order.status === 'paid' && (
            <button
              id="view-receipt-btn"
              className="btn btn-primary btn-lg"
              onClick={() => router.push(`/staff/orders/${order.id}/receipt`)}
              style={{ width: '100%' }}
            >
              🧾 View Customer Receipt
            </button>
          )}

          <button
            id="print-kitchen-kot-btn"
            className="btn btn-secondary"
            onClick={() => router.push(`/staff/orders/${order.id}/kitchen-receipt`)}
            style={{ width: '100%' }}
          >
            🍳 Print Kitchen Ticket (KOT)
          </button>
        </div>
      </div>
    </div>
  )
}
