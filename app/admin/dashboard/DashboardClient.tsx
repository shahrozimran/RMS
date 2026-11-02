'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowUpRight, CalendarDays, ClipboardList, DollarSign, Flame, Plus, TableProperties, Users, UtensilsCrossed } from 'lucide-react'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import EmptyState from '@/components/ui/EmptyState'

export type DashboardOrder = { id: string; status: string; order_type: string; total: number; created_at: string; staff: {name: string} | null; table: {table_number: string} | null }
export interface DashboardProps {
  todayRevenue: number; todayOrderCount: number; activeOrderCount: number; staffOnlineCount: number;
  topItems: { product_name: string; qty_sold: number }[]; recentOrders: DashboardOrder[]; activeOrders: DashboardOrder[];
  currency: CurrencyConfig; preview?: boolean
}
const badge = (status: string) => status === 'paid' ? 'badge-green' : status === 'active' ? 'badge-orange' : status === 'billed' ? 'badge-blue' : 'badge-gray'
export default function AdminDashboardClient({todayRevenue,todayOrderCount,staffOnlineCount,topItems,recentOrders,activeOrders,currency,preview=false}: DashboardProps) {
  const [liveOrders,setLiveOrders] = useState(activeOrders)
  useEffect(() => {
    if (preview) return
    const supabase = createClient()
    let active = true
    const channel = supabase.channel('admin-orders').on('postgres_changes',{event:'*',schema:'public',table:'orders'},() => {
      supabase.from('orders').select('id,status,order_type,total,created_at,staff:users!staff_id(name),table:tables(table_number)').in('status',['active','billed']).order('created_at',{ascending:false}).then(({data}) => { if(active && data) setLiveOrders(data as unknown as DashboardOrder[]) })
    }).subscribe()
    return () => { active=false; void supabase.removeChannel(channel) }
  },[preview])
  const fmt = (n: number) => formatCurrency(n,currency)
  const href = (path: string,view: string) => preview ? `/preview?view=${view}` : path
  const metrics = [
    {label:"Today's revenue",value:fmt(todayRevenue),foot:'Completed payments today',Icon:DollarSign},
    {label:"Today's orders",value:todayOrderCount,foot:'All order types combined',Icon:ClipboardList},
    {label:'Orders in service',value:liveOrders.length,foot:'Active and awaiting payment',Icon:Flame},
    {label:'Team accounts',value:staffOnlineCount,foot:'Your restaurant team',Icon:Users},
  ]
  return <div className="animate-in">
    <div className="workspace-title"><div><span className="eyebrow">Your restaurant, at a glance</span><h1>A little clarity. A better service.</h1><p>Everything you need to keep your day running smoothly.</p></div><div className="workspace-title-actions"><span className="date-pill"><CalendarDays size={14}/>{new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span><Link href={href('/admin/pos','pos')} className="btn btn-primary"><Plus size={15}/>New order</Link></div></div>
    <div className="metric-grid">{metrics.map(m => <div className="metric-card" key={m.label}><div className="metric-top"><span>{m.label}</span><span className="metric-icon"><m.Icon size={17}/></span></div><div className="metric-value num">{m.value}</div><div className="metric-foot">{m.foot}</div></div>)}</div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><div><h2>The crowd favourites</h2><p>Most ordered dishes · last 30 days</p></div><span className="badge badge-green">By quantity</span></div><div className="chart-body">{topItems.length ? <ResponsiveContainer width="100%" height={250}><BarChart layout="vertical" data={topItems.slice(0,6)} margin={{top:10,right:22,left:0,bottom:0}}><CartesianGrid horizontal={false} stroke="#edf1ee" strokeDasharray="4 4"/><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:'#9aa69e',fontSize:9}}/><YAxis type="category" dataKey="product_name" width={125} axisLine={false} tickLine={false} tick={{fill:'#849087',fontSize:10}} interval={0} tickFormatter={v => String(v).length>19 ? String(v).slice(0,17)+'…' : String(v)}/><Tooltip cursor={{fill:'#f2f6f3'}} contentStyle={{border:'1px solid #e3e9e5',borderRadius:10,fontSize:12}}/><Bar dataKey="qty_sold" name="Items sold" fill="#4c9169" radius={[0,4,4,0]} maxBarSize={20}/></BarChart></ResponsiveContainer> : <EmptyState title="Your favourites will appear here" description="Completed sales will help you see what your guests love."/>}</div></section>
      <section className="panel"><div className="panel-heading"><div><h2>How your guests order</h2><p>Based on {recentOrders.length} recent orders</p></div><UtensilsCrossed size={17} className="muted"/></div><div className="order-mix">{[{type:'dine_in',label:'Dine in',color:'#4c9169'},{type:'takeaway',label:'Takeaway',color:'#b6c8a6'},{type:'delivery',label:'Delivery',color:'#deb57a'}].map(t => {const count=recentOrders.filter(o => o.order_type===t.type).length;const percent=recentOrders.length ? Number((count/recentOrders.length*100).toFixed(1)) : 0;return <div key={t.type}><div className="mix-line"><span className="status-dot" style={{color:t.color}}/>{t.label}<strong>{percent}% <span className="muted">· {count}</span></strong></div><div className="mix-bar"><span style={{width:`${percent}%`,background:t.color}}/></div></div>})}</div><div className="quick-actions"><Link className="quick-action" href={href('/admin/menu','menu')}><UtensilsCrossed size={19}/>Manage menu</Link><Link className="quick-action" href={href('/admin/tables','tables')}><TableProperties size={19}/>Table plan</Link><Link className="quick-action" href={href('/admin/staff','team')}><Users size={19}/>Your team</Link></div></section>
    </div>
    <div className="dashboard-grid dashboard-service-grid"><section className="panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>A closer look at your latest service</p></div><Link href={href('/admin/orders','orders')}>View all orders<ArrowUpRight size={13}/></Link></div><div style={{overflowX:'auto'}}><table className="data-table"><thead><tr><th>Order</th><th>Guest / table</th><th>Type</th><th>Status</th><th style={{textAlign:'right'}}>Amount</th></tr></thead><tbody>{recentOrders.slice(0,6).map((o) => <tr key={o.id}><td><Link href={href(`/admin/orders/${o.id}`,'orders')} style={{fontWeight:650}}>#{o.id.slice(0,6).toUpperCase()}</Link><div className="muted" style={{fontSize:9,marginTop:5}}>{new Date(o.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div></td><td>{o.table ? `Table ${o.table.table_number}` : 'Walk-in guest'}<div className="muted" style={{fontSize:9,marginTop:5}}>{o.staff?.name || 'Unassigned'}</div></td><td style={{textTransform:'capitalize'}}>{o.order_type.replace('_',' ')}</td><td><span className={`badge ${badge(o.status)}`}>{o.status}</span></td><td className="num" style={{textAlign:'right',fontWeight:650}}>{fmt(o.total)}</td></tr>)}</tbody></table>{!recentOrders.length && <EmptyState title="A fresh start" description="New orders will appear here as your team takes them."/>}</div></section>
    <section className="panel"><div className="panel-heading"><div><h2>On the floor</h2><p>Orders currently in service</p></div><span className="badge badge-green">{liveOrders.length} open</span></div>{liveOrders.length ? liveOrders.slice(0,6).map((o,i) => <Link className="live-order-row" key={o.id} href={href(`/admin/orders/${o.id}`,'orders')}><span className="order-number">{String(i+1).padStart(2,'0')}</span><div><strong>{o.table ? `Table ${o.table.table_number}` : o.order_type.replace('_',' ')}</strong><small>{o.staff?.name || 'Unassigned'} · {o.status === 'billed' ? 'Awaiting payment' : 'In service'}</small></div><span className="order-price num">{fmt(o.total)}</span><ArrowUpRight size={13} className="muted"/></Link>) : <EmptyState title="All caught up" description="Active orders will appear here during service."/>}</section></div>
  </div>
}
