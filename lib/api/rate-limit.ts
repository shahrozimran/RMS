import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { ApiError } from './errors'

// Only enable this when the ingress overwrites forwarding headers.
export function clientKey(request: Request) {
  const ip = process.env.TRUST_PROXY_HEADERS === 'true'
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    : 'shared'
  return createHash('sha256').update(ip).digest('hex')
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const db = await createAdminClient()
  const { data, error } = await db.rpc('consume_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: seconds })
  if (error) throw error
  if (!data) throw new ApiError('Too many requests; try again later', 429, seconds)
}
