'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import { buildTaxSummary, calculateGrandTotal } from '@/lib/utils/tax'

interface Category {
  id: number
  name: string
}

interface Product {
  id: string
  name: string
  description: string | null
  base_price: number
  price_variants: { label: string; price: number }[] | null
  tax_rate: number
  image_url: string | null
  is_available: boolean
  is_86d: boolean
}

interface Table {
  id: number
  table_number: string
  status: 'free' | 'occupied' | 'reserved' | 'cleaning'
}

interface CartItem {
  product_id: string
  product_name: string
  variant_label: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  notes: string
}

export default function StaffNewOrderPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [serviceCharge, setServiceCharge] = useState({ type: 'percentage', value: 0 })

  // Selection state
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in')
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [itemNote, setItemNote] = useState('')
  const [activeNoteItemIndex, setActiveNoteItemIndex] = useState<number | null>(null)

  // Loading / Submit state
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [categoriesRes, productsRes, tablesRes, settingsRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('products').select('*').eq('is_available', true).eq('is_86d', false),
        supabase.from('tables').select('*').order('id', { ascending: true }),
        supabase.from('system_settings').select('key, value').in('key', ['currency', 'service_charge'])
      ])

      if (categoriesRes.error) throw categoriesRes.error
      if (productsRes.error) throw productsRes.error
      if (tablesRes.error) throw tablesRes.error

      setCategories(categoriesRes.data || [])
      setProducts(productsRes.data || [])
      setTables(tablesRes.data || [])

      if (categoriesRes.data && categoriesRes.data.length > 0) {
        setSelectedCategory(categoriesRes.data[0].id)
      }

      if (settingsRes.data) {
        settingsRes.data.forEach(item => {
          if (item.key === 'currency') setCurrency(item.value as any)
          if (item.key === 'service_charge') setServiceCharge(item.value as any)
        })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addToCart = (product: Product, variantLabel: string | null = null, priceOverride: number | null = null) => {
    const price = priceOverride ?? product.base_price
    const existingIndex = cart.findIndex(
      item => item.product_id === product.id && item.variant_label === variantLabel
    )

    if (existingIndex > -1) {
      const updated = [...cart]
      updated[existingIndex].quantity += 1
      setCart(updated)
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        variant_label: variantLabel,
        quantity: 1,
        unit_price: price,
        tax_rate: product.tax_rate,
        notes: ''
      }])
    }
  }

  const updateQuantity = (index: number, val: number) => {
    const updated = [...cart]
    updated[index].quantity += val
    if (updated[index].quantity <= 0) {
      updated.splice(index, 1)
    }
    setCart(updated)
  }

  const handleConfirmOrder = async () => {
    if (cart.length === 0) {
      setError('Cart is empty!')
      return
    }
    if (orderType === 'dine_in' && !selectedTableId) {
      setError('Please select a table for Dine-in orders')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const orderPayload = {
        table_id: orderType === 'dine_in' ? selectedTableId : null,
        order_type: orderType,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_address: orderType === 'delivery' ? customerAddress : null,
        items: cart.map(i => ({
          product_id: i.product_id,
          variant_label: i.variant_label,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_rate: i.tax_rate,
          notes: i.notes || null
        }))
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      router.push(`/staff/orders/${data.data.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Calculate bill metrics
  const taxSummary = buildTaxSummary(cart)
  const { service_charge: computedSC, total: computedTotal } = calculateGrandTotal({
    subtotal: taxSummary.subtotal,
    tax_amount: taxSummary.total_tax,
    service_charge_type: serviceCharge.type as any,
    service_charge_value: serviceCharge.value,
    discount_amount: 0
  })

  // Filter products based on search and selected category
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true
    const matchesSearch = searchQuery ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    return matchesCategory && matchesSearch
  })

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading menu catalog...</div>

  return (
    <div className="animate-in" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', minHeight: 'calc(100vh - 100px)' }}>
      {/* Menu browser and setups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Order Setup Options */}
        <div className="surface-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Order Mode</h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {['dine_in', 'takeaway', 'delivery'].map(type => (
              <button
                key={type}
                className={`btn ${orderType === type ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setOrderType(type as any); setError('') }}
                style={{ flex: 1 }}
              >
                {type === 'dine_in' ? '🍽 Dine-in' : type === 'takeaway' ? '🥡 Takeaway' : '🛵 Delivery'}
              </button>
            ))}
          </div>

          {orderType === 'dine_in' && (
            <div>
              <label className="input-label">Select Table</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '8px' }}>
                {tables.map(t => (
                  <button
                    key={t.id}
                    className={`btn ${selectedTableId === t.id ? 'btn-primary' : 'btn-secondary'} ${t.status === 'occupied' ? 'btn-danger' : ''}`}
                    onClick={() => { setSelectedTableId(t.id); setError('') }}
                    style={{ minHeight: '36px', padding: '6px' }}
                    disabled={t.status === 'occupied'}
                  >
                    {t.table_number}
                  </button>
                ))}
              </div>
            </div>
          )}

          {orderType === 'delivery' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="cust-name">Customer Name</label>
                  <input id="cust-name" className="input" type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="cust-phone">Phone</label>
                  <input id="cust-phone" className="input" type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="cust-address">Delivery Address</label>
                <input id="cust-address" className="input" type="text" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Menu Section */}
        <div className="surface-card" style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <input
              id="menu-search-input"
              className="input"
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
          </div>

          {/* Categories Horizontal scrolling tabs */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
            {categories.map(c => (
              <button
                key={c.id}
                className={`btn btn-sm ${selectedCategory === c.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Catalog grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '14px',
            flex: 1,
            overflowY: 'auto',
            maxHeight: '400px'
          }}>
            {filteredProducts.map(p => (
              <div key={p.id} className="glass-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }} />
                  ) : (
                    <div style={{ width: '100%', height: '90px', background: 'var(--surface-3)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '8px' }}>
                      🍽
                    </div>
                  )}
                  <h4 style={{ fontSize: '13px', fontWeight: 600 }}>{p.name}</h4>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Tax: {p.tax_rate}%</div>
                </div>

                <div style={{ marginTop: '10px' }}>
                  {p.price_variants && p.price_variants.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {p.price_variants.map((v, idx) => (
                        <button
                          key={idx}
                          className="btn btn-secondary btn-sm"
                          onClick={() => addToCart(p, v.label, v.price)}
                          style={{ width: '100%', padding: '4px 8px', minHeight: '28px', fontSize: '11px' }}
                        >
                          {v.label} - {formatCurrency(v.price, currency)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => addToCart(p)}
                      style={{ width: '100%' }}
                    >
                      {formatCurrency(p.base_price, currency)}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart sidebar */}
      <div className="surface-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Current Order</h3>

        {/* Cart items list */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Your order is empty. Select items to add them.
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} style={{ paddingBottom: '10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.product_name}
                      {item.variant_label && <span style={{ color: 'var(--brand-400)', fontSize: '11px' }}> ({item.variant_label})</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Price: {formatCurrency(item.unit_price, currency)} | Tax: {item.tax_rate}%
                    </div>
                    {item.notes && <div style={{ fontSize: '11px', color: 'var(--brand-300)', fontStyle: 'italic' }}>* {item.notes}</div>}
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {formatCurrency(item.unit_price * item.quantity, currency)}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setActiveNoteItemIndex(idx)
                      setItemNote(item.notes)
                    }}
                    style={{ fontSize: '11px', padding: '2px 6px', minHeight: '24px' }}
                  >
                    ✏ Note
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={() => updateQuantity(idx, -1)} style={{ width: '28px', height: '28px', minHeight: '28px' }}>-</button>
                    <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{item.quantity}</span>
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={() => updateQuantity(idx, 1)} style={{ width: '28px', height: '28px', minHeight: '28px' }}>+</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Note input overlay */}
        {activeNoteItemIndex !== null && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
          }}>
            <div className="surface-card" style={{ padding: '20px', width: '300px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Add Item Instructions</h4>
              <input
                id="cart-item-note-input"
                className="input"
                type="text"
                placeholder="e.g. Extra cheese, no onion"
                value={itemNote}
                onChange={e => setItemNote(e.target.value)}
                style={{ marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveNoteItemIndex(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const updated = [...cart]
                    updated[activeNoteItemIndex!].notes = itemNote
                    setCart(updated)
                    setActiveNoteItemIndex(null)
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bill summary and action */}
        {cart.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(taxSummary.subtotal, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Taxes:</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(taxSummary.total_tax, currency)}</span>
              </div>
              {computedSC > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Service Charge:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(computedSC, currency)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ color: 'var(--text-primary)' }}>Grand Total:</span>
                <span style={{ color: 'var(--brand-400)' }}>{formatCurrency(computedTotal, currency)}</span>
              </div>
            </div>

            {error && <div className="badge badge-red" style={{ marginBottom: '12px', display: 'block', width: '100%', padding: '6px' }}>{error}</div>}

            <button
              id="confirm-order-btn"
              className="btn btn-primary btn-lg"
              onClick={handleConfirmOrder}
              disabled={submitting}
              style={{ width: '100%' }}
            >
              {submitting ? 'Confirming Order...' : 'Confirm Order'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
