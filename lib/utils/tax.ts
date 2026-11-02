/**
 * Tax calculation utilities — per-product tax rates.
 */

export interface OrderItemForTax {
  unit_price: number
  quantity: number
  tax_rate: number  // percentage, e.g. 5.0 = 5%
}

/**
 * Calculate tax amount for a single order item.
 */
export function calculateItemTax(item: OrderItemForTax): number {
  const lineCents = Math.round(item.unit_price * 100) * item.quantity
  const rateBasisPoints = Math.round(item.tax_rate * 100)
  return Math.round(lineCents * rateBasisPoints / 10000) / 100
}

/**
 * Calculate line subtotal (before tax).
 */
export function calculateItemSubtotal(item: { unit_price: number; quantity: number }): number {
  return (Math.round(item.unit_price * 100) * item.quantity) / 100
}

/**
 * Build a full tax summary from an array of order items.
 */
export interface TaxSummary {
  subtotal: number       // sum of all line subtotals (excl. tax)
  total_tax: number      // sum of all item taxes
  tax_by_rate: {         // grouped by tax rate %
    rate: number
    taxable_amount: number
    tax_amount: number
  }[]
}

export function buildTaxSummary(items: OrderItemForTax[]): TaxSummary {
  let subtotal = 0
  let total_tax = 0
  const rateMap = new Map<number, { taxable_amount: number; tax_amount: number }>()

  for (const item of items) {
    const lineTotal = calculateItemSubtotal(item)
    const tax = calculateItemTax(item)
    subtotal += lineTotal
    total_tax += tax

    const existing = rateMap.get(item.tax_rate) ?? { taxable_amount: 0, tax_amount: 0 }
    rateMap.set(item.tax_rate, {
      taxable_amount: existing.taxable_amount + lineTotal,
      tax_amount: existing.tax_amount + tax,
    })
  }

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    total_tax: parseFloat(total_tax.toFixed(2)),
    tax_by_rate: Array.from(rateMap.entries())
      .filter(([rate]) => rate > 0)
      .map(([rate, data]) => ({
        rate,
        taxable_amount: parseFloat(data.taxable_amount.toFixed(2)),
        tax_amount: parseFloat(data.tax_amount.toFixed(2)),
      }))
      .sort((a, b) => a.rate - b.rate),
  }
}

/**
 * Calculate grand total given subtotal, tax, service charge, and discount.
 */
export function calculateGrandTotal(params: {
  subtotal: number
  tax_amount: number
  service_charge_type: 'percentage' | 'flat'
  service_charge_value: number
  discount_amount: number
}): { service_charge: number; total: number } {
  const service_charge =
    params.service_charge_type === 'percentage'
      ? Math.round(Math.round(params.subtotal * 100) * Math.round(params.service_charge_value * 100) / 10000) / 100
      : params.service_charge_value

  const total = parseFloat(
    Math.max(
      0,
      params.subtotal + params.tax_amount + service_charge - params.discount_amount
    ).toFixed(2)
  )

  return { service_charge, total }
}
