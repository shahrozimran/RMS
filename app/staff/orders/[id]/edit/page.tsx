'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import { buildTaxSummary, calculateGrandTotal } from '@/lib/utils/tax'
import Link from 'next/link'

interface Category {
  id: number
  name: string
}

interface Modifier {
  id: number
  name: string
  price: number
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
  category_id: number | null
  modifiers?: Modifier[]
}

interface Table {
  id: number
  table_number: string
  capacity: number
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
  selected_modifiers: Modifier[]
}

export default function StaffEditOrderPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

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

  // Modifiers config overlay
  const [activeModProduct, setActiveModProduct] = useState<Product | null>(null)
  const [activeModVariant, setActiveModVariant] = useState<{ label: string; price: number } | null>(null)
  const [selectedModsForActiveProduct, setSelectedModsForActiveProduct] = useState<Modifier[]>([])

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
    fetchDataAndOrder()
  }, [orderId])

  const fetchDataAndOrder = async () => {
    try {
      // 1. Fetch system catalogs
      const [categoriesRes, productsRes, tablesRes, settingsRes, orderRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('products').select('*, modifiers(*)').eq('is_available', true).eq('is_86d', false),
        supabase.from('tables').select('*').order('id', { ascending: true }),
        supabase.from('system_settings').select('key, value').in('key', ['currency', 'service_charge']),
        fetch(`/api/orders/${orderId}`).then(res => res.json())
      ])

      if (categoriesRes.error) throw categoriesRes.error
      if (productsRes.error) throw productsRes.error
      if (tablesRes.error) throw tablesRes.error
      if (orderRes.error) throw new Error(orderRes.error)

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

      // 2. Pre-fill order data
      const orderData = orderRes.data
      setOrderType(orderData.order_type)
      setSelectedTableId(orderData.table_id)
      setCustomerName(orderData.customer_name || '')
      setCustomerPhone(orderData.customer_phone || '')
      setCustomerAddress(orderData.customer_address || '')

      const initialCart = orderData.order_items.map((i: any) => ({
        product_id: i.product_id,
        product_name: i.product?.name || 'Unknown Item',
        variant_label: i.variant_label,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate,
        notes: i.notes || '',
        selected_modifiers: i.selected_modifiers || []
      }))
      setCart(initialCart)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Modifiers config triggers
  const handleProductSelect = (product: Product) => {
    const prodMods = product.modifiers || []
    
    if (prodMods.length > 0) {
      setActiveModProduct(product)
      setActiveModVariant(null)
      setSelectedModsForActiveProduct([])
    } else {
      addToCart(product)
    }
  }

  const handleVariantSelect = (product: Product, variant: { label: string; price: number }) => {
    const prodMods = product.modifiers || []
    
    if (prodMods.length > 0) {
      setActiveModProduct(product)
      setActiveModVariant(variant)
      setSelectedModsForActiveProduct([])
    } else {
      addToCart(product, variant.label, variant.price)
    }
  }

  const toggleModifierSelection = (mod: Modifier) => {
    if (selectedModsForActiveProduct.some(m => m.id === mod.id)) {
      setSelectedModsForActiveProduct(prev => prev.filter(m => m.id !== mod.id))
    } else {
      setSelectedModsForActiveProduct(prev => [...prev, mod])
    }
  }

  const addProductWithModifiersToCart = () => {
    if (!activeModProduct) return

    const basePrice = activeModVariant ? activeModVariant.price : activeModProduct.base_price
    const modifiersTotal = selectedModsForActiveProduct.reduce((sum, m) => sum + Number(m.price), 0)
    const finalUnitPrice = basePrice + modifiersTotal
    const variantLabel = activeModVariant ? activeModVariant.label : null

    // Unique cart item identifier including modifiers
    const modString = selectedModsForActiveProduct.map(m => m.id).sort().join(',')
    const existingIndex = cart.findIndex(
      item => 
        item.product_id === activeModProduct.id && 
        item.variant_label === variantLabel && 
        item.selected_modifiers.map(m => m.id).sort().join(',') === modString
    )

    if (existingIndex > -1) {
      const updated = [...cart]
      updated[existingIndex].quantity += 1
      setCart(updated)
    } else {
      setCart([...cart, {
        product_id: activeModProduct.id,
        product_name: activeModProduct.name,
        variant_label: variantLabel,
        quantity: 1,
        unit_price: finalUnitPrice,
        tax_rate: activeModProduct.tax_rate,
        notes: '',
        selected_modifiers: selectedModsForActiveProduct
      }])
    }

    // Reset overlay
    setActiveModProduct(null)
    setActiveModVariant(null)
    setSelectedModsForActiveProduct([])
  }

  // Base Cart operations
  const addToCart = (product: Product, variantLabel: string | null = null, priceOverride: number | null = null) => {
    const price = priceOverride ?? product.base_price
    const existingIndex = cart.findIndex(
      item => 
        item.product_id === product.id && 
        item.variant_label === variantLabel &&
        item.selected_modifiers.length === 0
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
        notes: '',
        selected_modifiers: []
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

  const handleSaveChanges = async () => {
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
          notes: i.notes || null,
          selected_modifiers: i.selected_modifiers
        }))
      }

      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save changes')

      router.push(`/staff/orders/${orderId}`)
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

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true
    const matchesSearch = searchQuery ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    return matchesCategory && matchesSearch
  })

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading order items...</div>

  return (
    <div className="animate-in" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', minHeight: 'calc(100vh - 100px)' }}>
      {/* Menu browser and setups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Order Setup Options */}
        <div className="surface-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Modify Order Setup</h3>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div className="input-group">
              <label className="input-label" htmlFor="cust-name">Customer Name</label>
              <input id="cust-name" className="input" type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Enter name" />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="cust-phone">Phone Number</label>
              <input id="cust-phone" className="input" type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {orderType === 'dine_in' && (
            <div>
              <label className="input-label">Assign Table</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '8px' }}>
                {tables.map(t => (
                  <button
                    key={t.id}
                    className={`btn ${selectedTableId === t.id ? 'btn-primary' : 'btn-secondary'} ${t.status === 'occupied' && selectedTableId !== t.id ? 'btn-danger' : ''}`}
                    onClick={() => {
                      setSelectedTableId(t.id)
                      setError('')
                    }}
                    style={{ minHeight: '44px', padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}
                  >
                    <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{t.table_number}</span>
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>({t.capacity || 4} Pax)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="input-group">
              <label className="input-label" htmlFor="cust-address">Delivery Address</label>
              <input id="cust-address" className="input" type="text" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
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
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
          </div>

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

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '14px',
            flex: 1,
            overflowY: 'auto',
            maxHeight: '380px'
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
                  <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>Tax: {p.tax_rate}%</div>
                </div>

                <div style={{ marginTop: '10px' }}>
                  {p.price_variants && p.price_variants.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {p.price_variants.map((v, idx) => (
                        <button
                          key={idx}
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleVariantSelect(p, v)}
                          style={{ width: '100%', padding: '4px 8px', minHeight: '28px', fontSize: '11px' }}
                        >
                          {v.label} - {formatCurrency(v.price, currency)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleProductSelect(p)}
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
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Modified Order Items</h3>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--charcoal-soft)', fontSize: '13px' }}>
              Select items from menu catalog to add.
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} style={{ paddingBottom: '10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--charcoal)' }}>
                      {item.product_name}
                      {item.variant_label && <span style={{ color: 'var(--accent-dark)', fontSize: '11px' }}> ({item.variant_label})</span>}
                    </div>
                    {item.selected_modifiers.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>
                        Mods: {item.selected_modifiers.map(m => m.name).join(', ')}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>
                      Price: {formatCurrency(item.unit_price, currency)} | Tax: {item.tax_rate}%
                    </div>
                    {item.notes && <div style={{ fontSize: '11px', color: 'var(--accent)', fontStyle: 'italic' }}>* {item.notes}</div>}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--charcoal)' }}>
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
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Item Notes</h4>
              <input
                id="cart-item-note-input"
                className="input"
                type="text"
                value={itemNote}
                onChange={e => setItemNote(e.target.value)}
                style={{ marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveNoteItemIndex(null)}>Cancel</button>
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

        {/* Modifiers Selection Overlay */}
        {activeModProduct && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
          }}>
            <div className="surface-card animate-in" style={{ padding: '24px', width: '340px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>Customize: {activeModProduct.name}</h4>
              <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', marginBottom: '16px' }}>Select toppings/options below</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
                {activeModProduct.modifiers?.map((m) => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--surface-raised)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={selectedModsForActiveProduct.some(sm => sm.id === m.id)}
                        onChange={() => toggleModifierSelection(m)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                      />
                      <span>{m.name}</span>
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--accent-dark)' }}>+{formatCurrency(m.price, currency)}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setActiveModProduct(null); setActiveModVariant(null); }}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={addProductWithModifiersToCart}>Apply &amp; Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Bill summary and action */}
        {cart.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--charcoal-soft)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span style={{ color: 'var(--charcoal)' }}>{formatCurrency(taxSummary.subtotal, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Taxes:</span>
                <span style={{ color: 'var(--charcoal)' }}>{formatCurrency(taxSummary.total_tax, currency)}</span>
              </div>
              {computedSC > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Service Charge:</span>
                  <span style={{ color: 'var(--charcoal)' }}>{formatCurrency(computedSC, currency)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ color: 'var(--charcoal)' }}>New Grand Total:</span>
                <span style={{ color: 'var(--accent-dark)' }}>{formatCurrency(computedTotal, currency)}</span>
              </div>
            </div>

            {error && <div className="badge badge-red" style={{ marginBottom: '12px', display: 'block', width: '100%', padding: '6px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveChanges}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
              <Link
                href={`/staff/orders/${orderId}`}
                className="btn btn-secondary"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Cancel
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
