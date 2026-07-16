import { NextRequest, NextResponse } from 'next/server'
import { authenticateStaff } from '@/lib/auth/staff-auth'
import { staffLoginSchema } from '@/lib/utils/validation'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = staffLoginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { username, password } = parsed.data
    const { token, user } = await authenticateStaff(username, password)

    // Log the login activity
    const supabase = await createAdminClient()
    await supabase.from('activity_logs').insert({
      user_id:     user.userId,
      action:      'STAFF_LOGIN',
      entity_type: 'user',
      entity_id:   user.userId,
      details:     { username: user.username, role: user.role },
      ip_address:  request.headers.get('x-forwarded-for') ?? 'unknown',
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
    response.cookies.set('rms_staff_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Authentication failed' }, { status: 401 })
  }
}
