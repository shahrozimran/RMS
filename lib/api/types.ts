import type { CurrencyConfig } from '@/lib/utils/currency'

export type Modifier = { id: number; name: string; price: number }
export type CatalogProduct = { id: string; name: string; description: string | null; category_id: number | null;
  base_price: number; price_variants: { label: string; price: number }[] | null; tax_rate: number;
  image_url: string | null; is_available: boolean; is_86d: boolean; modifiers: Modifier[] }
export type CatalogData = {
  categories: { id: number; name: string }[]; products: CatalogProduct[];
  tables: { id: number; table_number: string; section: string | null; capacity: number; status: 'free' | 'occupied' | 'reserved' | 'cleaning' }[];
  settings: { currency: CurrencyConfig; service_charge: { type: 'percentage' | 'flat'; value: number } }
}
export type EditableOrder = {
  notes?: string | null;
  order_type: 'dine_in' | 'takeaway' | 'delivery'; table_id: number | null;
  customer_name: string | null; customer_phone: string | null; customer_address: string | null;
  order_items: { product_id: string; variant_label: string | null; quantity: number; unit_price: number; tax_rate: number;
    notes: string | null; selected_modifiers: Modifier[]; product: { name: string } | null }[]
}
export type Discount = { code: string; is_active: boolean; expires_at: string | null; max_uses: number | null; times_used: number;
  min_order_amount: number; type: 'percentage' | 'flat'; value: number }
type SettingValues = { currency: CurrencyConfig; service_charge: { type: 'percentage' | 'flat'; value: number };
  restaurant_name: string; restaurant_address: string; restaurant_phone: string; restaurant_logo: string | null; payment_methods: Record<string,boolean> }
export type PosSettings = Partial<SettingValues>
export type SettingEntry = { [K in keyof SettingValues]: { key: K; value: SettingValues[K] } }[keyof SettingValues]
