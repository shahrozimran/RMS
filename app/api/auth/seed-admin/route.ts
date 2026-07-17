import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const DEMO_EMAIL    = 'admin@demo.com'
const DEMO_PASSWORD = 'password123'
const DEMO_USERNAME = 'admin_demo'
const DEMO_NAME     = 'Demo Admin'

export async function GET() {
  try {
    const supabase = await createAdminClient()

    // ── 1. Check if the DB users row already exists ─────────────────────────
    const { data: existingDbUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', DEMO_USERNAME)
      .maybeSingle()

    if (existingDbUser) {
      return NextResponse.json({ success: true, message: 'Demo admin already exists.' })
    }

    // ── 2. Resolve or create the Supabase Auth user ──────────────────────────
    let authUserId: string | undefined

    // Try creating first
    const { data: newAuthUser, error: createError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    })

    if (!createError) {
      authUserId = newAuthUser.user?.id
    } else {
      // If already exists in auth, find them by email
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      const match = listData?.users?.find(u => u.email === DEMO_EMAIL)
      if (match) {
        authUserId = match.id
      } else {
        throw createError
      }
    }

    if (!authUserId) throw new Error('Could not resolve auth user ID.')

    // ── 3. Get Admin role id ──────────────────────────────────────────────────
    const { data: adminRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'Admin')
      .maybeSingle()

    const roleId = adminRole?.id ?? 1

    // ── 4. Plain INSERT (no upsert — we already checked existence above) ──────
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .insert({
        auth_user_id: authUserId,
        name:         DEMO_NAME,
        username:     DEMO_USERNAME,
        email:        DEMO_EMAIL,
        role_id:      roleId,
        status:       'active',
      })
      .select('id')
      .single()

    if (dbError) throw dbError

    return NextResponse.json({
      success: true,
      message: 'Demo admin created successfully.',
      userId: dbUser.id,
    })
  } catch (error: any) {
    console.error('[seed-admin]', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
