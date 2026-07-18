import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

// ─── Input Validation Schemas ─────────────────────────────────
const cartItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1).max(100),
  variant_label: z.string().nullable().optional(),
  quantity: z.number().int().min(1).max(50),
  unit_price: z.number().min(0),
  tax_rate: z.number().min(0).max(100),
  notes: z.string().max(200).nullable().optional(),
})

const orderSubmitSchema = z.object({
  customer_name: z.string().min(1).max(50), // Must be non-empty, max 50 chars
  items: z.array(cartItemSchema).min(1).max(100),
})

/**
 * POST /api/qr/[tableToken]/order
 * Public endpoint — customer submits their cart.
 * Performs Zod schema checks, strips HTML to prevent XSS, and verifies item prices to block tampering.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableToken: string }> }
) {
  try {
    const { tableToken } = await params
    const body = await request.json()

    // 1. Zod validation
    const parsed = orderSubmitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input fields: ' + parsed.error.issues.map(i => i.message).join(', ') },
        { status: 400 }
      )
    }

    const { customer_name, items } = parsed.data

    // 2. Sanitize customer name to prevent XSS injection on POS dashboards
    const cleanName = customer_name
      .replace(/<[^>]*>/g, '') // Strip HTML tags
      .replace(/[^\w\s\-\u00C0-\u00FF]/gi, '') // Allow alphanumeric, spaces, dashes, accented chars
      .trim()

    if (!cleanName) {
      return NextResponse.json({ error: 'Invalid customer name provided' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    // 3. Verify Pricing Integrity against Database
    const productIds = items.map(i => i.product_id)
    const { data: dbProducts, error: dbError } = await supabase
      .from('products')
      .select('id, base_price, price_variants, tax_rate')
      .in('id', productIds)

    if (dbError || !dbProducts || dbProducts.length !== new Set(productIds).size) {
      return NextResponse.json({ error: 'Some items in your cart do not exist in our menu' }, { status: 400 })
    }

    // Check each cart item price
    for (const item of items) {
      const dbProd = dbProducts.find((p: any) => p.id === item.product_id)
      if (!dbProd) {
        return NextResponse.json({ error: 'Product verification failed' }, { status: 400 })
      }

      // Check tax rate integrity
      if (Number(dbProd.tax_rate) !== Number(item.tax_rate)) {
        return NextResponse.json({ error: 'Product configuration tax rate modified' }, { status: 400 })
      }

      // Verify price variants vs base price
      if (item.variant_label) {
        const variants: any[] = dbProd.price_variants || []
        const matchedVariant = variants.find((v: any) => v.label === item.variant_label)
        if (!matchedVariant) {
          return NextResponse.json({ error: `Invalid product variant: ${item.variant_label}` }, { status: 400 })
        }
        if (Number(matchedVariant.price) !== Number(item.unit_price)) {
          return NextResponse.json({ error: 'Variant price integrity check failed' }, { status: 400 })
        }
      } else {
        if (Number(dbProd.base_price) !== Number(item.unit_price)) {
          return NextResponse.json({ error: 'Base price integrity check failed' }, { status: 400 })
        }
      }
    }

    // 4. Validate Table Token
    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('id, table_number, status, qr_token')
      .eq('qr_token', tableToken)
      .single()

    if (tableError || !table) {
      return NextResponse.json({ error: 'Invalid QR code' }, { status: 404 })
    }

    // 5. Insert Pending Order with secure data
    const { data: pending, error: insertError } = await supabase
      .from('qr_pending_orders')
      .insert({
        table_id: table.id,
        table_token: tableToken,
        customer_name: cleanName,
        items,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ data: pending }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * GET /api/qr/[tableToken]/order?pendingId=xxx
 * Public endpoint — customer polls for their order status.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableToken: string }> }
) {
  try {
    const { tableToken } = await params
    const { searchParams } = new URL(request.url)
    const pendingId = searchParams.get('pendingId')

    if (!pendingId) {
      return NextResponse.json({ error: 'pendingId required' }, { status: 400 })
    }

    // Validate ID format to prevent injection attempts
    const parsedId = z.string().uuid().safeParse(pendingId)
    if (!parsedId.success) {
      return NextResponse.json({ error: 'Invalid pendingId' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data, error } = await supabase
      .from('qr_pending_orders')
      .select('id, status, confirmed_order_id, created_at')
      .eq('id', pendingId)
      .eq('table_token', tableToken)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
