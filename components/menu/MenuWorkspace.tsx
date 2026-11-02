'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, LayoutGrid, List, Pencil, Plus, Search, SlidersHorizontal, Tag, X } from 'lucide-react'
import type { CatalogProduct } from '@/lib/api/types'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import FoodVisual from '@/components/ui/FoodVisual'
import EmptyState from '@/components/ui/EmptyState'

export default function MenuWorkspace({products,categories,currency,preview=false}: {products: CatalogProduct[];categories:{id:number;name:string}[];currency:CurrencyConfig;preview?:boolean}) {
  const router=useRouter()
  const [items,setItems]=useState(products)
  const [category,setCategory]=useState<number|null>(null)
  const [search,setSearch]=useState('')
  const [view,setView]=useState<'grid'|'list'>('grid')
  const [availability,setAvailability]=useState('all')
  const [busy,setBusy]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [selected,setSelected]=useState<CatalogProduct|null>(null)
  const dialog=useRef<HTMLDialogElement>(null)
  const available=(p:CatalogProduct)=>p.is_available&&!p.is_86d
  const filtered=items.filter(p=>(category===null||p.category_id===category)&&`${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())&&(availability==='all'||available(p)===(availability==='available')))
  async function toggle(p:CatalogProduct){
    setBusy(p.id);setError('')
    try{
      if(!preview){const res=await fetch(`/api/products/${p.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_86d:!p.is_86d})});if(!res.ok){const data=await res.json();throw new Error(data.error||'Unable to update availability.')}}
      setItems(old=>old.map(i=>i.id===p.id?{...i,is_86d:!p.is_86d}:i));if(!preview)router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'Unable to update availability.')}finally{setBusy(null)}
  }
  const edit=(p:CatalogProduct)=>{setSelected(p);dialog.current?.showModal()}
  return <div className="animate-in menu-workspace"><div className="workspace-title"><div><span className="eyebrow">Made to be memorable</span><h1>Your menu, thoughtfully managed.</h1><p>{items.length} dishes and drinks. A little something for every guest.</p></div><div className="workspace-title-actions">{!preview&&<Link href="/admin/menu/categories" className="btn btn-secondary"><Tag size={14}/>Categories</Link>}{preview?<button className="btn btn-primary" onClick={()=>{setSelected(null);dialog.current?.showModal()}}><Plus size={15}/>Add menu item</button>:<Link id="add-product-btn" className="btn btn-primary" href="/admin/menu/new"><Plus size={15}/>Add menu item</Link>}</div></div>
  <div className="menu-summary"><span><strong>{items.length}</strong> Total items</span><span><i style={{background:'var(--success)'}}/><strong>{items.filter(available).length}</strong> Available</span><span><i style={{background:'var(--warning)'}}/><strong>{items.filter(p=>!available(p)).length}</strong> Unavailable</span><span><strong>{categories.length}</strong> Categories</span></div>
  {error&&<div className="alert" role="alert">{error}</div>}
  <div className="filter-toolbar"><label className="search-field"><Search size={16}/><input aria-label="Search menu items" type="search" placeholder="Search your menu…" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="row"><label className="availability-filter"><SlidersHorizontal size={13}/><select aria-label="Availability" value={availability} onChange={e=>setAvailability(e.target.value)}><option value="all">All availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label><div className="view-switch"><button aria-label="Grid view" aria-pressed={view==='grid'} className={view==='grid'?'active':''} onClick={()=>setView('grid')}><LayoutGrid size={15}/></button><button aria-label="List view" aria-pressed={view==='list'} className={view==='list'?'active':''} onClick={()=>setView('list')}><List size={15}/></button></div></div></div>
  <div className="filter-tabs" style={{marginBottom:22}}><button className={`filter-tab ${category===null?'active':''}`} onClick={()=>setCategory(null)}>All items<span>{items.length}</span></button>{categories.map(c=><button key={c.id} className={`filter-tab ${category===c.id?'active':''}`} onClick={()=>setCategory(c.id)}>{c.name}<span>{items.filter(p=>p.category_id===c.id).length}</span></button>)}</div>
  <div className="row space-between" style={{marginBottom:14}}><span className="section-label" style={{margin:0}}>{category===null?'The full collection':categories.find(c=>c.id===category)?.name}</span><span className="count-note">Showing {filtered.length} items</span></div>
  {filtered.length===0?<EmptyState title="No dishes found" description="Try a different category, availability or search." action={<button className="btn btn-secondary" onClick={()=>{setSearch('');setCategory(null);setAvailability('all')}}>Clear filters</button>}/>:view==='grid'?<div className="menu-grid">{filtered.map(p=><article className="menu-card" key={p.id}><div className="menu-card-image"><FoodVisual name={p.name} image={p.image_url}/><span className={`badge ${available(p)?'badge-green':'badge-gray'}`}>{available(p)?'Available':p.is_86d?'Sold out':'Unavailable'}</span></div><div className="menu-card-body"><div className="menu-card-title"><h3>{p.name}</h3></div><p>{p.description||'A fresh addition to your menu.'}</p><div className="menu-card-meta"><Tag size={11}/>{categories.find(c=>c.id===p.category_id)?.name||'Uncategorised'}<span>·</span>{p.tax_rate}% tax</div></div><div className="menu-card-footer"><strong>{formatCurrency(p.base_price,currency)}</strong><div className="row" style={{gap:6}}><button className="btn btn-secondary btn-sm" disabled={busy===p.id} onClick={()=>toggle(p)} aria-label={`${p.is_86d?'Restore':'Mark sold out'} ${p.name}`}>{busy===p.id?'Saving…':p.is_86d?<><Check size={11}/>Restore</>:'Mark sold out'}</button>{preview?<button className="icon-button" aria-label={`Edit ${p.name}`} onClick={()=>edit(p)}><Pencil size={12}/></button>:<Link className="icon-button" aria-label={`Edit ${p.name}`} href={`/admin/menu/${p.id}/edit`}><Pencil size={12}/></Link>}</div></div></article>)}</div>:<div className="surface-card"><table className="data-table"><thead><tr><th>Menu item</th><th>Category</th><th>Price</th><th>Availability</th><th>Action</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td style={{fontWeight:600}}>{p.name}</td><td>{categories.find(c=>c.id===p.category_id)?.name||'Uncategorised'}</td><td>{formatCurrency(p.base_price,currency)}</td><td><span className={`badge ${available(p)?'badge-green':'badge-gray'}`}>{available(p)?'Available':'Unavailable'}</span></td><td>{preview?<button className="btn btn-secondary btn-sm" onClick={()=>edit(p)}>View details</button>:<Link className="btn btn-secondary btn-sm" href={`/admin/menu/${p.id}/edit`}>Edit item</Link>}</td></tr>)}</tbody></table></div>}
  <dialog className="pos-modal" ref={dialog}><div className="row space-between"><span className="eyebrow" style={{margin:0}}>Design preview</span><button className="icon-button" aria-label="Close item details" onClick={()=>dialog.current?.close()}><X size={16}/></button></div><h2>{selected?.name||'Make something delicious.'}</h2><p>{selected?.description||'Use the signed-in menu workspace to create a new dish, set its price and upload a photo.'}</p>{selected&&<><FoodVisual name={selected.name} image={selected.image_url}/><div className="row space-between" style={{marginTop:20}}><span>Base price</span><strong>{formatCurrency(selected.base_price,currency)}</strong></div></>}<div className="notice" style={{marginTop:20,marginBottom:0}}>Sample data only. Sign in to manage your restaurant menu.</div></dialog>
  </div>
}
