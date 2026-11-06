'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ClipboardList, LayoutDashboard, LogOut, Plus, QrCode } from 'lucide-react'
import { pollVisible } from '@/lib/utils/poll'
import Brand from '@/components/ui/Brand'

export default function StaffTopBar({ user }: { user: { name: string; role: string } }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => pollVisible(async () => {
    try { const res = await fetch('/api/qr/pending?count=true', { cache: 'no-store' }); if (res.ok) setPendingCount((await res.json()).count || 0) } catch {}
  }), [])
  const logout = async () => {
    setLoggingOut(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (!res.ok) throw new Error('Unable to sign out')
      router.push('/login'); router.refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Sign out failed'); setLoggingOut(false) }
  }
  return <header className="staff-topbar topbar no-print">
    <Link href="/staff/dashboard" aria-label="RMS staff dashboard"><Brand /></Link>
    <nav className="staff-navigation" aria-label="Service navigation">
      <Link id="nav-dashboard" className={`staff-nav-link ${pathname === '/staff/dashboard' ? 'active' : ''}`} href="/staff/dashboard"><LayoutDashboard size={15} />Overview</Link>
      <Link id="nav-orders" className={`staff-nav-link ${pathname.startsWith('/staff/orders') && !pathname.endsWith('/new') ? 'active' : ''}`} href="/staff/orders"><ClipboardList size={15} />My orders</Link>
      <Link id="nav-qr-orders" className={`staff-nav-link ${pathname.startsWith('/staff/qr-orders') ? 'active' : ''}`} href="/staff/qr-orders"><QrCode size={15} />QR orders{pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}</Link>
      <Link id="nav-new-order" className="btn btn-primary btn-sm" href="/staff/orders/new"><Plus size={15} />New order</Link>
    </nav>
    <div className="staff-user">{error && <span role="alert" className="small">{error}</span>}<div><strong>{user.name}</strong><small>{user.role}</small></div><span className="user-avatar">{user.name.split(' ').map(n => n[0]).slice(0,2).join('')}</span><button id="staff-logout-btn" className="icon-button" aria-label="Sign out" onClick={logout} disabled={loggingOut}><LogOut size={15} /></button></div>
  </header>
}
