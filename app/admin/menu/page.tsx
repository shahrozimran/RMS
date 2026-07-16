import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Menu Management' }

export default async function AdminMenuPage() {
  const supabase = await createAdminClient()
  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*, category:categories(name)').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
  ])

  return (
    <div className="animate-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'28px' }}>
        <div>
          <h1 style={{ fontSize:'26px', fontWeight:800 }}>Menu Management</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'14px', marginTop:'4px' }}>{products?.length ?? 0} items across {categories?.length ?? 0} categories</p>
        </div>
        <div style={{ display:'flex', gap:'12px' }}>
          <Link href="/admin/menu/categories" className="btn btn-secondary" style={{ textDecoration:'none' }}>📁 Categories</Link>
          <Link id="add-product-btn" href="/admin/menu/new" className="btn btn-primary" style={{ textDecoration:'none' }}>+ Add Item</Link>
        </div>
      </div>

      {/* Products table */}
      <div className="surface-card" style={{ overflow:'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Base Price</th>
              <th>Tax Rate</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p: any) => (
              <tr key={p.id}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} style={{ width:40, height:40, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
                      : <div style={{ width:40, height:40, borderRadius:8, background:'var(--surface-4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>🍽</div>
                    }
                    <div>
                      <div style={{ fontWeight:600, color:'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize:'12px', color:'var(--text-muted)', maxWidth:'240px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.description}</div>
                    </div>
                  </div>
                </td>
                <td>{(p.category as any)?.name ?? '—'}</td>
                <td style={{ fontWeight:600, color:'var(--text-primary)' }}>${Number(p.base_price).toFixed(2)}</td>
                <td>{p.tax_rate > 0 ? <span className="badge badge-blue">{p.tax_rate}%</span> : <span style={{ color:'var(--text-muted)' }}>0%</span>}</td>
                <td>
                  {p.is_86d
                    ? <span className="badge badge-red">86'd</span>
                    : p.is_available
                      ? <span className="badge badge-green">Available</span>
                      : <span className="badge badge-gray">Unavailable</span>
                  }
                </td>
                <td>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <Link href={`/admin/menu/${p.id}/edit`} className="btn btn-secondary btn-sm" style={{ textDecoration:'none' }}>Edit</Link>
                    <QuickToggle id={p.id} field="is_86d" value={p.is_86d} label={p.is_86d ? 'Un-86' : '86 Today'} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(products?.length ?? 0) === 0 && (
          <div style={{ textAlign:'center', padding:'48px', color:'var(--text-muted)' }}>
            <div style={{ fontSize:'32px', marginBottom:'12px' }}>🍽</div>
            <p>No menu items yet. <Link href="/admin/menu/new" style={{ color:'var(--brand-400)' }}>Add the first one</Link>.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function QuickToggle({ id, field, value, label }: { id: string; field: string; value: boolean; label: string }) {
  return (
    <form action={`/api/products/${id}`} method="POST" style={{ display:'inline' }}>
      <input type="hidden" name="_method" value="PUT" />
      <input type="hidden" name={field} value={(!value).toString()} />
      <button type="submit" className="btn btn-ghost btn-sm">{label}</button>
    </form>
  )
}
