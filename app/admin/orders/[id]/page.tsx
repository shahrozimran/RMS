'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import Link from 'next/link'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

interface OrderItem {
  id: string
  product_id: string
  variant_label: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  tax_amount: number
  subtotal: number
  notes: string | null
  product: { name: string } | null
}

interface Payment {
  id: string
  method: string
  amount: number
  cash_tendered: number | null
  change_given: number | null
  transaction_ref: string | null
  paid_at: string
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
  void_reason: string | null
  staff: { name: string } | null
  table: { table_number: string } | null
  order_items: OrderItem[]
  payments: Payment[]
}

export default function AdminOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [restaurantName, setRestaurantName] = useState('My Restaurant')
  const [restaurantAddress, setRestaurantAddress] = useState('123 Main St')

  // Void Modal State
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [submittingVoid, setSubmittingVoid] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()
  const receiptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchCurrencyAndRestaurant()
    fetchOrderDetail()
  }, [id])

  const fetchCurrencyAndRestaurant = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['currency', 'restaurant_name', 'restaurant_address'])

    if (data) {
      data.forEach(item => {
        if (item.key === 'currency') setCurrency(item.value as any)
        if (item.key === 'restaurant_name') setRestaurantName(item.value as string)
        if (item.key === 'restaurant_address') setRestaurantAddress(item.value as string)
      })
    }
  }

  const fetchOrderDetail = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          staff:users!staff_id(name),
          table:tables(table_number),
          order_items(*, product:products(name)),
          payments(*)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setOrder(data as any)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVoidOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!voidReason.trim()) return
    setSubmittingVoid(true)
    setError('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const adminUserId = userData.user?.id

      if (!adminUserId) {
        // Fallback or error if auth context is missing
        throw new Error('Unauthenticated user')
      }

      // Resolve the actual UUID of user table that corresponds to auth.users.id
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', adminUserId)
        .single()

      if (!dbUser) throw new Error('Admin profile user mapping not found')

      const { error: rpcError } = await supabase.rpc('void_order', {
        p_order_id: id,
        p_reason: voidReason,
        p_approved_by: dbUser.id
      })
      if (rpcError) throw rpcError

      setShowVoidModal(false)
      fetchOrderDetail()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingVoid(false)
    }
  }

  const printReceipt = () => {
    window.print()
  }

  const downloadPDFReceipt = async () => {
    const element = receiptRef.current
    if (!element) return

    // Create a temporary container off-screen with a fixed width to ensure consistency
    const printContainer = document.createElement('div')
    printContainer.style.position = 'absolute'
    printContainer.style.left = '-9999px'
    printContainer.style.top = '-9999px'
    printContainer.style.width = '378px' // 80mm at ~120 DPI, standard for thermal printing simulation
    printContainer.style.background = '#ffffff'
    printContainer.style.color = '#000000'
    printContainer.style.fontFamily = 'Courier, monospace'
    printContainer.style.padding = '24px 20px'
    printContainer.innerHTML = element.innerHTML
    
    document.body.appendChild(printContainer)

    try {
      const canvas = await html2canvas(printContainer, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      })
      
      const imgData = canvas.toDataURL('image/png')
      
      // Calculate height in mm to match the aspect ratio of the generated receipt
      const pdfWidth = 80 // 80mm
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight])
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`RMS_Receipt_${order?.id.substring(0, 8)}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      document.body.removeChild(printContainer)
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading order transaction...</div>
  if (!order) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Order not found.</div>

  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <div className="animate-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <Link href="/admin/orders" style={{ textDecoration: 'none', color: 'var(--text-muted)', fontSize: '14px' }}>
            ← Back to Orders
          </Link>
          <h1 style={{ fontSize: '26px', fontWeight: 800, marginTop: '8px' }}>
            Order Audit: #{order.id.substring(0, 8)}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button id="detail-print-btn" className="btn btn-secondary" onClick={printReceipt}>🖨 Print Bill</button>
          <button id="detail-pdf-btn" className="btn btn-secondary" onClick={downloadPDFReceipt}>📥 Save PDF</button>
          {order.status !== 'void' && order.status !== 'refunded' && (
            <button id="detail-void-btn" className="btn btn-danger" onClick={() => setShowVoidModal(true)}>
              Void Order
            </button>
          )}
        </div>
      </div>

      <div className="responsive-grid-split-340">
        {/* Core Audit Metrics & Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Metadata Card */}
          <div className="surface-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Audit Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Date & Time:</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Order Type:</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', textTransform: 'capitalize' }}>
                  {order.order_type.replace('_', ' ')}
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Served By:</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {order.staff?.name || 'System / Admin'}
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Location/Table:</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {order.order_type === 'dine_in' ? `Table ${order.table?.table_number ?? '?'}` : 'Takeaway/Delivery'}
                </p>
              </div>
            </div>
            {order.notes && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Order Notes:</span>
                <p style={{ fontSize: '14px', marginTop: '4px', fontStyle: 'italic' }}>"{order.notes}"</p>
              </div>
            )}
            {order.status === 'void' && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px' }}>
                <span style={{ color: '#f87171', fontWeight: 'bold', fontSize: '13px' }}>Void Reason (Audit Log):</span>
                <p style={{ fontSize: '14px', marginTop: '4px', color: '#fca5a5' }}>"{order.void_reason || 'No reason specified'}"</p>
              </div>
            )}
          </div>

          {/* Payments Info */}
          <div className="surface-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Payment Transactions</h3>
            {order.payments.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No payment records found (Unpaid)</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {order.payments.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--surface-3)', borderRadius: '8px', fontSize: '14px' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {p.method.replace('_', ' ')}
                      </span>
                      {p.transaction_ref && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Ref: {p.transaction_ref}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{fmt(p.amount)}</span>
                      {p.cash_tendered !== null && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Tendered: {fmt(p.cash_tendered)} | Change: {fmt(p.change_given ?? 0)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live print preview roll */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>Print Preview</h3>
          <div
            ref={receiptRef}
            id="receipt-content"
            style={{
              background: '#ffffff',
              color: '#0a0a0f',
              padding: '20px',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              width: '100%',
              fontFamily: 'Courier, monospace',
              fontSize: '12px',
              lineHeight: '1.4'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: '#0a0a0f', fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {restaurantName}
              </h2>
              <p style={{ color: '#555', fontSize: '10px', marginTop: '4px' }}>{restaurantAddress}</p>
              <p style={{ margin: '8px 0', borderBottom: '1px dashed #000' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#333' }}>
              <div>Order ID: {order.id.substring(0, 8)}</div>
              <div>Date: {new Date(order.created_at).toLocaleDateString()}</div>
              <div>Time: {new Date(order.created_at).toLocaleTimeString()}</div>
              <div>Staff: {order.staff?.name || 'System'}</div>
              <div>Table: {order.order_type === 'dine_in' ? order.table?.table_number : 'Takeaway/Delivery'}</div>
              <div>Customer: {order.customer_name || 'Guest'}</div>
              {order.customer_phone && <div>Phone: {order.customer_phone}</div>}
            </div>

            <p style={{ margin: '8px 0', borderBottom: '1px dashed #000' }} />

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ paddingBottom: '4px' }}>Item</th>
                  <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Qty</th>
                  <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ paddingTop: '6px', paddingBottom: '6px', verticalAlign: 'top' }}>
                      {item.product?.name}
                      {item.variant_label && ` (${item.variant_label})`}
                    </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '6px' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '6px' }}>
                      {formatCurrency(item.subtotal, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ margin: '8px 0', borderBottom: '1px dashed #000' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', alignItems: 'flex-end' }}>
              <div>Subtotal: {fmt(order.subtotal)}</div>
              <div>Tax Collected: {fmt(order.tax_amount)}</div>
              {order.service_charge > 0 && <div>Service Charge: {fmt(order.service_charge)}</div>}
              {order.discount_amount > 0 && <div>Discount Applied: -{fmt(order.discount_amount)}</div>}
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginTop: '4px', color: '#000' }}>
                GRAND TOTAL: {fmt(order.total)}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '10px', color: '#555' }}>
              Thank You! Please visit again.
            </div>
          </div>
        </div>
      </div>

      {/* Void Modal Dialog */}
      {showVoidModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="surface-card animate-in" style={{ padding: '24px', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Void Order Transaction</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px', lineHeight: '1.4' }}>
              Warning: This action will mark this order as "void", return raw ingredients to stock, free up any occupied tables, and generate an audit log entry.
            </p>
            <form onSubmit={handleVoidOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="void-reason-input">Reason for Voiding</label>
                <input
                  id="void-reason-input"
                  className="input"
                  type="text"
                  placeholder="e.g. Guest change of mind / Billing error"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  required
                />
              </div>
              {error && <div className="badge badge-red">{error}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowVoidModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingVoid} className="btn btn-primary btn-danger">
                  {submittingVoid ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
