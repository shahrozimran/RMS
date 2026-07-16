import { z } from 'zod'

// ─── AUTH ────────────────────────────────────────────────────
export const staffLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

// ─── PRODUCTS ────────────────────────────────────────────────
export const priceVariantSchema = z.object({
  label: z.string().min(1),
  price: z.number().positive(),
})

export const productSchema = z.object({
  name:           z.string().min(1, 'Name is required').max(120),
  description:    z.string().max(500).optional(),
  category_id:    z.number().int().positive().nullable(),
  base_price:     z.number().min(0, 'Price must be non-negative'),
  price_variants: z.array(priceVariantSchema).optional().default([]),
  tax_rate:       z.number().min(0).max(100).default(0),
  image_url:      z.string().url().optional().nullable(),
  is_available:   z.boolean().default(true),
  is_86d:         z.boolean().default(false),
})

// ─── CATEGORIES ──────────────────────────────────────────────
export const categorySchema = z.object({
  name:        z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  sort_order:  z.number().int().min(0).default(0),
})

// ─── STAFF ───────────────────────────────────────────────────
export const createStaffSchema = z.object({
  name:     z.string().min(1).max(100),
  username: z.string().min(3).max(50).regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, underscores only'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role_id:  z.number().int().positive(),
  email:    z.string().email().optional().or(z.literal('')),
  phone:    z.string().max(20).optional(),
})

export const updateStaffSchema = createStaffSchema.partial().omit({ password: true }).extend({
  status: z.enum(['active', 'suspended']).optional(),
})

export const resetPasswordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
})

// ─── ORDERS ──────────────────────────────────────────────────
export const orderItemSchema = z.object({
  product_id:    z.string().uuid(),
  variant_label: z.string().optional().nullable(),
  quantity:      z.number().int().min(1),
  unit_price:    z.number().min(0),
  tax_rate:      z.number().min(0).max(100).default(0),
  notes:         z.string().max(200).optional(),
})

export const createOrderSchema = z.object({
  table_id:      z.number().int().positive().optional().nullable(),
  order_type:    z.enum(['dine_in', 'takeaway', 'delivery']),
  items:         z.array(orderItemSchema).min(1, 'Order must have at least one item'),
  notes:         z.string().max(500).optional(),
  customer_name: z.string().max(100).optional(),
  customer_phone:z.string().max(20).optional(),
  customer_address: z.string().max(300).optional(),
})

export const voidOrderSchema = z.object({
  reason: z.string().min(5, 'Please provide a reason').max(300),
})

// ─── PAYMENTS ────────────────────────────────────────────────
export const paymentEntrySchema = z.object({
  method:          z.enum(['cash', 'card', 'upi', 'wallet', 'bank_transfer']),
  amount:          z.number().positive(),
  cash_tendered:   z.number().optional().nullable(),
  transaction_ref: z.string().max(100).optional().nullable(),
})

export const processPaymentSchema = z.object({
  payments:         z.array(paymentEntrySchema).min(1),
  discount_code:    z.string().optional().nullable(),
  discount_amount:  z.number().min(0).default(0),
})

// ─── TABLES ──────────────────────────────────────────────────
export const tableSchema = z.object({
  table_number: z.string().min(1).max(20),
  section:      z.string().max(60).optional(),
  capacity:     z.number().int().min(1).max(50).optional(),
})

export const tableStatusSchema = z.object({
  status: z.enum(['free', 'occupied', 'reserved', 'cleaning']),
})

// ─── DISCOUNTS ───────────────────────────────────────────────
export const discountSchema = z.object({
  code:             z.string().min(2).max(30).regex(/^[A-Z0-9_-]+$/, 'Uppercase letters, numbers, - and _ only'),
  type:             z.enum(['percentage', 'flat']),
  value:            z.number().positive(),
  min_order_amount: z.number().min(0).default(0),
  max_uses:         z.number().int().positive().optional().nullable(),
  is_active:        z.boolean().default(true),
  expires_at:       z.string().datetime().optional().nullable(),
})

// ─── SETTINGS ────────────────────────────────────────────────
export const restaurantProfileSchema = z.object({
  restaurant_name:    z.string().min(1).max(100),
  restaurant_address: z.string().max(200).optional(),
  restaurant_phone:   z.string().max(30).optional(),
})

export const currencySchema = z.object({
  code:   z.string().length(3),
  symbol: z.string().min(1).max(5),
  locale: z.string().min(2),
})

export const serviceChargeSchema = z.object({
  type:  z.enum(['percentage', 'flat']),
  value: z.number().min(0),
})

export const tableCountSchema = z.object({
  count: z.number().int().min(1).max(200),
})

// ─── INVENTORY ───────────────────────────────────────────────
export const ingredientSchema = z.object({
  name:               z.string().min(1).max(100),
  unit:               z.string().min(1).max(20),
  quantity_available: z.number().min(0).default(0),
  reorder_threshold:  z.number().min(0).default(0),
  cost_per_unit:      z.number().min(0).optional().nullable(),
})

export const stockTopUpSchema = z.object({
  quantity: z.number().positive('Quantity must be positive'),
  notes:    z.string().max(200).optional(),
})

export const recipeIngredientSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantity_used: z.number().positive(),
})

// ─── SHIFTS ──────────────────────────────────────────────────
export const clockInSchema = z.object({
  notes: z.string().max(200).optional(),
})
