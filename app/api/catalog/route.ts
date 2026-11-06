import { NextResponse } from 'next/server'
import { getPosCatalog } from '@/lib/pos/catalog'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    return NextResponse.json(await getPosCatalog())
  } catch (error) { return apiError(error) }
}
