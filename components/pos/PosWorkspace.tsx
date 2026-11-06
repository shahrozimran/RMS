'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, ClipboardList, LayoutGrid, LoaderCircle, Minus, Plus, Search, ShoppingBag, StickyNote, Trash2, Truck, UserRound, Utensils, X } from 'lucide-react'
import type { CatalogData, CatalogProduct, EditableOrder, Modifier } from '@/lib/api/types'
import { formatCurrency } from '@/lib/utils/currency'
import { buildTaxSummary, calculateGrandTotal } from '@/lib/utils/tax'
import { repriceCartLine } from '@/lib/utils/cart'
import ProductGrid from '@/components/pos/ProductGrid'
import EmptyState from '@/components/ui/EmptyState'

export type OrderPayload = {
  table_id: number | null; order_type: 'dine_in' | 'takeaway' | 'delivery';
  customer_name: string | null; customer_phone: string | null; customer_address: string | null; notes: string | null;
  items: { product_id: string; variant_label: string | null; quantity: number; unit_price: number; tax_rate: number; notes: string | null; selected_modifiers: Modifier[] }[]
}
type CartLine = { key: string; product_id: string; product_name: string; variant_label: string | null; quantity: number;
  unit_price: number; tax_rate: number; notes: string; selected_modifiers: Modifier[] }
function initialLines(order: EditableOrder | undefined, products: CatalogProduct[]): CartLine[] {
  return (order?.order_items || []).map((item,index) => {
    const line = { ...item, key: `existing-${index}`, product_name: item.product?.name || 'Unavailable item', notes: item.notes || '', selected_modifiers: item.selected_modifiers || [] }
    try { return repriceCartLine(line,products) } catch { return line }
  })
}

export default function PosWorkspace({ catalog, onSubmit, initialOrder, customer = false, fixedTable, restaurantName }: {
  catalog: CatalogData; onSubmit: (payload: OrderPayload) => Promise<void>; initialOrder?: EditableOrder;
  customer?: boolean; fixedTable?: number; restaurantName?: string
}) {
  const [category, setCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>(() => initialLines(initialOrder,catalog.products))
  const [orderType, setOrderType] = useState<OrderPayload['order_type']>(initialOrder?.order_type || 'dine_in')
  const [tableId, setTableId] = useState<number | null>(fixedTable || initialOrder?.table_id || null)
  const [customerName, setCustomerName] = useState(initialOrder?.customer_name || '')
  const [phone, setPhone] = useState(initialOrder?.customer_phone || '')
  const [address, setAddress] = useState(initialOrder?.customer_address || '')
  const [orderNotes, setOrderNotes] = useState(initialOrder?.notes || '')
  const [noteKey, setNoteKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeProduct, setActiveProduct] = useState<CatalogProduct | null>(null)
  const [variant, setVariant] = useState('')
  const [selectedMods, setSelectedMods] = useState<number[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const orderPanel = useRef<HTMLElement>(null)
  const [cartInView,setCartInView] = useState(false)
  useEffect(() => {
    if (!customer || !orderPanel.current) return
    const observer = new IntersectionObserver(entries => setCartInView(entries[0].isIntersecting), {threshold:0.1})
    observer.observe(orderPanel.current)
    return () => observer.disconnect()
  }, [customer])
  const currency = catalog.settings.currency
  const fmt = (value: number) => formatCurrency(value,currency)
  const deferredSearch = useDeferredValue(search)
  const availableProducts = useMemo(() => catalog.products.filter(p => p.is_available && !p.is_86d), [catalog.products])
  const products = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    return availableProducts.filter(p => (category === null || p.category_id === category) && `${p.name} ${p.description || ''}`.toLowerCase().includes(query))
  }, [availableProducts, category, deferredSearch])
  const itemCount = cart.reduce((sum,line) => sum+line.quantity,0)
  const taxes = buildTaxSummary(cart)
  const totals = calculateGrandTotal({ subtotal: taxes.subtotal, tax_amount: taxes.total_tax,
    service_charge_type: catalog.settings.service_charge.type, service_charge_value: catalog.settings.service_charge.value, discount_amount: 0 })

  const add = useCallback((product: CatalogProduct, label: string | null, mods: Modifier[]) => {
    const chosen = product.price_variants?.find(v => v.label === label)
    const unitPrice = (Math.round(Number(chosen?.price ?? product.base_price)*100) + mods.reduce((sum,m) => sum+Math.round(Number(m.price)*100),0))/100
    const key = JSON.stringify([product.id,label,mods.map(m => m.id).sort((a,b) => a-b)])
    setCart(previous => {
      const index = previous.findIndex(line => line.key === key)
      if (index >= 0) return previous.map((line,i) => i === index ? { ...line, quantity: Math.min(100,line.quantity+1) } : line)
      if (previous.length >= 100) return previous
      return [...previous,{key,product_id:product.id,product_name:product.name,variant_label:label,quantity:1,unit_price:unitPrice,tax_rate:Number(product.tax_rate),notes:'',selected_modifiers:mods}]
    })
    setError('')
  }, [])
  const choose = useCallback((product: CatalogProduct, label?: string) => {
    if (product.price_variants?.length || product.modifiers?.length) {
      setActiveProduct(product); setVariant(label || product.price_variants?.[0]?.label || ''); setSelectedMods([])
      dialog.current?.showModal()
    } else add(product,null,[])
  }, [add])
  const changeQuantity = (key: string,delta: number) => setCart(previous => previous.map(line => line.key === key ? {...line,quantity:Math.min(100,line.quantity+delta)} : line).filter(line => line.quantity > 0))
  const submit = async () => {
    if (!cart.length) { setError('Add at least one item to the order.'); return }
    if (orderType === 'dine_in' && !tableId) { setError('Choose a table before placing this order.'); return }
    if (customer && !customerName.trim()) { setError('Enter your name so our team can find you.'); return }
    if (phone && !/^\+?[0-9]{10,15}$/.test(phone.trim())) { setError('Use a phone number with 10–15 digits.'); return }
    setBusy(true); setError('')
    try {
      await onSubmit({ table_id:orderType === 'dine_in' ? tableId : null,order_type:orderType,customer_name:customerName.trim() || null,
        customer_phone:phone.trim() || null,customer_address:orderType === 'delivery' ? address.trim() || null : null,notes:orderNotes || null,
        items:cart.map(line => ({product_id:line.product_id,variant_label:line.variant_label,quantity:line.quantity,unit_price:line.unit_price,tax_rate:line.tax_rate,notes:line.notes || null,selected_modifiers:line.selected_modifiers})) })
      if (!initialOrder) setCart([])
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to place the order. Please try again.') }
    finally { setBusy(false) }
  }

  return <div className="animate-in">
    {!customer && <div className="workspace-title"><div><span className="eyebrow">Service workspace</span><h1>{initialOrder ? 'Edit order' : 'Point of sale'}</h1><p>{initialOrder ? 'Update the details. Menu prices and taxes are refreshed for this order.' : 'A good service starts with a great order.'}</p></div><span className="date-pill"><span className="status-dot" style={{color:'var(--success)'}} />{availableProducts.length} items on the menu</span></div>}
    {error && <div className="alert" role="alert"><ClipboardList size={17} />{error}</div>}
    <fieldset disabled={busy} className="pos-fields"><div className="pos-workspace">
      <section className="pos-menu" aria-label="Menu catalog">
        <div className="filter-toolbar"><label className="search-field"><Search size={16} /><input type="search" placeholder="Search dishes, drinks and more…" aria-label="Search menu" value={search} onChange={e => setSearch(e.target.value)} /></label><span className="count-note">{products.length} items</span></div>
        <div className="filter-tabs" role="group" aria-label="Menu categories"><button className={`filter-tab ${category === null ? 'active' : ''}`} onClick={() => setCategory(null)}><LayoutGrid size={13} />All items</button>{catalog.categories.map(c => <button key={c.id} className={`filter-tab ${category === c.id ? 'active' : ''}`} onClick={() => setCategory(c.id)}>{c.name}<span>{availableProducts.filter(p => p.category_id === c.id).length}</span></button>)}</div>
        {products.length === 0 ? <EmptyState title="Nothing on this tray yet" description="Try another category or a different search." action={<button className="btn btn-secondary btn-sm" onClick={() => {setSearch('');setCategory(null)}}>Reset filters</button>} /> : <ProductGrid products={products} currency={currency} onChoose={choose} />}
      </section>
      <aside ref={orderPanel} id="current-order" className="order-panel" aria-label="Current order">
        <div className="order-panel-header"><div><h2>{customer ? 'Your order' : 'Current order'}</h2><small>{customer ? restaurantName || 'Made with care' : 'Review the details before sending'}</small></div><button className="icon-button" disabled={!cart.length} onClick={() => setCart([])} aria-label="Clear order" title="Clear order"><Trash2 size={14} /></button></div>
        <div className="order-panel-body">
          {!customer && <><div className="order-type-switch" role="group" aria-label="Order type">{([{value:'dine_in',label:'Dine in',Icon:Utensils},{value:'takeaway',label:'Takeaway',Icon:ShoppingBag},{value:'delivery',label:'Delivery',Icon:Truck}] as const).map(({value,label,Icon}) => <button key={value} className={orderType === value ? 'active' : ''} aria-pressed={orderType === value} onClick={() => setOrderType(value)}><Icon size={12} />{label}</button>)}</div>{orderType === 'dine_in' && <label className="input-group"><span className="input-label">Table</span><select aria-label="Table" className="input" value={tableId || ''} onChange={e => setTableId(Number(e.target.value) || null)}><option value="">Select a table</option>{catalog.tables.map(t => <option key={t.id} value={t.id} disabled={t.status === 'reserved' || t.status === 'cleaning'}>{t.table_number} · {t.capacity} seats{t.status === 'occupied' ? ' · In service' : t.status !== 'free' ? ` · ${t.status}` : ''}</option>)}</select></label>}</>}
          {customer && <label className="input-group"><span className="input-label">Your name</span><input className="input" placeholder="What should we call you?" autoComplete="given-name" value={customerName} maxLength={50} onChange={e => setCustomerName(e.target.value)} /></label>}
          <div className="order-lines">{cart.length === 0 ? <EmptyState title="Ready when you are" description="Choose something delicious from the menu to start your order." /> : cart.map(line => <div className="cart-line" key={line.key}><div className="cart-line-heading"><div><strong>{line.product_name}</strong>{line.variant_label && <small>{line.variant_label}</small>}{line.selected_modifiers.length > 0 && <small>{line.selected_modifiers.map(m => m.name).join(', ')}</small>}</div><span className="num">{fmt(line.unit_price*line.quantity)}</span></div><div className="cart-line-tools"><div className="quantity-control"><button aria-label={`Remove one ${line.product_name}`} onClick={() => changeQuantity(line.key,-1)}><Minus size={11} /></button><span>{line.quantity}</span><button aria-label={`Add one ${line.product_name}`} onClick={() => changeQuantity(line.key,1)} disabled={line.quantity >= 100}><Plus size={11} /></button></div><button className="icon-button" style={{border:0,width:26,height:26}} onClick={() => setNoteKey(noteKey === line.key ? null : line.key)} aria-label={`Add a note for ${line.product_name}`}><StickyNote size={13} /></button></div>{noteKey === line.key && <textarea className="cart-line-note" aria-label={`Preparation notes for ${line.product_name}`} placeholder="No onions, extra spicy…" maxLength={200} value={line.notes} onChange={e => setCart(previous => previous.map(i => i.key === line.key ? {...i,notes:e.target.value} : i))} />}</div>)}</div>
          {!customer && <details className="customer-details" open={orderType === 'delivery' || undefined}><summary><UserRound size={12} />Customer & order details<ChevronDown size={12} style={{marginLeft:'auto'}} /></summary><div><input className="input" aria-label="Customer name" placeholder="Customer name (optional)" maxLength={100} value={customerName} onChange={e => setCustomerName(e.target.value)} /><input className="input" aria-label="Customer phone" placeholder="Phone number (optional)" type="tel" maxLength={16} value={phone} onChange={e => setPhone(e.target.value)} />{orderType === 'delivery' && <textarea className="input" aria-label="Delivery address" placeholder="Delivery address" value={address} maxLength={300} onChange={e => setAddress(e.target.value)} />}<textarea className="input" aria-label="Order notes" placeholder="Anything the team should know?" value={orderNotes} maxLength={500} onChange={e => setOrderNotes(e.target.value)} /></div></details>}
        </div>
        <div className="order-total"><div className="total-line"><span>Subtotal <span className="muted">({itemCount} items)</span></span><span className="num">{fmt(taxes.subtotal)}</span></div><div className="total-line"><span>Tax</span><span className="num">{fmt(taxes.total_tax)}</span></div>{totals.service_charge > 0 && <div className="total-line"><span>Service charge</span><span>{fmt(totals.service_charge)}</span></div>}<div className="total-line grand"><span>Total</span><span className="num">{fmt(totals.total)}</span></div><button className="btn btn-primary order-submit" disabled={!cart.length || busy} onClick={submit}><span>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={15} />}{busy ? 'Sending order…' : initialOrder ? 'Save changes' : customer ? 'Place your order' : 'Send to kitchen'}</span><ArrowRight size={16} /></button><p className="order-footnote">{customer ? 'Our team will confirm your order shortly.' : 'Made for a smoother service.'}</p></div>
      </aside>
    </div></fieldset>
    {customer && itemCount > 0 && !cartInView && <a className="guest-cart-link" href="#current-order"><ShoppingBag size={16}/><span>View your order · {itemCount} {itemCount === 1 ? 'item' : 'items'}</span><strong>{fmt(totals.total)}</strong><ArrowRight size={15}/></a>}
    <dialog ref={dialog} aria-label="Customize item" className="pos-modal" onClick={e => {if(e.target === dialog.current) dialog.current.close()}}>{activeProduct && <><div className="row space-between"><span className="eyebrow" style={{margin:0}}>Make it yours</span><button className="icon-button" aria-label="Close customization" onClick={() => dialog.current?.close()}><X size={16} /></button></div><h2>{activeProduct.name}</h2><p>Just the way you like it.</p>{!!activeProduct.price_variants?.length && <div style={{marginBottom:20}}><label className="input-label" htmlFor="product-variant">Choose your size</label><select className="input" id="product-variant" value={variant} onChange={e => setVariant(e.target.value)}>{activeProduct.price_variants.map(v => <option key={v.label} value={v.label}>{v.label} · {fmt(v.price)}</option>)}</select></div>}{activeProduct.modifiers?.map(m => <label className="modifier-option" key={m.id}><input type="checkbox" checked={selectedMods.includes(m.id)} onChange={() => setSelectedMods(previous => previous.includes(m.id) ? previous.filter(id => id !== m.id) : [...previous,m.id])} /><span>{m.name}</span><strong>+{fmt(m.price)}</strong></label>)}<button className="btn btn-primary" style={{width:'100%',marginTop:18}} onClick={() => {add(activeProduct,variant || null,activeProduct.modifiers.filter(m => selectedMods.includes(m.id)));dialog.current?.close()}}><Plus size={16} />Add to order</button></>}</dialog>
  </div>
}
