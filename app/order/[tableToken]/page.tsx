'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Clock3, CircleAlert, UtensilsCrossed } from 'lucide-react'
import GuestOrdering from '@/components/customer/GuestOrdering'
import WorkspaceLoading from '@/components/ui/WorkspaceLoading'
import type { CatalogData } from '@/lib/api/types'
import { DEFAULT_CURRENCY } from '@/lib/utils/currency'
import { pollVisible } from '@/lib/utils/poll'
import type { OrderPayload } from '@/components/pos/PosWorkspace'

type GuestData={table:CatalogData['tables'][number];categories:CatalogData['categories'];products:CatalogData['products'];settings:{restaurant_name?:string;currency?:CatalogData['settings']['currency'];service_charge?:CatalogData['settings']['service_charge']}}
export default function CustomerOrderPage(){
 const {tableToken}=useParams<{tableToken:string}>()
 const [data,setData]=useState<GuestData|null>(null)
 const [error,setError]=useState('')
 const [retry,setRetry]=useState(0)
 const [pendingId,setPendingId]=useState<string|null>(null)
 const [status,setStatus]=useState<'pending'|'confirmed'|'rejected'>('pending')
 const [pollError,setPollError]=useState('')
 useEffect(()=>{let active=true;const controller=new AbortController();fetch(`/api/qr/${encodeURIComponent(tableToken)}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'Unable to load the menu.');return j as GuestData}).then(j=>{if(active)setData(j)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false;controller.abort()}},[tableToken,retry])
 useEffect(()=>{
  if(!pendingId||status!=='pending')return
  let active=true
  const stop=pollVisible(async()=>{try{const r=await fetch(`/api/qr/${encodeURIComponent(tableToken)}/order?pendingId=${encodeURIComponent(pendingId)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Unable to check order status.');if(active){setPollError('');if(j.data?.status==='confirmed'||j.data?.status==='rejected')setStatus(j.data.status)}}catch{if(active)setPollError('We are reconnecting to check your order. Please keep this page open.')}},5000)
  return()=>{active=false;stop()}
 },[pendingId,status,tableToken])
 async function submit(payload:OrderPayload){
  const r=await fetch(`/api/qr/${encodeURIComponent(tableToken)}/order`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer_name:payload.customer_name,items:payload.items})})
  const j=await r.json();if(!r.ok)throw new Error(j.error||'Unable to place your order.');setStatus('pending');setPendingId(j.data.id)
 }
 if(!data)return <div className="customer-page"><WorkspaceLoading error={error} onRetry={()=>{setError('');setRetry(n=>n+1)}}/></div>
 if(pendingId){const Icon=status==='confirmed'?CheckCircle2:status==='rejected'?CircleAlert:Clock3;return <main className="guest-status"><div className="guest-status-card"><span className={`guest-status-icon ${status}`}><Icon size={34}/></span><span className="eyebrow">{data.settings.restaurant_name||'Your restaurant'}</span><h1>{status==='confirmed'?"You're all set.":status==='rejected'?'Let us help you.':'Your order is with our team.'}</h1><p>{status==='confirmed'?'Your order is confirmed. Sit back, enjoy the company and leave the rest to us.':status==='rejected'?'Our team could not accept this order. Please speak to a team member before trying again.':'We will confirm your order shortly. Thanks for letting us cook for you.'}</p><span className={`badge ${status==='confirmed'?'badge-green':status==='rejected'?'badge-red':'badge-orange'}`}>{status==='pending'?'Awaiting confirmation':status==='confirmed'?'Order confirmed':'Please speak to our team'}</span>{pollError&&<p role="status">{pollError}</p>}<div className="guest-status-table"><UtensilsCrossed size={15}/>Table {data.table.table_number}<span>#{pendingId.slice(0,6).toUpperCase()}</span></div>{status!=='pending'&&<button className="btn btn-primary" onClick={()=>setPendingId(null)}>Back to the menu</button>}</div></main>}
 const catalog:CatalogData={categories:data.categories,products:data.products.map(p=>({...p,modifiers:[],is_available:true,is_86d:false})),tables:[data.table],settings:{currency:data.settings.currency||DEFAULT_CURRENCY,service_charge:data.settings.service_charge||{type:'percentage',value:0}}}
 return <GuestOrdering catalog={catalog} restaurantName={data.settings.restaurant_name||'Our restaurant'} tableId={data.table.id} onSubmit={submit}/>
}
