'use client'

import { memo } from 'react'
import { Plus } from 'lucide-react'
import type { CatalogProduct } from '@/lib/api/types'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import FoodVisual from '@/components/ui/FoodVisual'

// Cart edits and customer typing should not repaint every menu card.
export default memo(function ProductGrid({ products, currency, onChoose }: {
  products: CatalogProduct[]
  currency: CurrencyConfig
  onChoose: (product: CatalogProduct, label?: string) => void
}) {
  const fmt = (value: number) => formatCurrency(value, currency)
  return <div className="pos-grid">{products.map(product => <article className="pos-product" key={product.id}>
    <button className="product-media-add" onClick={() => onChoose(product)} aria-label={`Add ${product.name}`}>
      <FoodVisual name={product.name} image={product.image_url} />
    </button>
    <div className="pos-product-body">
      <h3>{product.name}</h3><p>{product.description || 'Made fresh, just for you.'}</p>
      <div className="pos-product-action">
        <span>{product.price_variants?.length ? <><small>from </small>{fmt(Math.min(...product.price_variants.map(variant => Number(variant.price))))}</> : fmt(Number(product.base_price))}</span>
        <button onClick={() => onChoose(product)} aria-label={`Add ${product.name} to order`}><Plus size={15} /></button>
      </div>
      {!!product.price_variants?.length && <div className="pos-variants">{product.price_variants.map(variant => <button key={variant.label} onClick={() => onChoose(product, variant.label)}>{variant.label} · {fmt(variant.price)}</button>)}</div>}
    </div>
  </article>)}</div>
})
