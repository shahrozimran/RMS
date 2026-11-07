import { readJson } from '@/lib/api/body'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateStaff } from '@/lib/auth/staff-auth'
import { staffLoginSchema } from '@/lib/utils/validation'
import { createAdminClient } from '@/lib/supabase/server'
import { publicClientIp, rateLimit, rateLimitIdentity } from '@/lib/api/rate-limit'
import { ApiError, apiError } from '@/lib/api/errors'
import { authCookieOptions, staffCookieName } from '@/lib/auth/cookies'

export async function POST(request: NextRequest) {
  try {
    const ip = publicClientIp(request)
    if (ip) await rateLimit('staff-login:ip:' + rateLimitIdentity(ip), 60, 600)
    const body = await readJson(request)
    const parsed = staffLoginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { username, password } = parsed.data
    if (!ip) await rateLimit('staff-login:account:' + rateLimitIdentity(username.toLowerCase()), 20, 600)
    const { token, user } = await authenticateStaff(username, password)

    // Log the login activity
    const supabase = await createAdminClient()
    await supabase.from('activity_logs').insert({
      user_id:     user.userId,
      action:      'STAFF_LOGIN',
      entity_type: 'user',
      entity_id:   user.userId,
      details:     { username: user.username, role: user.role },
      ip_address:  ip,
    })

    const response = NextResponse.json({
      success: true,
      user: {
        id:          user.userId,
        name:        user.name,
        username:    user.username,
        role:        user.role,
        permissions: user.permissions,
      },
    })

    // Set HttpOnly cookie — expires in 8h
    response.cookies.set(staffCookieName, token, {
      ...authCookieOptions,
      httpOnly: true,
      maxAge: 60 * 60 * 8,
    })
    if (authCookieOptions.secure) response.cookies.set('rms_staff_token', '', { ...authCookieOptions, httpOnly: true, maxAge: 0 })

    return response
  } catch (error) {
    if (error instanceof ApiError || error instanceof SyntaxError) return apiError(error)
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }
}
