'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'

/* ─── Types ───────────────────────────────────────────────── */
interface Category { id: number; name: string; sort_order: number }
interface Product {
  id: string; name: string; description: string | null
  base_price: number; price_variants: { label: string; price: number }[] | null
  tax_rate: number; image_url: string | null; category_id: number | null
}
interface CartItem {
  product_id: string; product_name: string; variant_label: string | null
  quantity: number; unit_price: number; tax_rate: number; notes: string
}
interface TableInfo { id: number; table_number: string; section: string | null; capacity: number; status: string }
interface CurrencyConfig { code: string; symbol: string; locale: string }

/* ─── Helpers ─────────────────────────────────────────────── */
function fmt(amount: number, currency: CurrencyConfig) {
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency', currency: currency.code, minimumFractionDigits: 2
    }).format(amount)
  } catch { return `${currency.symbol}${amount.toFixed(2)}` }
}

/* ─── Styles (inline for isolated public page) ────────────── */
const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0f0f 100%)', paddingBottom: 120 } as React.CSSProperties,
  header: { position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as React.CSSProperties,
  headerLeft: { display: 'flex', flexDirection: 'column' as const },
  restaurantName: { fontSize: 15, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' },
  tableTag: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  cartBtn: { position: 'relative', background: 'linear-gradient(135deg, #00d4aa, #00b4d8)', border: 'none', borderRadius: 14, padding: '10px 16px', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const } as React.CSSProperties,
  cartBadge: { position: 'absolute', top: -6, right: -6, background: '#ff4757', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  body: { padding: '0 16px' },
  catScrollOuter: { overflowX: 'auto' as const, padding: '16px 0 8px', scrollbarWidth: 'none' as const },
  catRow: { display: 'flex', gap: 8, paddingLeft: 16, paddingRight: 16 },
  catBtn: (active: boolean) => ({
    flexShrink: 0, padding: '8px 18px', borderRadius: 40, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
    background: active ? 'linear-gradient(135deg, #00d4aa, #00b4d8)' : 'rgba(255,255,255,0.07)',
    color: active ? '#000' : 'rgba(255,255,255,0.7)',
    boxShadow: active ? '0 4px 16px rgba(0,212,170,0.3)' : 'none',
  } as React.CSSProperties),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginTop: 16 },
  productCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s' } as React.CSSProperties,
  productImg: { width: '100%', height: 110, objectFit: 'cover' as const },
  productImgPlaceholder: { width: '100%', height: 110, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 },
  productBody: { padding: '10px 12px 12px' },
  productName: { fontSize: 13, fontWeight: 700, color: '#ffffff', marginBottom: 3, lineHeight: 1.3 },
  productDesc: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties,
  addBtn: { width: '100%', padding: '7px 10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00d4aa, #00b4d8)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
  variantBtn: { width: '100%', padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(0,212,170,0.4)', background: 'transparent', color: '#00d4aa', fontWeight: 600, fontSize: 11, cursor: 'pointer', marginBottom: 3 } as React.CSSProperties,
  cartSheet: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(12,12,20,0.98)', backdropFilter: 'blur(30px)', borderTop: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px 24px 0 0', padding: '20px 20px 36px', maxHeight: '85vh', overflowY: 'auto' } as React.CSSProperties,
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90, backdropFilter: 'blur(4px)' } as React.CSSProperties,
  cartHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cartTitle: { fontSize: 18, fontWeight: 800, color: '#ffffff' },
  closeBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  cartItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.07)' },
  cartItemName: { fontSize: 13, fontWeight: 600, color: '#ffffff', marginBottom: 2 },
  cartItemPrice: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  qtyNum: { fontSize: 14, fontWeight: 700, color: '#fff', minWidth: 20, textAlign: 'center' as const },
  divider: { height: 1, background: 'rgba(255,255,255,0.08)', margin: '16px 0' },
  totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  grandRow: { display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#ffffff', marginTop: 8 },
  nameInput: { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px', color: '#fff', fontSize: 14, marginBottom: 14, outline: 'none' } as React.CSSProperties,
  placeBtn: { width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #00d4aa, #00b4d8)', color: '#000', fontWeight: 800, fontSize: 16, cursor: 'pointer', marginTop: 16, transition: 'all 0.2s' } as React.CSSProperties,
  successScreen: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' as const } as React.CSSProperties,
  successIcon: { fontSize: 80, marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: 900, color: '#ffffff', marginBottom: 12 },
  successSub: { fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 32px' },
  statusPill: (status: string) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 40, fontSize: 14, fontWeight: 700,
    background: status === 'confirmed' ? 'rgba(0,212,170,0.15)' : status === 'rejected' ? 'rgba(255,71,87,0.15)' : 'rgba(255,255,255,0.08)',
    color: status === 'confirmed' ? '#00d4aa' : status === 'rejected' ? '#ff4757' : 'rgba(255,255,255,0.7)',
    border: `1px solid ${status === 'confirmed' ? 'rgba(0,212,170,0.3)' : status === 'rejected' ? 'rgba(255,71,87,0.3)' : 'rgba(255,255,255,0.12)'}`,
  } as React.CSSProperties),
  errorMsg: { color: '#ff4757', fontSize: 13, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 },
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 16 },
  spinner: { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #00d4aa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' } as React.CSSProperties,
}

/* ─── Main Component ──────────────────────────────────────── */
export default function CustomerOrderPage() {
  const params = useParams()
  const tableToken = params.tableToken as string

  // Page state
  const [pageState, setPageState] = useState<'loading' | 'menu' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // Data
  const [table, setTable] = useState<TableInfo | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [restaurantName, setRestaurantName] = useState('Our Restaurant')

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState('')

  // Post-submit state
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [orderStatus, setOrderStatus] = useState<'pending' | 'confirmed' | 'rejected'>('pending')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  /* Load menu data */
  useEffect(() => {
    if (!tableToken) return
    fetch(`/api/qr/${tableToken}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setErrorMsg(json.error); setPageState('error'); return }
        setTable(json.table)
        setCategories(json.categories || [])
        setProducts(json.products || [])
        setCurrency(json.settings?.currency || { code: 'USD', symbol: '$', locale: 'en-US' })
        setRestaurantName(json.settings?.restaurant_name || 'Our Restaurant')
        if (json.categories?.length > 0) setSelectedCategory(json.categories[0].id)
        setPageState('menu')
      })
      .catch(e => { setErrorMsg(e.message); setPageState('error') })
  }, [tableToken])

  /* Poll order status after submission */
  useEffect(() => {
    if (!pendingOrderId) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/qr/${tableToken}/order?pendingId=${pendingOrderId}`)
        const json = await res.json()
        if (json.data?.status && json.data.status !== 'pending') {
          setOrderStatus(json.data.status)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {}
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pendingOrderId, tableToken])

  /* Cart helpers */
  const addToCart = (product: Product, variantLabel: string | null = null, price: number | null = null) => {
    const unitPrice = price ?? product.base_price
    setCart(prev => {
      const idx = prev.findIndex(i => i.product_id === product.id && i.variant_label === variantLabel)
      if (idx > -1) {
        const updated = [...prev]
        updated[idx].quantity += 1
        return updated
      }
      return [...prev, { product_id: product.id, product_name: product.name, variant_label: variantLabel, quantity: 1, unit_price: unitPrice, tax_rate: product.tax_rate, notes: '' }]
    })
  }

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev]
      updated[idx].quantity += delta
      if (updated[idx].quantity <= 0) updated.splice(idx, 1)
      return updated
    })
  }

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0)
  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  /* Submit order */
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return
    if (!customerName.trim()) {
      setOrderError('Please enter your name to place the order.')
      return
    }
    setSubmitting(true)
    setOrderError('')
    try {
      const res = await fetch(`/api/qr/${tableToken}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          items: cart.map(i => ({
            product_id: i.product_id,
            product_name: i.product_name,
            variant_label: i.variant_label,
            quantity: i.quantity,
            unit_price: i.unit_price,
            tax_rate: i.tax_rate,
            notes: i.notes || null,
          }))
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to place order')
      setPendingOrderId(json.data.id)
      setShowCart(false)
      setPageState('success')
    } catch (e: any) {
      setOrderError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const filteredProducts = products.filter(p => !selectedCategory || p.category_id === selectedCategory)

  /* ─── Render: Loading ─────────────────────────────────────── */
  if (pageState === 'loading') {
    return (
      <div style={S.loading}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        <div style={S.spinner} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading menu…</span>
      </div>
    )
  }

  /* ─── Render: Error ─────────────────────────────────────────── */
  if (pageState === 'error') {
    return (
      <div style={S.successScreen}>
        <div style={S.successIcon}>❌</div>
        <div style={S.successTitle}>Invalid QR Code</div>
        <div style={S.successSub}>{errorMsg || 'This QR code is not valid. Please ask a staff member for help.'}</div>
      </div>
    )
  }

  /* ─── Render: Success ─────────────────────────────────────── */
  if (pageState === 'success') {
    return (
      <div style={S.successScreen}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }`}</style>
        <div style={{ ...S.successIcon, animation: orderStatus === 'confirmed' ? 'bounce 1s infinite' : undefined }}>
          {orderStatus === 'confirmed' ? '🎉' : orderStatus === 'rejected' ? '😔' : '⏳'}
        </div>
        <div style={S.successTitle}>
          {orderStatus === 'confirmed' ? 'Order Confirmed!' : orderStatus === 'rejected' ? 'Order Declined' : 'Order Placed!'}
        </div>
        <div style={S.successSub}>
          {orderStatus === 'confirmed'
            ? 'Your food is being prepared. Sit back and relax!'
            : orderStatus === 'rejected'
              ? 'Your order was declined. Please speak to a staff member.'
              : `Waiting for staff to confirm your order for ${table?.table_number}…`}
        </div>
        <div style={S.statusPill(orderStatus)}>
          {orderStatus === 'pending' && <><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1.5s infinite' as any }} />Waiting for confirmation</>}
          {orderStatus === 'confirmed' && <>✓ Confirmed by staff</>}
          {orderStatus === 'rejected' && <>✕ Order was declined</>}
        </div>
        {orderStatus === 'rejected' && (
          <button
            style={{ ...S.placeBtn, marginTop: 32, maxWidth: 260 }}
            onClick={() => { setPageState('menu'); setPendingOrderId(null); setOrderStatus('pending'); setCart([]) }}
          >
            Try Again
          </button>
        )}
      </div>
    )
  }

  /* ─── Render: Menu ────────────────────────────────────────── */
  return (
    <div style={S.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        .product-card:hover { transform: translateY(-2px); border-color: rgba(0,212,170,0.3) !important; }
        .add-btn:hover { opacity: 0.9; transform: scale(1.02); }
        .variant-btn:hover { background: rgba(0,212,170,0.1) !important; }
        .cat-btn:hover { opacity: 0.85; }
        input:focus { border-color: rgba(0,212,170,0.5) !important; box-shadow: 0 0 0 3px rgba(0,212,170,0.1); }
        .qty-btn:hover { background: rgba(255,255,255,0.1) !important; }
        .cart-sheet { animation: slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.restaurantName}>{restaurantName}</span>
          <span style={S.tableTag}>🪑 {table?.table_number} · {table?.section || 'Dine-In'}</span>
        </div>
        <button
          id="cart-open-btn"
          style={S.cartBtn}
          onClick={() => setShowCart(true)}
          disabled={cart.length === 0}
        >
          🛒 Cart
          {totalItems > 0 && <span style={S.cartBadge}>{totalItems}</span>}
          {cart.length > 0 && <span style={{ fontSize: 12 }}>{fmt(subtotal, currency)}</span>}
        </button>
      </header>

      <div style={S.body}>
        {/* Category tabs */}
        <div style={S.catScrollOuter}>
          <div style={S.catRow}>
            {categories.map(c => (
              <button
                key={c.id}
                className="cat-btn"
                style={S.catBtn(selectedCategory === c.id)}
                onClick={() => setSelectedCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div style={S.grid}>
          {filteredProducts.map(p => (
            <div key={p.id} className="product-card" style={S.productCard}>
              {p.image_url
                ? <img src={p.image_url} alt={p.name} style={S.productImg} />
                : <div style={S.productImgPlaceholder}>🍽</div>
              }
              <div style={S.productBody}>
                <div style={S.productName}>{p.name}</div>
                {p.description && <div style={S.productDesc}>{p.description}</div>}

                {p.price_variants && p.price_variants.length > 0 ? (
                  <div>
                    {p.price_variants.map((v, idx) => (
                      <button
                        key={idx}
                        className="variant-btn"
                        style={S.variantBtn}
                        onClick={() => addToCart(p, v.label, v.price)}
                      >
                        {v.label} — {fmt(v.price, currency)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button className="add-btn" style={S.addBtn} onClick={() => addToCart(p)}>
                    {fmt(p.base_price, currency)} · Add
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🍽</div>
            <div style={{ fontSize: 14 }}>No items in this category</div>
          </div>
        )}
      </div>

      {/* Cart overlay */}
      {showCart && (
        <>
          <div style={S.overlay} onClick={() => setShowCart(false)} />
          <div className="cart-sheet" style={S.cartSheet}>
            <div style={S.cartHeader}>
              <span style={S.cartTitle}>Your Order</span>
              <button id="cart-close-btn" style={S.closeBtn} onClick={() => setShowCart(false)}>✕</button>
            </div>

            {cart.map((item, idx) => (
              <div key={idx} style={S.cartItem}>
                <div>
                  <div style={S.cartItemName}>
                    {item.product_name}
                    {item.variant_label && <span style={{ color: '#00d4aa', fontWeight: 400, fontSize: 11 }}> ({item.variant_label})</span>}
                  </div>
                  <div style={S.cartItemPrice}>{fmt(item.unit_price, currency)} each</div>
                </div>
                <div style={S.qtyRow}>
                  <button className="qty-btn" style={S.qtyBtn} onClick={() => updateQty(idx, -1)}>−</button>
                  <span style={S.qtyNum}>{item.quantity}</span>
                  <button className="qty-btn" style={S.qtyBtn} onClick={() => updateQty(idx, 1)}>+</button>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                Your cart is empty
              </div>
            )}

            {cart.length > 0 && (
              <>
                <div style={S.divider} />
                <div style={S.totalRow}><span>Subtotal</span><span style={{ color: '#fff' }}>{fmt(subtotal, currency)}</span></div>
                <div style={S.grandRow}><span>Total</span><span style={{ color: '#00d4aa' }}>{fmt(subtotal, currency)}</span></div>

                <div style={S.divider} />
                <input
                  id="customer-name-input"
                  style={S.nameInput}
                  type="text"
                  placeholder="Your name (required)"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  required
                />

                {orderError && <div style={S.errorMsg}>{orderError}</div>}

                <button
                  id="place-order-btn"
                  style={{ ...S.placeBtn, opacity: submitting ? 0.7 : 1 }}
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                >
                  {submitting ? 'Placing Order…' : `Place Order · ${fmt(subtotal, currency)}`}
                </button>
                <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>
                  Your order will be confirmed by our staff
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
