import { z } from 'zod'
import { currencySchema, serviceChargeSchema, phoneSchema } from './validation'

export const settingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('restaurant_name'), value: z.string().trim().min(1).max(100) }),
  z.object({ key: z.literal('restaurant_address'), value: z.string().max(200) }),
  z.object({ key: z.literal('restaurant_phone'), value: phoneSchema.or(z.literal('')) }),
  z.object({ key: z.literal('restaurant_logo'), value: z.url().nullable() }),
  z.object({ key: z.literal('currency'), value: currencySchema }),
  z.object({ key: z.literal('service_charge'), value: serviceChargeSchema.refine(v => v.value <= (v.type === 'percentage' ? 100 : 100000)) }),
  z.object({ key: z.literal('payment_methods'), value: z.object({ cash: z.boolean(), card: z.boolean(), upi: z.boolean(), wallet: z.boolean().default(false), bank_transfer: z.boolean().default(false) }).refine(v => Object.values(v).some(Boolean), 'Enable at least one payment method') }),
])

export const POS_SETTING_KEYS = ['restaurant_name','restaurant_address','restaurant_phone','restaurant_logo','currency','service_charge','payment_methods']
