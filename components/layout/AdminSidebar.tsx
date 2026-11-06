'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Activity, ArrowUpRight, BarChart3, Bot, ChevronDown, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, Store, TableProperties, Users, UtensilsCrossed, X, ClipboardList, Monitor } from 'lucide-react'
import Brand from '@/components/ui/Brand'

export const ADMIN_NAV = [
  { href: '/admin/dashboard', label: 'Overview', key: 'dashboard', Icon: LayoutDashboard },
  { href: '/admin/pos', label: 'Point of sale', key: 'pos', Icon: Monitor },
  { href: '/admin/orders', label: 'Orders', key: 'orders', Icon: ClipboardList, Monitor },
  { href: '/admin/menu', label: 'Menu management', key: 'menu', Icon: UtensilsCrossed },
  { href: '/admin/tables', label: 'Tables & floor', key: 'tables', Icon: TableProperties },
  { href: '/admin/staff', label: 'Team members', key: 'team', Icon: Users },
  { href: '/admin/reports', label: 'Sales reports', key: 'reports', Icon: BarChart3 },
  { href: '/admin/intelligence', label: 'Intelligence', key: 'intelligence', Icon: Bot },
  { href: '/admin/activity', label: 'Activity log', key: 'activity', Icon: Activity },
  { href: '/admin/settings', label: 'Settings', key: 'settings', Icon: Settings2 },
]
export default function AdminSidebar({ user, previewView }: { user: { name: string; role: string }; previewView?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState('')
  const logout = async () => {
    if (previewView) { router.push('/login'); return }
    setLoggingOut(true)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Unable to sign out. Please try again.')
      router.push('/login'); router.refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Sign out failed'); setLoggingOut(false) }
  }
  return <>
    <button className="sidebar-mobile-toggle no-print" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
    <button className={`sidebar-scrim ${open ? 'is-open' : ''}`} aria-label="Close navigation" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
    <aside className={`app-sidebar no-print ${open ? 'is-open' : ''}`} aria-label="Admin navigation">
      <Link href={previewView ? '/preview' : '/admin/dashboard'} className="sidebar-brand"><Brand light /></Link>
      <div className="sidebar-location"><Store size={17} /><span>Main restaurant<small>Management workspace</small></span><ChevronDown size={13} /></div>
      <nav aria-label="Restaurant management"><div className="nav-section-label">Restaurant</div>{ADMIN_NAV.map(({ href,label,key,Icon },index) => <div key={href}>{index === 5 && <div className="nav-section-label" style={{ marginTop:25 }}>Management</div>}<Link href={previewView ? `/preview?view=${key}` : href} className={`app-nav-link ${(previewView ? previewView === key : pathname.startsWith(href)) ? 'active' : ''}`} title={label} aria-current={(previewView ? previewView === key : pathname.startsWith(href)) ? 'page' : undefined} onClick={() => setOpen(false)}><Icon size={17} strokeWidth={1.7} /><span className="nav-label">{label}</span>{index === 0 && <ArrowUpRight size={12} />}</Link></div>)}</nav>
      <div className="sidebar-service-note"><strong className="row"><ShieldCheck size={15} /> Every detail, in order.</strong><p>A calmer workspace for a better service.</p>{previewView && <Link href="/preview?view=pos" className="row" style={{ fontSize:10,marginTop:12,color:'#b8d8c1' }}>Try the point of sale <ArrowUpRight size={12} /></Link>}</div>
      {error && <p role="alert" style={{ fontSize:10,color:'#e9aaa4',padding:8 }}>{error}</p>}
      <div className="sidebar-user"><span className="user-avatar">{user.name.split(' ').map(n => n[0]).slice(0,2).join('')}</span><div className="user-info"><strong>{user.name}</strong><small>{user.role}</small></div><button className="icon-button" aria-label="Sign out" title="Sign out" id="admin-logout-btn" onClick={logout} disabled={loggingOut}><LogOut size={16} /></button></div>
    </aside>
  </>
}
