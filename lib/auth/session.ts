import { cache } from 'react'
import { cookies } from 'next/headers'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyStaffToken } from '@/lib/auth/staff-auth'
import type { RBACUser, Permissions } from '@/lib/auth/rbac'

export type SessionUser = RBACUser & { name: string; username: string; email?: string; authType: 'admin' | 'staff' }

// React cache is request-scoped. Never cache authorization across requests.
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get('rms_staff_token')?.value
  const db = await createAdminClient()
  if (token) {
    try {
      const payload = await verifyStaffToken(token)
      const { data: user, error } = await db.from('users')
        .select('id,name,username,email,status,session_version,auth_user_id,role:roles(name,permissions)')
        .eq('id', payload.userId).single()
      const role = Array.isArray(user?.role) ? user.role[0] : user?.role
      if (error || !user || user.auth_user_id || user.status !== 'active' || !role || role.name === 'Admin' || user.session_version !== payload.sessionVersion) return null
      return { id: user.id, name: user.name, username: user.username, email: user.email ?? undefined,
        role: role.name, permissions: role.permissions as Permissions, authType: 'staff' }
    } catch { return null }
  }
  try {
    const auth = await createServerSupabaseClient()
    const { data: { user: identity }, error } = await auth.auth.getUser()
    if (error || !identity) return null
    const { data: user } = await db.from('users').select('id,name,username,email,status,role:roles(name,permissions)')
      .eq('auth_user_id', identity.id).single()
    const role = Array.isArray(user?.role) ? user.role[0] : user?.role
    if (!user || user.status !== 'active' || !role || role.name !== 'Admin') return null
    return { id: user.id, name: user.name, username: user.username, email: user.email ?? identity.email,
      role: role.name, permissions: role.permissions as Permissions, authType: 'admin' }
  } catch { return null }
})

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHENTICATED')
  return session
}
export async function requireRole(...roles: string[]) {
  const session = await requireAuth()
  if (!roles.includes(session.role)) throw new Error('FORBIDDEN')
  return session
}
