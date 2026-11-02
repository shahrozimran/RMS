import { createAuthorizedAdminClient as createAdminClient } from '@/lib/auth/admin'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ProductForm from '../../ProductForm'

export const metadata: Metadata = { title: 'Edit Menu Item' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  const supabase = await createAdminClient()
  const resolvedParams = await params

  // Parallel fetch: specific product details and categories list
  const [
    { data: product },
    { data: categories }
  ] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('id', resolvedParams.id)
      .single(),
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order')
  ])

  if (!product) {
    notFound()
  }

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
          <h1>Edit Menu Item</h1>
          <p>Modify the specifications, category, pricing, or availability for this item.</p>
        </div>
      </div>

      <ProductForm categories={categoryList} initialProduct={product} />
    </div>
  )
}
