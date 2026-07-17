import { createAdminClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import ProductForm from '../ProductForm'

export const metadata: Metadata = { title: 'Add Menu Item' }

export default async function NewProductPage() {
  const supabase = await createAdminClient()

  // Fetch categories to populate selection options
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .order('sort_order')

  const categoryList = categories ?? []

  return (
    <div className="animate-in">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <Link 
          href="/admin/menu" 
          className="btn btn-secondary" 
          style={{ 
            textDecoration: 'none', 
            padding: '8px 12px', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            minHeight: 'unset' 
          }}
          title="Back to menu management"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Add Menu Item</h1>
          <p>Add a new dish, drink, or product to your restaurant menu.</p>
        </div>
      </div>

      <ProductForm categories={categoryList} />
    </div>
  )
}
