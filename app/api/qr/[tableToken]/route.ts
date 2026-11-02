import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'
import { rateLimit, clientKey } from '@/lib/api/rate-limit'
import { z } from 'zod'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tableToken: string }> }) {
  try {
    const { tableToken } = await params
    if (!z.uuid().safeParse(tableToken).success) return NextResponse.json({ error: 'Invalid QR code' }, { status: 404 })
    await rateLimit('qr-menu:' + clientKey(request), 300, 60)
    const db = await createAdminClient()
    const { data, error } = await db.rpc('get_qr_menu', { p_token: tableToken })
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) { return apiError(error) }
}
