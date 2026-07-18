import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/qr/[tableToken]
 * Public endpoint — no auth required.
 * Returns table info + full menu (categories + products).
 * Called on every QR scan to load the customer ordering page data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableToken: string }> }
) {
  try {
    const { tableToken } = await params
    const supabase = await createAdminClient()

    // 1. Validate table token and get table info
    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('id, table_number, section, capacity, status, qr_token')
      .eq('qr_token', tableToken)
      .single()

    if (tableError || !table) {
      return NextResponse.json(
        { error: 'Invalid QR code. This table does not exist.' },
        { status: 404 }
      )
    }

    // 2. Get restaurant name from settings
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['restaurant_name', 'currency', 'service_charge'])

    const settings: Record<string, any> = {}
    settingsData?.forEach(s => { settings[s.key] = s.value })

    // 3. Fetch full menu
    const [categoriesRes, productsRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, description, sort_order')
        .order('sort_order', { ascending: true }),
      supabase
        .from('products')
        .select('id, name, description, base_price, price_variants, tax_rate, image_url, category_id')
        .eq('is_available', true)
        .eq('is_86d', false)
        .order('name', { ascending: true })
    ])

    if (categoriesRes.error) throw categoriesRes.error
    if (productsRes.error) throw productsRes.error

    return NextResponse.json({
      table: {
        id: table.id,
        table_number: table.table_number,
        section: table.section,
        capacity: table.capacity,
        status: table.status,
      },
      categories: categoriesRes.data || [],
      products: productsRes.data || [],
      settings: {
        restaurant_name: (settings.restaurant_name as any)?.name || 'Our Restaurant',
        currency: settings.currency || { code: 'USD', symbol: '$', locale: 'en-US' },
        service_charge: settings.service_charge || { type: 'percentage', value: 0 },
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
