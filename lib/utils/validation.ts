import { z } from 'zod'

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Phone number must be between 10 and 15 digits (e.g. +1234567890 or 03001234567)')

// ─── AUTH ────────────────────────────────────────────────────
export const staffLoginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(50),
  password: z.string().min(1, 'Password is required').max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must not exceed 72 bytes'),
})

// ─── PRODUCTS ────────────────────────────────────────────────
export const priceVariantSchema = z.object({
  label: z.string().trim().min(1).max(80),
  price: z.number().min(0).max(9999999),
})

export const productSchema = z.object({
  name:           z.string().trim().min(1, 'Name is required').max(120),
  description:    z.string().max(500).optional(),
  category_id:    z.number().int().positive().nullable(),
  base_price:     z.number().min(0, 'Price must be non-negative').max(9999999),
  price_variants: z.array(priceVariantSchema).max(20).refine(v => new Set(v.map(i => i.label)).size === v.length, 'Variant labels must be unique').optional().default([]),
  tax_rate:       z.number().min(0).max(100).multipleOf(0.01).default(0),
  image_url:      z.string().url().max(2048).refine(v => v.startsWith('https://'), 'Use an HTTPS image URL').optional().nullable(),
  is_available:   z.boolean().default(true),
  is_86d:         z.boolean().default(false),
})

// Zod applies defaults even inside partial objects. Updates must preserve omitted fields.
export const productUpdateSchema = productSchema.extend({
  price_variants: productSchema.shape.price_variants.removeDefault(),
  tax_rate: productSchema.shape.tax_rate.removeDefault(),
  is_available: z.boolean(),
  is_86d: z.boolean(),
}).partial().strict()

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
  password: z.string().min(8, 'Password must be at least 8 characters').max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must not exceed 72 bytes'),
  role_id:  z.number().int().positive(),
  email:    z.string().email().nullable().optional().or(z.literal('')),
  phone:    phoneSchema.nullable().optional().or(z.literal('')),
})

export const updateStaffSchema = createStaffSchema.partial().omit({ password: true }).extend({
  status: z.enum(['active', 'suspended']).optional(),
})

export const resetPasswordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters').max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must not exceed 72 bytes'),
})

// ─── ORDERS ──────────────────────────────────────────────────
export const orderItemSchema = z.object({
  product_id:         z.string().uuid(),
  variant_label:      z.string().max(80).optional().nullable(),
  quantity:           z.number().int().min(1).max(100),
  unit_price:         z.number().min(0).max(9999999),
  tax_rate:           z.number().min(0).max(100).default(0),
  notes:              z.string().max(200).optional().nullable(),
  selected_modifiers: z.array(z.object({
    id:    z.number().int(),
    name:  z.string().max(120),
    price: z.number().min(0)
  })).max(20).optional().default([])
})

export const createOrderSchema = z.object({
  table_id:      z.number().int().positive().optional().nullable(),
  order_type:    z.enum(['dine_in', 'takeaway', 'delivery']),
  items:         z.array(orderItemSchema).min(1, 'Order must have at least one item').max(100),
  notes:         z.string().max(500).optional().nullable(),
  customer_name: z.string().max(100).optional().nullable(),
  customer_phone:phoneSchema.optional().nullable().or(z.literal('')),
  customer_address: z.string().max(300).optional().nullable(),
}).strict().refine(v => v.order_type !== 'dine_in' || v.table_id != null, { message: 'A dine-in order requires a table', path: ['table_id'] })

export const voidOrderSchema = z.object({
  reason: z.string().min(5, 'Please provide a reason').max(300),
})

// ─── PAYMENTS ────────────────────────────────────────────────
export const paymentEntrySchema = z.object({
  method:          z.enum(['cash', 'card', 'upi', 'wallet', 'bank_transfer']),
  amount:          z.number().min(0).max(99999999).multipleOf(0.01),
  cash_tendered:   z.number().min(0).max(99999999).multipleOf(0.01).optional().nullable(),
  transaction_ref: z.string().max(100).optional().nullable(),
})

export const processPaymentSchema = z.object({
  payments:         z.array(paymentEntrySchema).max(10),
  discount_code:    z.string().trim().max(30).optional().nullable(),
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
}).refine(v => v.type !== 'percentage' || v.value <= 100, { message: 'Percentage cannot exceed 100', path: ['value'] })

// ─── SETTINGS ────────────────────────────────────────────────
export const restaurantProfileSchema = z.object({
  restaurant_name:    z.string().min(1).max(100),
  restaurant_address: z.string().max(200).optional(),
  restaurant_phone:   phoneSchema.nullable().optional().or(z.literal('')),
})

export const currencySchema = z.object({
  code:   z.string().regex(/^[A-Z]{3}$/),
  symbol: z.string().min(1).max(5),
  locale: z.string().min(2).max(35),
})

export const serviceChargeSchema = z.object({
  type:  z.enum(['percentage', 'flat']),
  value: z.number().min(0).multipleOf(0.01),
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
