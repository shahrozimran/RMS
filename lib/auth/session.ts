import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyStaffToken, type StaffTokenPayload } from '@/lib/auth/staff-auth'
import type { RBACUser, Permissions } from '@/lib/auth/rbac'

export type SessionUser = RBACUser & {
  name: string
  username: string
  email?: string
  authType: 'admin' | 'staff'
}

/**
 * Unified session getter — works for both Admin (Supabase Auth) and Staff (JWT).
 * Returns null if no valid session is found.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()

  // Try Staff JWT first
  const staffToken = cookieStore.get('rms_staff_token')?.value
  if (staffToken) {
    try {
      const payload: StaffTokenPayload = await verifyStaffToken(staffToken)
      return {
        id: payload.userId,
        name: payload.name,
        username: payload.username,
        role: payload.role,
        permissions: payload.permissions as Permissions,
        authType: 'staff',
      }
    } catch {
      // Invalid staff token — fall through to check Admin
    }
  }

  // Try Supabase Admin session
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (authUser) {
      // Fetch the user record + role from DB
      const { data: dbUser } = await supabase
        .from('users')
        .select('id, name, username, email, role:roles(name, permissions)')
        .eq('auth_user_id', authUser.id)
        .single()

      if (dbUser) {
        const roleData = Array.isArray(dbUser.role) ? dbUser.role[0] : dbUser.role as any
        return {
          id: dbUser.id,
          name: dbUser.name,
          username: dbUser.username,
          email: dbUser.email ?? authUser.email,
          role: roleData?.name ?? 'Admin',
          permissions: (roleData?.permissions ?? {}) as Permissions,
          authType: 'admin',
        }
      }
    }
  } catch {
    // No Supabase session
  }

  return null
}

/**
 * Require authentication — throws redirect-like error if not logged in.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw new Error('UNAUTHENTICATED')
  }
  return session
}

/**
 * Require specific role(s) — returns session or throws.
 */
export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const session = await requireAuth()
  if (!roles.includes(session.role)) {
    throw new Error('FORBIDDEN')
  }
  return session
}
