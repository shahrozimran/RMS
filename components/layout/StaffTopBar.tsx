'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StaffTopBarProps {
  user: { name: string; role: string }
}

export default function StaffTopBar({ user }: StaffTopBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const supabase = createClient()

  const fetchPendingCount = async () => {
    try {
      const res = await fetch('/api/qr/pending')
      if (res.ok) {
        const json = await res.json()
        setPendingCount(json.data?.length || 0)
      }
    } catch {}
  }

  useEffect(() => {
    fetchPendingCount()
    const channel = supabase
      .channel('topbar-qr-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_pending_orders' }, () => {
        fetchPendingCount()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const initials = user.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: '58px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      boxShadow: 'var(--shadow-xs)',
    }}>
      {/* Brand */}
      <Link href="/staff/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--charcoal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 014 4c0 1.5-.5 2.8-1.4 3.8L16 21H8l1.4-11.2A5.97 5.97 0 018 6a4 4 0 014-4z" />
            <path d="M6 21h12" />
          </svg>
        </div>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--charcoal)', letterSpacing: '-0.02em' }}>RMS Staff</span>
      </Link>

      {/* Nav Links */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Link
          href="/staff/dashboard"
          id="nav-dashboard"
          className="btn btn-ghost btn-sm"
          style={{
            textDecoration: 'none',
            color: pathname === '/staff/dashboard' ? 'var(--charcoal)' : 'var(--charcoal-mid)',
            background: pathname === '/staff/dashboard' ? 'var(--surface-hover)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
          </svg>
          Dashboard
        </Link>
        <Link
          href="/staff/orders"
          id="nav-orders"
          className="btn btn-ghost btn-sm"
          style={{
            textDecoration: 'none',
            color: pathname.startsWith('/staff/orders') && !pathname.includes('/new')
              ? 'var(--charcoal)' : 'var(--charcoal-mid)',
            background: pathname.startsWith('/staff/orders') && !pathname.includes('/new')
              ? 'var(--surface-hover)' : 'transparent',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6M9 16h4" />
          </svg>
          My Orders
        </Link>
        <Link
          href="/staff/qr-orders"
          id="nav-qr-orders"
          className="btn btn-ghost btn-sm"
          style={{
            textDecoration: 'none',
            color: pathname.startsWith('/staff/qr-orders') ? 'var(--charcoal)' : 'var(--charcoal-mid)',
            background: pathname.startsWith('/staff/qr-orders') ? 'var(--surface-hover)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          📱 QR Orders
          {pendingCount > 0 && (
            <span style={{
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '10px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 800
            }}>
              {pendingCount}
            </span>
          )}
        </Link>
        <Link
          href="/staff/orders/new"
          id="nav-new-order"
          className="btn btn-primary btn-sm"
          style={{ textDecoration: 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Order
        </Link>
      </nav>

      {/* User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--charcoal)', lineHeight: 1.3 }}>{user.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)' }}>{user.role}</div>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--accent-bg)',
          border: '1.5px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700, color: 'var(--accent-dark)',
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <button
          id="staff-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          className="btn btn-ghost btn-sm btn-icon"
          title={loggingOut ? 'Logging out…' : 'Log out'}
          style={{ color: 'var(--charcoal-soft)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </header>
  )
}
