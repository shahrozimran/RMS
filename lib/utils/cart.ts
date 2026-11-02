type Modifier = { id: number; name: string; price: number }
type CatalogProduct = { id: string; name: string; base_price: number; tax_rate: number;
  price_variants: { label: string; price: number }[] | null; modifiers?: Modifier[] }
type CartLine = { product_id: string; variant_label: string | null; unit_price: number; tax_rate: number; selected_modifiers: Modifier[] }

// Open-order edits quote the current catalog. Historical paid bills stay unchanged.
export function repriceCartLine<T extends CartLine>(line: T, products: CatalogProduct[]) {
  const product = products.find(p => p.id === line.product_id)
  if (!product) throw new Error('An item is no longer available; remove or replace it')
  const variants = product.price_variants || []
  const variant = variants.find(v => v.label === line.variant_label)
  if ((variants.length > 0 && !variant) || (line.variant_label && !variant)) throw new Error('A variant changed; remove or replace the item')
  const modifiers = line.selected_modifiers.map(m => {
    const current = product.modifiers?.find(candidate => candidate.id === m.id)
    if (!current) throw new Error('A modifier changed; remove or replace the item')
    return current
  })
  const cents = Math.round(Number(variant?.price ?? product.base_price) * 100) + modifiers.reduce((sum,m) => sum + Math.round(Number(m.price) * 100),0)
  return { ...line, product_name: product.name, unit_price: cents / 100, tax_rate: Number(product.tax_rate), selected_modifiers: modifiers }
}
