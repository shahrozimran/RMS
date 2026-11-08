import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { createAdminClient } from '@/lib/supabase/server'
import { ApiError } from './errors'

export function trustedClientIp(request: Request) {
  // A client-supplied Vercel header cannot turn on trust outside the hosting platform.
  const header = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for'
    : process.env.TRUST_PROXY_HEADERS === 'true' ? 'x-forwarded-for' : null
  const ip = header ? request.headers.get(header)?.trim() : undefined
  // The trusted ingress must replace the header with one address, never append a list.
  if (!ip || ip.includes('%')) return null
  const version = isIP(ip)
  return version === 6 ? new URL(`http://[${ip}]`).hostname : version === 4 ? ip : null
}

export function rateLimitIdentity(identity: string) {
  return createHash('sha256').update(identity).digest('hex')
}

export function publicClientIp(request: Request) {
  const ip = trustedClientIp(request)
  if (!ip && process.env.NODE_ENV === 'production') {
    throw new ApiError('The service could not verify this connection. Try again shortly.', 503)
  }
  return ip
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const db = await createAdminClient()
  const { data, error } = await db.rpc('consume_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: seconds })
  if (error) throw error
  if (!data) throw new ApiError('Too many requests; try again later', 429, seconds)
}
