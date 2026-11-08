import { z } from 'zod'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { PermissionError } from '@/lib/auth/rbac'
import { readJson } from '@/lib/api/body'
import { ApiError, apiError } from '@/lib/api/errors'
import { ingredientUnits } from '@/lib/api/inventory-types'
import { createAdminClient } from '@/lib/supabase/server'

const quantity = z.number().min(0).max(9999999.999).refine(value => Number(value.toFixed(3)) === value)
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes('\0'))
const recipe = z.record(z.uuid(), quantity.refine(value => value > 0)).refine(value => Object.keys(value).length <= 40)
const change = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), name: text(120), unit: z.enum(ingredientUnits), count: quantity, threshold: quantity }).strict(),
  z.object({ action: z.literal('count'), id: z.uuid(), count: quantity, threshold: quantity,
    expectedAt: z.iso.datetime({ offset: true }).nullable(), note: text(200) }).strict(),
  z.object({ action: z.literal('recipe'), id: z.uuid(), lines: recipe, previous: z.record(z.uuid(), z.number()) }).strict(),
])

async function inventoryAdmin() {
  const actor = await getSession()
  if (!actor) throw new PermissionError('Sign in to open inventory.', 401)
  if (actor.authType !== 'admin' || actor.role !== 'Admin') throw new PermissionError('Only administrators can manage ingredients.')
  return actor
}

function inventoryError(error: unknown) {
  if (['PGRST202', '42883'].includes((error as { code?: string })?.code ?? '')) {
    return apiError(new ApiError('Ingredient inventory needs database migration 017.', 503))
  }
  return apiError(error)
}

export async function GET() {
  try {
    const actor = await inventoryAdmin()
    const db = await createAdminClient()
    const { data, error } = await db.rpc('inventory_workspace', { p_actor: actor.id })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return inventoryError(error) }
}

export async function POST(request: Request) {
  try {
    const actor = await inventoryAdmin()
    const input = change.safeParse(await readJson(request))
    if (!input.success) throw new ApiError('Check the names and amounts. Use up to three decimal places.')
    const value = input.data
    const db = await createAdminClient()
    const { error } = value.action === 'add' ? await db.rpc('add_raw_ingredient', {
      p_actor: actor.id, p_name: value.name, p_unit: value.unit, p_quantity: value.count, p_threshold: value.threshold,
    }) : value.action === 'count' ? await db.rpc('update_ingredient_stock', {
      p_actor: actor.id, p_id: value.id, p_count: value.count, p_threshold: value.threshold, p_expected_at: value.expectedAt, p_note: value.note,
    }) : await db.rpc('save_ingredient_recipe', {
      p_actor: actor.id, p_product: value.id, p_lines: value.lines, p_previous: value.previous,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) { return inventoryError(error) }
}
