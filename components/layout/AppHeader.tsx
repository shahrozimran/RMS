'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, ChevronRight, Command, Search, X } from 'lucide-react'
import { helpDeskHref, helpDeskPages, type HelpDeskPage } from '@/lib/agents/help-desk'
import AlertBell from './AlertBell'

const destinations = [
  { name: 'Dashboard', description: 'Your restaurant at a glance', href: '/admin/dashboard' },
  { name: 'Point of sale', description: 'Take a new order', href: '/admin/pos' },
  { name: 'Orders', description: 'Transactions and order history', href: '/admin/orders' },
  { name: 'Menu', description: 'Dishes, pricing and availability', href: '/admin/menu' },
  { name: 'Ingredients', description: 'Stock on hand, recipes and how many dishes you can make', href: '/admin/inventory' },
  { name: 'Team', description: 'People and permissions', href: '/admin/staff' },
  { name: 'Tables', description: 'Floor plan and QR codes', href: '/admin/tables' },
  { name: 'Reports', description: 'Sales and performance', href: '/admin/reports' },
  ...(Object.keys(helpDeskPages) as HelpDeskPage[]).map(page => ({ name: helpDeskPages[page].label,
    description: helpDeskPages[page].description, href: helpDeskHref(page), previewHref: helpDeskHref(page, true) })),
  { name: 'Activity', description: 'Your operational audit trail', href: '/admin/activity' },
  { name: 'Settings', description: 'Make the workspace yours', href: '/admin/settings' },
]

export default function AppHeader({ name, title, preview = false }: { name: string; title?: string; preview?: boolean }) {
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const current = title || destinations.find(d => pathname === d.href)?.name || destinations.find(d => pathname.startsWith(`${d.href}/`))?.name || 'Workspace'
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); dialog.current?.showModal() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return <>
    <header className="app-header no-print"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{current}</strong></div><div className="header-actions"><button aria-label="Jump to a page" className="search-trigger" onClick={() => dialog.current?.showModal()}><Search size={16} /><span>Jump to a page…</span><kbd><Command size={11} /> K</kbd></button><AlertBell href={helpDeskHref('alerts', preview)} preview={preview}/><span className="user-avatar" title={name}>{name.split(' ').map(n => n[0]).slice(0,2).join('')}</span></div></header>
    <dialog ref={dialog} aria-label="Navigate workspace" className="command-dialog" onClick={e => { if (e.target === dialog.current) dialog.current.close() }}><div className="command-search"><Search size={20} /><input aria-label="Find a page" placeholder="Where would you like to go?" value={search} onChange={e => setSearch(e.target.value)} /><button className="icon-button" aria-label="Close navigation" onClick={() => dialog.current?.close()}><X size={18} /></button></div><div className="command-results">{destinations.filter(d => (d.name + d.description).toLowerCase().includes(search.toLowerCase())).map(d => <Link key={d.href} href={preview ? ('previewHref' in d ? d.previewHref : `/preview?view=${d.href.split('/').at(-1) === 'staff' ? 'team' : d.href.split('/').at(-1)}`) : d.href} onClick={() => dialog.current?.close()}><span><strong>{d.name}</strong><small>{d.description}</small></span><ArrowUpRight size={18} /></Link>)}</div><div className="command-hint">Navigate your restaurant workspace <kbd>esc</kbd></div></dialog>
  </>
}
