'use client'

import type { Discount } from '@/lib/api/types'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiGet, readSettings } from '@/lib/api/client'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import { buildTaxSummary } from '@/lib/utils/tax'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/utils/payment-methods'
import Link from 'next/link'
import { ArrowLeft, CreditCard } from 'lucide-react'

interface OrderItem {
  id: string
  variant_label: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  subtotal: number
  product: { name: string } | null
}

interface OrderDetail {
  id: string
  subtotal: number
  tax_amount: number
  service_charge: number
  total: number
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  table: { table_number: string } | null
  order_items: OrderItem[]
}

export default function StaffBillingPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })
  const [availableMethods, setAvailableMethods] = useState<Record<string, boolean>>({ cash: true, card: true, upi: true })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Billing flow states
  const [discountCode, setDiscountCode] = useState('')
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null)
  const [discountAmount, setDiscountAmount] = useState(0)

  // Payment allocations
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashTendered, setCashTendered] = useState('')
  const [transactionRef, setTransactionRef] = useState('')

  // Multi-method split billing state
  const [isSplitPayment, setIsSplitPayment] = useState(false)
  const [splitAllocations, setSplitAllocations] = useState<{ method: PaymentMethod; amount: number; cash_tendered?: number; ref?: string }[]>([])
  const [tempAmount, setTempAmount] = useState('')


  useEffect(() => {
    fetchSettings()
    fetchOrderDetail()
  }, [id])

  const fetchSettings = async () => {
    const data = await readSettings()
    data.forEach(item => {
      if (item.key === 'currency') setCurrency(item.value)
      if (item.key === 'payment_methods') {
        setAvailableMethods(item.value)
        const firstEnabled = PAYMENT_METHODS.find(method => item.value[method.id])
        if (firstEnabled) setPaymentMethod(firstEnabled.id)
      }
    })
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

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return
    setError('')
    setSuccess('')

    try {
      const response = await apiGet<{data: Discount[]}>('/api/discounts?code=' + encodeURIComponent(discountCode.toUpperCase()))
      const data = response.data?.find((d: { code: string }) => d.code === discountCode.toUpperCase())
      const error = !data

      if (error || !data) {
        throw new Error('Invalid or expired discount code')
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        throw new Error('This discount code has expired')
      }

      if (data.max_uses && data.times_used >= data.max_uses) {
        throw new Error('This discount code usage limit has been reached')
      }

      if (Number(order?.subtotal || 0) < Number(data.min_order_amount || 0)) throw new Error('Order is below the discount minimum')
      const calculatedAmt = data.type === 'percentage'
        ? (Number(order?.subtotal || 0) * data.value) / 100
        : data.value

      setDiscountAmount(parseFloat(calculatedAmt.toFixed(2)))
      setAppliedDiscountCode(data.code)
      setSuccess(`Discount of ${data.type === 'percentage' ? `${data.value}%` : `$${data.value}`} applied successfully`)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const addSplitAllocation = () => {
    if (!availableMethods[paymentMethod]) { setError('Choose an enabled payment method.'); return }
    const amt = parseFloat(tempAmount)
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid split amount')
      return
    }

    const currentTotalAllocated = splitAllocations.reduce((s, a) => s + a.amount, 0)
    if (currentTotalAllocated + amt > grandTotal) {
      setError('Allocations exceed total bill amount')
      return
    }

    if (paymentMethod === 'cash') {
      const cashTenderedVal = parseFloat(cashTendered) || amt
      if (cashTenderedVal < amt) {
        setError(`Insufficient cash for this split: Need at least ${fmt(amt)}`)
        return
      }
    }

    setSplitAllocations([
      ...splitAllocations,
      {
        method: paymentMethod,
        amount: amt,
        cash_tendered: paymentMethod === 'cash' ? (parseFloat(cashTendered) || amt) : undefined,
        ref: paymentMethod !== 'cash' ? transactionRef : undefined
      }
    ])

    // reset fields
    setTempAmount('')
    setCashTendered('')
    setTransactionRef('')
    setError('')
  }

  const removeSplitAllocation = (index: number) => {
    const updated = [...splitAllocations]
    updated.splice(index, 1)
    setSplitAllocations(updated)
  }

  const handleCheckout = async () => {
    setSubmitting(true)
    setError('')

    // Validate cash received is sufficient for single cash checkout
    if (!isSplitPayment && paymentMethod === 'cash') {
      const cashVal = parseFloat(cashTendered) || 0
      if (cashVal < grandTotal) {
        setError(`Insufficient cash received: ${fmt(grandTotal - cashVal)} more needed`)
        setSubmitting(false)
        return
      }
    }

    const finalPaymentsPayload = grandTotal === 0 ? [] : isSplitPayment
      ? splitAllocations.map(a => ({
          method: a.method,
          amount: a.amount,
          cash_tendered: a.cash_tendered,
          transaction_ref: a.ref
        }))
      : [{
          method: paymentMethod,
          amount: grandTotal,
          cash_tendered: paymentMethod === 'cash' ? parseFloat(cashTendered) : null,
          transaction_ref: paymentMethod !== 'cash' ? transactionRef : null
        }]

    if (finalPaymentsPayload.some(payment => !availableMethods[payment.method])) {
      setError('A payment method is disabled. Update the payment selection.'); setSubmitting(false); return
    }
    const totalPaid = finalPaymentsPayload.reduce((s, p) => s + p.amount, 0)
    if (Math.abs(totalPaid - grandTotal) > 0.01) {
      setError(`Payment mismatch: Allocated ${fmt(totalPaid)} out of ${fmt(grandTotal)}`)
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch(`/api/orders/${id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: finalPaymentsPayload,
          discount_code: appliedDiscountCode,
          discount_amount: discountAmount
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      router.push(`/staff/orders/${id}/receipt`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Initializing billing session...</div>
  if (!order) return <div style={{ padding: '40px', textAlign: 'center' }}>Order not found.</div>

  const fmt = (n: number) => formatCurrency(n, currency)

  // Calculations
  const taxSummary = buildTaxSummary(order.order_items.map(i => ({ unit_price: i.unit_price, quantity: i.quantity, tax_rate: i.tax_rate })))
  const computedSC = Number(order.service_charge)
  const preDiscountTotal = Number(order.subtotal) + Number(order.tax_amount) + computedSC

  const grandTotal = Number(Math.max(0, preDiscountTotal - discountAmount).toFixed(2))

  // Cash change preview
  const cashGivenVal = parseFloat(cashTendered) || 0
  const changeDue = cashGivenVal > grandTotal ? cashGivenVal - grandTotal : 0

  return (
    <div className="animate-in responsive-grid-split-380" style={{ minHeight: 'calc(100vh - 100px)' }}>
      <div className="workspace-title billing-heading"><div><span className="eyebrow">A good ending to a great meal</span><h1>Settle the bill.</h1><p>Review the order, apply a discount and collect payment.</p></div><Link className="btn btn-secondary" href={`/staff/orders/${id}`}><ArrowLeft size={14}/>Back to order</Link></div>
      {/* Checkout and Payments Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Discount Code Form */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Discounts</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id="discount-code-input"
              className="input"
              type="text"
              placeholder="ENTER PROMO CODE"
              value={discountCode}
              onChange={e => setDiscountCode(e.target.value)}
              disabled={!!appliedDiscountCode}
              style={{ textTransform: 'uppercase', flex: 1 }}
            />
            <button
              id="apply-discount-btn"
              type="button"
              className="btn btn-secondary"
              onClick={handleApplyDiscount}
              disabled={!!appliedDiscountCode}
            >
              Apply
            </button>
          </div>
          {success && <div className="badge badge-green" style={{ marginTop: '10px', display: 'block', width: 'fit-content' }}>{success}</div>}
        </div>

        {/* Payment Modes Configurations */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}><CreditCard size={17}/>Payment checkout</h3>

          {/* Toggle standard / split payment */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn ${!isSplitPayment ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setIsSplitPayment(false); setSplitAllocations([]) }}
              style={{ flex: 1 }}
            >
              Single Payment
            </button>
            <button
              type="button"
              className={`btn ${isSplitPayment ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setIsSplitPayment(true); setSplitAllocations([]) }}
              style={{ flex: 1 }}
            >
              Split / Multi Payment
            </button>
          </div>

          {!isSplitPayment ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="pay-method-select">Payment Method</label>
                <select
                  id="pay-method-select"
                  className="input"
                  value={paymentMethod}
                  onChange={e => {
                    setPaymentMethod(e.target.value as PaymentMethod)
                    setCashTendered('')
                    setTransactionRef('')
                  }}
                >
                  {PAYMENT_METHODS.filter(method=>availableMethods[method.id]).map(method=><option key={method.id} value={method.id}>{method.label}</option>)}
                </select>
              </div>

              {paymentMethod === 'cash' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="input-group">
                    <label className="input-label" htmlFor="cash-received">Cash Received ({currency.symbol})</label>
                    <input
                      id="cash-received"
                      className="input"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 50.00"
                      value={cashTendered}
                      onChange={e => setCashTendered(e.target.value)}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label" style={{ color: cashGivenVal > 0 && cashGivenVal < grandTotal ? 'var(--error, #ef4444)' : undefined }}>
                      {cashGivenVal > 0 && cashGivenVal < grandTotal ? 'More Needed' : 'Change Due'}
                    </label>
                    <div style={{
                      minHeight: '44px', display: 'flex', alignItems: 'center',
                      background: 'var(--surface-3)', border: '1px solid var(--border-light)',
                      borderRadius: '10px', padding: '0 14px', fontWeight: 'bold',
                      color: cashGivenVal > 0 && cashGivenVal < grandTotal ? 'var(--error, #ef4444)' : 'var(--success, #4a7c59)'
                    }}>
                      {cashGivenVal > 0 && cashGivenVal < grandTotal ? fmt(grandTotal - cashGivenVal) : fmt(changeDue)}
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod !== 'cash' && (
                <div className="input-group">
                  <label className="input-label" htmlFor="trans-ref">Transaction Reference / Approval Code</label>
                  <input
                    id="trans-ref"
                    className="input"
                    type="text"
                    placeholder="Transaction or approval reference"
                    value={transactionRef}
                    onChange={e => setTransactionRef(e.target.value)}
                  />
                </div>
              )}
            </div>
          ) : (
            // Split payment manager UI
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="split-method-select">Mode</label>
                  <select id="split-method-select" className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.filter(method=>availableMethods[method.id]).map(method=><option key={method.id} value={method.id}>{method.label}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="split-amount-input">Amount</label>
                  <input id="split-amount-input" className="input" type="number" step="0.01" placeholder="Amount" value={tempAmount} onChange={e => setTempAmount(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={addSplitAllocation}
                  style={{ alignSelf: 'flex-end', minHeight: '44px' }}
                >
                  ＋ Add
                </button>
              </div>

              {paymentMethod === 'cash' && tempAmount && (
                <div className="input-group">
                  <label className="input-label" htmlFor="split-cash-received">Cash Tendered for this split</label>
                  <input id="split-cash-received" className="input" type="number" step="0.01" value={cashTendered} onChange={e => setCashTendered(e.target.value)} />
                </div>
              )}

              {paymentMethod !== 'cash' && tempAmount && (
                <div className="input-group">
                  <label className="input-label" htmlFor="split-trans-ref">Reference ID</label>
                  <input id="split-trans-ref" className="input" type="text" value={transactionRef} onChange={e => setTransactionRef(e.target.value)} />
                </div>
              )}

              {/* Allocations Table */}
              <div style={{ background: 'var(--surface-3)', borderRadius: '10px', padding: '12px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Split Breakdown</h4>
                {splitAllocations.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No split allocations added yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {splitAllocations.map((a, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                            {PAYMENT_METHODS.find(method=>method.id===a.method)?.label} · {fmt(a.amount)}
                          </span>
                          {a.method === 'cash' && a.cash_tendered && a.cash_tendered > a.amount && (
                            <span style={{ color: 'var(--success, #4a7c59)', fontSize: '11px', paddingLeft: '12px', marginTop: '2px' }}>
                              (Change Due: {fmt(a.cash_tendered - a.amount)})
                            </span>
                          )}
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeSplitAllocation(idx)} style={{ color: '#ef4444', minHeight: '24px', padding: '0 4px' }}>
                          Remove
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', marginTop: '8px', borderTop: '1px dashed var(--border-light)', paddingTop: '6px' }}>
                      <span>Total Allocated:</span>
                      <span>{fmt(splitAllocations.reduce((s,a) => s + a.amount, 0))}</span>
                    </div>
                    {(() => {
                      const allocatedSum = splitAllocations.reduce((s,a) => s + a.amount, 0)
                      return allocatedSum < grandTotal ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', color: 'var(--error, #ef4444)', marginTop: '4px' }}>
                          <span>More Needed:</span>
                          <span>{fmt(grandTotal - allocatedSum)}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', color: 'var(--success, #4a7c59)', marginTop: '4px' }}>
                          <span>Fully Allocated!</span>
                          <span>{fmt(allocatedSum)}</span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bill summary side details */}
      <div className="surface-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Summary</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          <div>Order Mode: <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{order.order_type.replace('_',' ')}</span></div>
          {order.order_type === 'dine_in' && <div>Table Session: <span style={{ color: 'var(--text-primary)' }}>Table {order.table?.table_number}</span></div>}
        </div>

        {/* Item list (read only summary) */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {order.order_items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span>{item.quantity} × {item.product?.name}</span>
              <span>{fmt(item.subtotal)}</span>
            </div>
          ))}
        </div>

        {/* Pricing block */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span style={{ color: 'var(--text-primary)' }}>{fmt(taxSummary.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Taxes:</span>
              <span style={{ color: 'var(--text-primary)' }}>{fmt(taxSummary.total_tax)}</span>
            </div>
            {computedSC > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Service Charge:</span>
                <span style={{ color: 'var(--text-primary)' }}>{fmt(computedSC)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Discount Applied:</span>
                <span style={{ color: 'var(--success)' }}>-{fmt(discountAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-primary)' }}>GRAND TOTAL:</span>
              <span style={{ color: 'var(--brand-400)' }}>{fmt(grandTotal)}</span>
            </div>
          </div>

          {error && <div className="badge badge-red" style={{ marginBottom: '12px', display: 'block', width: '100%', padding: '6px' }}>{error}</div>}

          <button
            id="checkout-finalize-btn"
            className="btn btn-primary btn-lg"
            onClick={handleCheckout}
            disabled={submitting}
            style={{ width: '100%' }}
          >
            {submitting ? 'Finalizing Checkout...' : '💵 Finalize Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
