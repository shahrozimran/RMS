'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface StaffTopBarProps {
  user: { name: string; role: string }
}

export default function StaffTopBar({ user }: StaffTopBarProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header style={{
      background: 'var(--surface-1)',
      borderBottom: '1px solid var(--border)',
      padding: '0 20px',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {/* Brand */}
      <Link href="/staff/dashboard" style={{ display:'flex', alignItems:'center', gap:'10px', textDecoration:'none' }}>
        <span style={{ fontSize:'22px' }}>🍴</span>
        <span style={{ fontSize:'15px', fontWeight:700, color:'var(--text-primary)' }}>RMS</span>
      </Link>

      {/* Nav */}
      <nav style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <Link href="/staff/orders" id="nav-orders" className="btn btn-ghost btn-sm">🗒 Orders</Link>
        <Link href="/staff/orders/new" id="nav-new-order" className="btn btn-primary btn-sm">+ New Order</Link>
      </nav>

      {/* User */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)' }}>{user.name}</div>
          <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{user.role}</div>
        </div>
        <button
          id="staff-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          className="btn btn-ghost btn-sm btn-icon"
          title="Log out"
        >
          🚪
        </button>
      </div>
    </header>
  )
}
