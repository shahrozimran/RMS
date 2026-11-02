// ============================================================
// RBAC — Permission System
// ============================================================

/** All resources in the system */
export const RESOURCES = [
  'menu',
  'staff',
  'orders',
  'reports',
  'settings',
  'inventory',
  'discounts',
] as const

export type Resource = typeof RESOURCES[number]

/** All actions per resource */
export const ACTIONS = ['read', 'write', 'delete', 'void', 'refund', 'export'] as const
export type Action = typeof ACTIONS[number]

export type Permissions = {
  [K in Resource]?: {
    [A in Action]?: boolean
  }
}

export interface RBACUser {
  id: string
  role: string
  permissions: Permissions
}

/**
 * Check if a user has a specific permission.
 * Admin role bypasses all checks.
 */
export function hasPermission(
  user: RBACUser | null | undefined,
  resource: Resource,
  action: Action
): boolean {
  if (!user) return false
  if (user.role === 'Admin') return true
  return user.permissions?.[resource]?.[action] === true
}

/**
 * Returns true if the user has at least one of the given roles.
 */
export function hasRole(user: RBACUser | null | undefined, ...roles: string[]): boolean {
  if (!user) return false
  return roles.includes(user.role)
}

/**
 * Server-side API route guard factory.
 * Throws a 403 response if the user lacks the required permission.
 */
export function requirePermission(user: RBACUser | null | undefined, resource: Resource, action: Action) {
  if (!user) throw new PermissionError('Unauthorized', 401)
  if (!hasPermission(user, resource, action)) {
    throw new PermissionError(`Permission denied: ${resource}.${action}`)
  }
}

export class PermissionError extends Error {
  constructor(message: string, public status = 403) {
    super(message)
    this.name = 'PermissionError'
  }
}
