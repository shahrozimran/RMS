'use client'
import { TableProperties, UtensilsCrossed } from 'lucide-react'
import PosWorkspace, { type OrderPayload } from '@/components/pos/PosWorkspace'
import type { CatalogData } from '@/lib/api/types'
export default function GuestOrdering({catalog,restaurantName,tableId,onSubmit}:{catalog:CatalogData;restaurantName:string;tableId:number;onSubmit:(payload:OrderPayload)=>Promise<void>}){
 const table=catalog.tables.find(t=>t.id===tableId)
 return <div className="customer-page"><header className="customer-header"><div className="brand"><span className="brand-symbol"><UtensilsCrossed size={21}/></span><div className="brand-wordmark">{restaurantName}<span>A seat at our table</span></div></div><span className="badge badge-green row"><TableProperties size={13}/>Table {table?.table_number||tableId}</span></header><section className="customer-hero"><span className="eyebrow">Fresh from our kitchen</span><h1>Good food.<br/>Great company.</h1><p>Find your next favourite. We will take care of the rest.</p></section><PosWorkspace catalog={catalog} customer fixedTable={tableId} restaurantName={restaurantName} onSubmit={onSubmit}/><footer className="guest-footer">Made with care. Served with a smile.</footer></div>
}
