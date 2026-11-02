'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function QuickToggle({ id, value }: { id: string; value: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const toggle = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_86d: !value }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      router.refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Update failed') }
    finally { setBusy(false) }
  }
  return <span><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={toggle}>{value ? 'Un-86' : '86 Today'}</button>{error && <span role="alert">{error}</span>}</span>
}
