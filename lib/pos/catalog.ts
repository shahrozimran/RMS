import { cache } from 'react'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { createAdminClient } from '@/lib/supabase/server'
import type { CatalogData } from '@/lib/api/types'

// Request-scoped only: prices, availability and permissions stay fresh on navigation.
export const getPosCatalog = cache(async (): Promise<CatalogData> => {
  requirePermission(await getSession(), 'menu', 'read')
  const db = await createAdminClient()
  const { data, error } = await db.rpc('get_pos_catalog')
  if (error) throw error
  return data as CatalogData
})
