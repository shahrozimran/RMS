import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomInt } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import type { RBACUser, Permissions } from './rbac'

function secret() {
  const value = process.env.JWT_SECRET
  if (!value || Buffer.byteLength(value) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes')
  return value
}
export interface StaffTokenPayload {
  userId: string
  username: string
  name: string
  role: string
  permissions: Permissions
  sessionVersion: number
}
export async function authenticateStaff(username: string, password: string): Promise<{ token: string; user: StaffTokenPayload }> {
  const db = await createAdminClient()
  const { data: user } = await db.from('users')
    .select('id,name,username,password_hash,status,locked_until,auth_user_id,session_version,role:roles(name,permissions)')
    .eq('username', username).single()
  // Fixed bcrypt work for unknown names; this is not an account credential.
  const valid = await bcrypt.compare(password, user?.password_hash || '$2b$12$V.ORC6QnwMQsv6mLMABPR.VO76jzx88UTCWGz/DRjwCXzqHfXZqUO')
  if (!user || user.auth_user_id || !user.password_hash) throw new Error('Invalid username or password')
  const { data: version, error } = await db.rpc('record_staff_login', {
    p_user_id: user.id, p_success: valid, p_expected_hash: user.password_hash,
  })
  const role = Array.isArray(user.role) ? user.role[0] : user.role
  if (error || !valid || version === null || !role) throw new Error('Invalid username or password')
  const payload: StaffTokenPayload = { userId: user.id, username: user.username, name: user.name,
    role: role.name, permissions: role.permissions as Permissions, sessionVersion: version }
  return { token: jwt.sign(payload, secret(), { expiresIn: '8h', algorithm: 'HS256', issuer: 'rms', audience: 'rms-staff' }), user: payload }
}
export async function verifyStaffToken(token: string): Promise<StaffTokenPayload> {
  const payload = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: 'rms', audience: 'rms-staff' })
  if (typeof payload === 'string' || typeof payload.userId !== 'string' || !Number.isSafeInteger(payload.sessionVersion)) throw new Error('Invalid or expired session')
  return payload as unknown as StaffTokenPayload
}
export function hashPassword(password: string) { return bcrypt.hash(password, 12) }
export function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join('')
}
export function staffPayloadToRBACUser(payload: StaffTokenPayload): RBACUser {
  return { id: payload.userId, role: payload.role, permissions: payload.permissions }
}
