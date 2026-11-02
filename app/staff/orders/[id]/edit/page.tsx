'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { CatalogData, EditableOrder } from '@/lib/api/types'
import { apiGet } from '@/lib/api/client'
import PosWorkspace, { type OrderPayload } from '@/components/pos/PosWorkspace'
import WorkspaceLoading from '@/components/ui/WorkspaceLoading'

export default function StaffEditOrderPage() {
  const {id} = useParams<{id:string}>()
  const router = useRouter()
  const [data,setData] = useState<{id:string;catalog:CatalogData;order:EditableOrder} | null>(null)
  const [error,setError] = useState('')
  const [retry,setRetry] = useState(0)
  useEffect(() => {
    let active = true
    Promise.all([apiGet<CatalogData>('/api/catalog'),apiGet<{data:EditableOrder}>(`/api/orders/${id}`)])
      .then(([catalog,result]) => {if(active) setData({id,catalog,order:result.data})})
      .catch(error => {if(active) setError(error.message)})
    return () => {active=false}
  },[id,retry])
  const submit = async (payload: OrderPayload) => {
    const response = await fetch(`/api/orders/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to update order')
    router.push(`/staff/orders/${id}`);router.refresh()
  }
  if (!data || data.id !== id) return <WorkspaceLoading error={error} onRetry={() => {setError('');setRetry(r => r+1)}} />
  return <PosWorkspace key={id} catalog={data.catalog} initialOrder={data.order} onSubmit={submit} />
}
