import { NextResponse } from 'next/server'
import { PermissionError } from '@/lib/auth/rbac'

export class ApiError extends Error {
  constructor(message: string, public status = 400, public retryAfter = 60) { super(message) }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError || error instanceof PermissionError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: error.status === 429 ? { 'Retry-After': String(error instanceof ApiError ? error.retryAfter : 60) } : undefined })
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const db = error as { code?: string; message?: string }
  const statuses: Record<string, number> = { '42501': 403, P0002: 404, '22023': 400, '22P02': 400, '22003': 400, '23505': 409, '23514': 400, '40001': 409, '40P01': 409, '55P03': 409 }
  if (db?.code && statuses[db.code]) return NextResponse.json({ error: db.message || 'Request rejected' }, { status: statuses[db.code] })
  console.error('API operation failed', error)
  return NextResponse.json({ error: 'Unable to complete the request' }, { status: 500 })
}

export function pagination(params: URLSearchParams, defaultLimit = 20) {
  const page = Number(params.get('page') ?? 1)
  const limit = Number(params.get('limit') ?? defaultLimit)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ApiError('Invalid pagination (limit must be 1–200)')
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 }
}
