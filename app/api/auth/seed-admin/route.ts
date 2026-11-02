import { NextResponse } from 'next/server'

// Provision administrators through the operator CLI, never a public request.
export function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
