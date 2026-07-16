import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createAdminClient } from '@/lib/supabase/server'
import type { RBACUser, Permissions } from '@/lib/auth/rbac'

const JWT_SECRET = process.env.JWT_SECRET!
const TOKEN_EXPIRY = '8h'

export interface StaffTokenPayload {
  userId: string
  username: string
  name: string
  role: string
  permissions: Permissions
}

/**
 * Authenticate staff by username + password.
 * Returns a signed JWT on success or throws on failure.
 */
export async function authenticateStaff(
  username: string,
  password: string
): Promise<{ token: string; user: StaffTokenPayload }> {
  const supabase = await createAdminClient()

  // Fetch user with their role permissions
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, username, password_hash, status, failed_login_attempts, locked_until, role:roles(name, permissions)')
    .eq('username', username)
    .single()

  if (error || !user) {
    throw new Error('Invalid username or password')
  }

  // Check account status
  if (user.status === 'deleted') {
    throw new Error('Account not found')
  }

  if (user.status === 'suspended') {
    throw new Error('Your account has been suspended. Contact the administrator.')
  }

  if (user.status === 'locked' && user.locked_until) {
    const lockExpiry = new Date(user.locked_until)
    if (lockExpiry > new Date()) {
      const minutesLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000)
      throw new Error(`Account locked. Try again in ${minutesLeft} minute(s).`)
    }
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash || '')
  if (!isValid) {
    // Increment failed attempts
    const newAttempts = (user.failed_login_attempts || 0) + 1
    const isLocked = newAttempts >= 5

    await supabase
      .from('users')
      .update({
        failed_login_attempts: newAttempts,
        status: isLocked ? 'locked' : user.status,
        locked_until: isLocked
          ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
          : null,
      })
      .eq('id', user.id)

    if (isLocked) {
      throw new Error('Too many failed attempts. Account locked for 15 minutes.')
    }

    throw new Error('Invalid username or password')
  }

  // Reset failed attempts on success
  await supabase
    .from('users')
    .update({ failed_login_attempts: 0, status: 'active', locked_until: null })
    .eq('id', user.id)

  const roleData = Array.isArray(user.role) ? user.role[0] : user.role as any
  const payload: StaffTokenPayload = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: roleData?.name ?? 'Waiter',
    permissions: (roleData?.permissions ?? {}) as Permissions,
  }

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY })

  return { token, user: payload }
}

/**
 * Verify a staff JWT token.
 */
export async function verifyStaffToken(token: string): Promise<StaffTokenPayload> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as StaffTokenPayload
    return payload
  } catch {
    throw new Error('Invalid or expired session')
  }
}

/**
 * Hash a plain-text password.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

/**
 * Generate a random secure password.
 */
export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

/**
 * Convert a StaffTokenPayload to an RBACUser.
 */
export function staffPayloadToRBACUser(payload: StaffTokenPayload): RBACUser {
  return {
    id: payload.userId,
    role: payload.role,
    permissions: payload.permissions,
  }
}
