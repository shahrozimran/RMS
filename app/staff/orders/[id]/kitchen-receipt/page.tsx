'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { readSettings } from '@/lib/api/client'
import Link from 'next/link'

interface ModifierItem {
  id: number
  name: string
  price: number
}

interface OrderItem {
  id: string
  variant_label: string | null
  quantity: number
  notes: string | null
  selected_modifiers?: ModifierItem[]
  product: { name: string } | null
}

interface OrderDetail {
  id: string
  created_at: string
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  table: { table_number: string } | null
  staff: { name: string } | null
  customer_name: string | null
  notes: string | null
  order_items: OrderItem[]
}

export default function StaffKitchenReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [restaurantName, setRestaurantName] = useState('My Restaurant')
  const [loading, setLoading] = useState(true)

  const receiptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchSettings()
    fetchOrderDetail()
  }, [id])

  const fetchSettings = async () => {
    const data = (await readSettings()).find(s => s.key === 'restaurant_name')
    if (data?.value) setRestaurantName(data.value)
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

  const printTicket = () => {
    window.print()
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading kitchen ticket...</div>
  if (!order) return <div style={{ padding: '40px', textAlign: 'center' }}>Kitchen ticket not found.</div>

  return (
    <div className="animate-in responsive-grid-split-340" style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      {/* Action Column */}
      <div className="surface-card no-print" style={{ padding: '24px', alignSelf: 'start' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Kitchen Order Ticket (KOT)</h3>
        <p style={{ color: 'var(--charcoal-soft)', fontSize: '13px', lineHeight: '1.5', marginBottom: '20px' }}>
          Send order items to the kitchen. This ticket contains only the item details, modifications, and quantities.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="btn btn-primary" onClick={printTicket} style={{ width: '100%' }}>
            🖨 Print Kitchen KOT
          </button>
          <Link href={`/staff/orders/${order.id}`} className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
            Back to Order Details
          </Link>
        </div>
      </div>

      {/* Ticket Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h4 className="no-print" style={{ fontSize: '14px', color: 'var(--charcoal-soft)', fontWeight: 600 }}>KOT Print Preview</h4>
        <div
          ref={receiptRef}
          style={{
            background: '#ffffff',
            color: '#000000',
            padding: '24px 20px',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-md)',
            width: '100%',
            fontFamily: 'Courier, monospace',
            fontSize: '13px',
            lineHeight: '1.4'
          }}
          className="print-kot"
        >
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>
              KITCHEN TICKET
            </h2>
            <p style={{ fontSize: '11px', margin: '4px 0 0', color: '#333' }}>{restaurantName}</p>
            <p style={{ margin: '8px 0', borderBottom: '2px dashed #000' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
            <div><strong>KOT No:</strong> #{order.id.substring(0, 8).toUpperCase()}</div>
            <div><strong>Date:</strong> {new Date(order.created_at).toLocaleDateString()}</div>
            <div><strong>Time:</strong> {new Date(order.created_at).toLocaleTimeString()}</div>
            <div><strong>Server:</strong> {order.staff?.name || 'Waiter'}</div>
            <div><strong>Mode:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{order.order_type.replace('_', ' ')}</span></div>
            {order.order_type === 'dine_in' && (
              <div style={{ fontSize: '14px' }}><strong>TABLE: {order.table?.table_number ?? '?'}</strong></div>
            )}
            {order.customer_name && (
              <div><strong>Customer: {order.customer_name}</strong></div>
            )}
          </div>

          <p style={{ margin: '8px 0', borderBottom: '2px dashed #000' }} />

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ paddingBottom: '6px' }}>Item Details</th>
                <th style={{ textAlign: 'right', paddingBottom: '6px', width: '50px' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px dotted #ccc' }}>
                  <td style={{ paddingTop: '8px', paddingBottom: '8px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{item.product?.name}</div>
                    
                    {/* Variant */}
                    {item.variant_label && (
                      <div style={{ fontSize: '11px', fontStyle: 'italic', paddingLeft: '8px', marginTop: '2px' }}>
                        * Option: {item.variant_label}
                      </div>
                    )}
                    
                    {/* Modifiers */}
                    {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                      <div style={{ paddingLeft: '8px', marginTop: '2px' }}>
                        {item.selected_modifiers.map((m, mIdx) => (
                          <div key={mIdx} style={{ fontSize: '11px', color: '#333' }}>
                            + {m.name}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preparation Notes */}
                    {item.notes && (
                      <div style={{ fontSize: '11px', color: '#ff0000', fontWeight: 'bold', paddingLeft: '8px', marginTop: '4px' }}>
                        INSTRUCTION: {item.notes}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '8px', fontSize: '15px', fontWeight: 'bold' }}>
                    {item.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {order.notes && (
            <>
              <p style={{ margin: '8px 0', borderBottom: '1px dashed #000' }} />
              <div style={{ fontSize: '11px', padding: '6px', background: '#f5f5f5', borderRadius: '4px', color: '#000' }}>
                <strong>Order Instructions:</strong>
                <p style={{ margin: '4px 0 0', fontStyle: 'italic' }}>"{order.notes}"</p>
              </div>
            </>
          )}

          <p style={{ margin: '12px 0 8px', borderBottom: '2px dashed #000' }} />
          <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'bold' }}>
            --- END OF TICKET ---
          </div>
        </div>
      </div>


    </div>
  )
}
