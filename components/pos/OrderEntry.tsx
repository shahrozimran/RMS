import NewOrderPage from '@/components/pos/NewOrderPage'
import { getPosCatalog } from '@/lib/pos/catalog'
import type { CatalogData } from '@/lib/api/types'

export default async function OrderEntry({ admin = false }: { admin?: boolean }) {
  let catalog: CatalogData | undefined
  let error = ''
  try {
    catalog = await getPosCatalog()
  } catch {
    error = 'Unable to load the menu. Please retry.'
  }
  return <NewOrderPage admin={admin} initialCatalog={catalog} initialError={error} />
}
