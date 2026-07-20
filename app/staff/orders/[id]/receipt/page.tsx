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
  variant_label: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  subtotal: number
  product: { name: string } | null
}

interface Payment {
  id: string
  method: string
  amount: number
  cash_tendered: number | null
  change_given: number | null
  transaction_ref: string | null
}

interface OrderDetail {
  id: string
  created_at: string
  subtotal: number
  tax_amount: number
  service_charge: number
  discount_amount: number
  total: number
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  table: { table_number: string } | null
  staff: { name: string } | null
  customer_name: string | null
  customer_phone: string | null
  order_items: OrderItem[]
  payments: Payment[]
}

export default function StaffReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [restaurantName, setRestaurantName] = useState('My Restaurant')
  const [restaurantAddress, setRestaurantAddress] = useState('123 Main St, City')
  const [restaurantPhone, setRestaurantPhone] = useState('+123456789')
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const receiptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchSettings()
    fetchOrderDetail()
  }, [id])

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['currency', 'restaurant_name', 'restaurant_address', 'restaurant_phone'])

    if (data) {
      data.forEach(item => {
        if (item.key === 'currency') setCurrency(item.value as any)
        if (item.key === 'restaurant_name') setRestaurantName(item.value as string)
        if (item.key === 'restaurant_address') setRestaurantAddress(item.value as string)
        if (item.key === 'restaurant_phone') setRestaurantPhone(item.value as string)
      })
    }
  }

  const fetchOrderDetail = async () => {
    try {
      const res = await fetch(`/api/orders/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load order details')
      setOrder(json.data)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
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

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading receipt...</div>
  if (!order) return <div style={{ padding: '40px', textAlign: 'center' }}>Receipt not found.</div>

  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <div className="animate-in responsive-grid-split-340" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Receipt Action Column */}
      <div className="surface-card" style={{ padding: '24px', alignSelf: 'start' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Order Completed</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.4', marginBottom: '20px' }}>
          Payment finalized successfully. Print receipt for the customer or download a PDF copy.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button id="receipt-print-btn" className="btn btn-primary" onClick={printReceipt} style={{ width: '100%' }}>
            🖨 Print Receipt
          </button>
          <button id="receipt-pdf-btn" className="btn btn-secondary" onClick={downloadPDFReceipt} style={{ width: '100%' }}>
            📥 Download PDF
          </button>
          <Link id="receipt-home-link" href="/staff/dashboard" className="btn btn-ghost" style={{ textDecoration: 'none', textAlign: 'center' }}>
            Go to Dashboard
          </Link>
        </div>
      </div>

      {/* Visual print roll simulation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h4 style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>Thermal Receipt Preview</h4>
        <div
          ref={receiptRef}
          id="receipt-content"
          style={{
            background: '#ffffff',
            color: '#0a0a0f',
            padding: '24px 20px',
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
            <p style={{ color: '#555', fontSize: '10px' }}>Tel: {restaurantPhone}</p>
            <p style={{ margin: '8px 0', borderBottom: '1px dashed #000' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#333' }}>
            <div>Receipt No: #{order.id.substring(0, 8).toUpperCase()}</div>
            <div>Date: {new Date(order.created_at).toLocaleDateString()}</div>
            <div>Time: {new Date(order.created_at).toLocaleTimeString()}</div>
            <div>Served By: {order.staff?.name || 'Staff Member'}</div>
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
                <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Amount</th>
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
            <div>Taxes: {fmt(order.tax_amount)}</div>
            {order.service_charge > 0 && <div>Service Charge: {fmt(order.service_charge)}</div>}
            {order.discount_amount > 0 && <div>Discount Applied: -{fmt(order.discount_amount)}</div>}
            <div style={{ fontWeight: 'bold', fontSize: '13px', marginTop: '4px', color: '#000' }}>
              GRAND TOTAL: {fmt(order.total)}
            </div>
          </div>

          <p style={{ margin: '8px 0', borderBottom: '1px dashed #000' }} />

          {/* Payment Method Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#333' }}>
            {order.payments.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ textTransform: 'capitalize' }}>Payment Mode ({p.method}):</span>
                <span>{fmt(p.amount)}</span>
              </div>
            ))}
            {order.payments.some(p => p.method === 'cash') && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cash Received:</span>
                  <span>{fmt(order.payments.find(p => p.method === 'cash')?.cash_tendered ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Change Given:</span>
                  <span>{fmt(order.payments.find(p => p.method === 'cash')?.change_given ?? 0)}</span>
                </div>
              </>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '10px', color: '#555' }}>
            Thank You for dining with us!
          </div>
        </div>
      </div>
    </div>
  )
}
