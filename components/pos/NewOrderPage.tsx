'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CatalogData } from '@/lib/api/types'
import { apiGet } from '@/lib/api/client'
import PosWorkspace, { type OrderPayload } from '@/components/pos/PosWorkspace'
import WorkspaceLoading from '@/components/ui/WorkspaceLoading'

export default function NewOrderPage({ admin = false, initialCatalog, initialError = '' }: { admin?: boolean; initialCatalog?: CatalogData; initialError?: string }) {
  const [catalog,setCatalog] = useState<CatalogData | null>(initialCatalog ?? null)
  const [error,setError] = useState(initialError)
  const [retry,setRetry] = useState(0)
  const confirmation = useRef<{ body: string; key: string } | null>(null)
  const router = useRouter()
  useEffect(() => {
    if (initialCatalog || (initialError && retry === 0)) return
    let active = true
    apiGet<CatalogData>('/api/catalog').then(data => {if(active) setCatalog(data)}).catch(error => {if(active) setError(error.message)})
    return () => {active=false}
  }, [retry, initialCatalog, initialError])
  const submit = async (payload: OrderPayload) => {
    const body = JSON.stringify(payload)
    if (confirmation.current?.body !== body) confirmation.current = { body, key: crypto.randomUUID() }
    const response = await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':confirmation.current.key},body})
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to create order')
    router.push(admin ? `/admin/orders/${result.data.id}` : `/staff/orders/${result.data.id}/kitchen-receipt`)
  }
  if (!catalog) return <WorkspaceLoading error={error} onRetry={() => {setError('');setRetry(r => r+1)}} />
  return <PosWorkspace catalog={catalog} onSubmit={submit} />
}
