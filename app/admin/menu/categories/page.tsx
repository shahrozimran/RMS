'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '@/lib/api/client'

type Category = { id: number; name: string; description: string | null }
export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { let active = true; apiGet<{data: Category[]}>('/api/categories').then(r => { if (active) setCategories(r.data) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [])
  const add = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const response = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), sort_order: categories.length }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setCategories(current => [...current,result.data]); setName('')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save') }
    finally { setSaving(false) }
  }
  return <div><Link href="/admin/menu">Back to menu</Link><div className="page-header"><h1>Categories</h1></div>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={add} style={{display:'flex',gap:12,marginBottom:24}}><input className="input" aria-label="Category name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required /><button className="btn btn-primary" disabled={saving}>Add category</button></form>
    <ul>{categories.map(c=><li key={c.id}>{c.name}</li>)}</ul></div>
}
