export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI' },
  { id: 'wallet', label: 'Digital wallet' },
  { id: 'bank_transfer', label: 'Bank transfer' },
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['id']
