'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { clientCache } from '@/lib/utils/cache'

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
  page: { minHeight: '100vh', background: '#FAF8F5', paddingBottom: 120 } as React.CSSProperties,
  header: { position: 'sticky', top: 0, zIndex: 50, background: 'rgba(250, 248, 245, 0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #E4DED6', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as React.CSSProperties,
  headerLeft: { display: 'flex', flexDirection: 'column' as const },
  restaurantName: { fontSize: 16, fontWeight: 800, color: '#2C2C2C', letterSpacing: '-0.02em', fontFamily: "'Plus Jakarta Sans', sans-serif" },
  tableTag: { fontSize: 12, color: '#8A857F', marginTop: 2, fontWeight: 500 },
  cartBtn: { position: 'relative', background: '#2C2C2C', border: 'none', borderRadius: 12, padding: '10px 16px', color: '#ffffff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const, boxShadow: '0 2px 8px rgba(44,44,44,0.1)' } as React.CSSProperties,
  cartBadge: { position: 'absolute', top: -6, right: -6, background: '#9B3A3A', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  body: { padding: '0 16px' },
  catScrollOuter: { overflowX: 'auto' as const, padding: '16px 0 8px', scrollbarWidth: 'none' as const },
  catRow: { display: 'flex', gap: 8, paddingLeft: 16, paddingRight: 16 },
  catBtn: (active: boolean) => ({
    flexShrink: 0, padding: '8px 18px', borderRadius: 40, border: active ? 'none' : '1px solid #E4DED6', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
    background: active ? '#2C2C2C' : '#FFFFFF',
    color: active ? '#FFFFFF' : '#5A5652',
    boxShadow: active ? '0 4px 12px rgba(44,44,44,0.15)' : 'none',
  } as React.CSSProperties),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginTop: 16 },
  productCard: { background: '#FFFFFF', border: '1px solid #E4DED6', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(44,44,44,0.04)' } as React.CSSProperties,
  productImg: { width: '100%', height: 110, objectFit: 'cover' as const },
  productImgPlaceholder: { width: '100%', height: 110, background: '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 },
  productBody: { padding: '12px' },
  productName: { fontSize: 14, fontWeight: 700, color: '#2C2C2C', marginBottom: 4, lineHeight: 1.3, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  productDesc: { fontSize: 11, color: '#8A857F', marginBottom: 10, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties,
  addBtn: { width: '100%', padding: '8px 10px', borderRadius: 10, border: 'none', background: '#2C2C2C', color: '#ffffff', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' } as React.CSSProperties,
  variantBtn: { width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #C8A97E', background: 'transparent', color: '#A8895E', fontWeight: 600, fontSize: 11, cursor: 'pointer', marginBottom: 4, transition: 'all 0.15s' } as React.CSSProperties,
  cartSheet: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: '#FFFFFF', borderTop: '1px solid #E4DED6', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 32px rgba(44,44,44,0.08)' } as React.CSSProperties,
  overlay: { position: 'fixed', inset: 0, background: 'rgba(44,44,44,0.4)', zIndex: 90, backdropFilter: 'blur(4px)' } as React.CSSProperties,
  cartHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cartTitle: { fontSize: 18, fontWeight: 800, color: '#2C2C2C', fontFamily: "'Plus Jakarta Sans', sans-serif" },
  closeBtn: { background: '#F5F2EE', border: 'none', color: '#2C2C2C', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  cartItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #E4DED6' },
  cartItemName: { fontSize: 13, fontWeight: 600, color: '#2C2C2C', marginBottom: 2 },
  cartItemPrice: { fontSize: 12, color: '#8A857F' },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, border: '1px solid #CEC8BF', background: 'transparent', color: '#2C2C2C', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  qtyNum: { fontSize: 14, fontWeight: 700, color: '#2C2C2C', minWidth: 20, textAlign: 'center' as const },
  divider: { height: 1, background: '#E4DED6', margin: '16px 0' },
  totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5A5652', marginBottom: 6 },
  grandRow: { display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#2C2C2C', marginTop: 8 },
  nameInput: { width: '100%', background: '#F5F2EE', border: '1px solid #CEC8BF', borderRadius: 12, padding: '12px 16px', color: '#2C2C2C', fontSize: 14, marginBottom: 14, outline: 'none' } as React.CSSProperties,
  placeBtn: { width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: '#2C2C2C', color: '#ffffff', fontWeight: 800, fontSize: 16, cursor: 'pointer', marginTop: 16, transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(44,44,44,0.15)' } as React.CSSProperties,
  successScreen: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' as const, background: '#FAF8F5' } as React.CSSProperties,
  successIcon: { fontSize: 80, marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: 900, color: '#2C2C2C', marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  successSub: { fontSize: 15, color: '#5A5652', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 32px' },
  statusPill: (status: string) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 40, fontSize: 14, fontWeight: 700,
    background: status === 'confirmed' ? '#EBF3EE' : status === 'rejected' ? '#F5E8E8' : '#F5F2EE',
    color: status === 'confirmed' ? '#4A7C59' : status === 'rejected' ? '#9B3A3A' : '#5A5652',
    border: `1px solid ${status === 'confirmed' ? 'rgba(74,124,89,0.3)' : status === 'rejected' ? 'rgba(155,58,58,0.3)' : '#E4DED6'}`,
  } as React.CSSProperties),
  errorMsg: { color: '#9B3A3A', fontSize: 13, background: '#F5E8E8', border: '1px solid rgba(155,58,58,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 },
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 16, background: '#FAF8F5' },
  spinner: { width: 40, height: 40, border: '3px solid #E4DED6', borderTop: '3px solid #2C2C2C', borderRadius: '50%', animation: 'spin 0.8s linear infinite' } as React.CSSProperties,
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
    
    // Check client-side memory cache first
    const cachedData = clientCache.get<any>(`menu-${tableToken}`)
    if (cachedData) {
      setTable(cachedData.table)
      setCategories(cachedData.categories || [])
      setProducts(cachedData.products || [])
      setCurrency(cachedData.settings?.currency || { code: 'USD', symbol: '$', locale: 'en-US' })
      setRestaurantName(cachedData.settings?.restaurant_name || 'Our Restaurant')
      if (cachedData.categories?.length > 0) setSelectedCategory(cachedData.categories[0].id)
      setPageState('menu')
      return
    }

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
        
        // Cache the menu response for 5 minutes
        clientCache.set(`menu-${tableToken}`, json, 300)
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
      <div style={S.page}>
        {/* Header Skeleton */}
        <header style={S.header}>
          <div style={S.headerLeft}>
            <div style={{ width: 140, height: 16, background: '#E8E3DC', borderRadius: 4, marginBottom: 6, animation: 'skeleton-pulse 1.5s infinite' }} />
            <div style={{ width: 80, height: 12, background: '#E8E3DC', borderRadius: 4, animation: 'skeleton-pulse 1.5s infinite' }} />
          </div>
          <div style={{ width: 70, height: 38, background: '#E8E3DC', borderRadius: 12, animation: 'skeleton-pulse 1.5s infinite' }} />
        </header>

        <div style={S.body}>
          {/* Category Tabs Skeleton */}
          <div style={{ display: 'flex', gap: 8, padding: '16px 0 8px', overflowX: 'hidden' }}>
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  flexShrink: 0,
                  width: idx === 0 ? 80 : idx === 1 ? 110 : idx === 2 ? 70 : 90,
                  height: 34,
                  borderRadius: 40,
                  background: '#FFFFFF',
                  border: '1px solid #E4DED6',
                  animation: 'skeleton-pulse 1.5s infinite',
                }}
              />
            ))}
          </div>

          {/* Product Grid Skeleton */}
          <div style={S.grid}>
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} style={{ ...S.productCard, animation: 'skeleton-pulse 1.5s infinite' }}>
                <div style={{ width: '100%', height: 110, background: '#F5F2EE' }} />
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ width: '70%', height: 14, background: '#E8E3DC', borderRadius: 4 }} />
                  <div style={{ width: '90%', height: 10, background: '#E8E3DC', borderRadius: 4 }} />
                  <div style={{ width: '40%', height: 10, background: '#E8E3DC', borderRadius: 4 }} />
                  <div style={{ width: '100%', height: 32, background: '#E8E3DC', borderRadius: 10, marginTop: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <style>{`
          @keyframes skeleton-pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}</style>
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
        .product-card:hover { transform: translateY(-2px); border-color: #C8A97E !important; box-shadow: 0 4px 16px rgba(44,44,44,0.06) !important; }
        .add-btn:hover { background: #1a1a1a !important; transform: scale(1.02); }
        .variant-btn:hover { background: #F5EFE6 !important; }
        .cat-btn:hover { opacity: 0.85; }
        input:focus { border-color: #C8A97E !important; box-shadow: 0 0 0 3px rgba(200,169,126,0.15) !important; }
        .qty-btn:hover { background: #F5F2EE !important; }
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
