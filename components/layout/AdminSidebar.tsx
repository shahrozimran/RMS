'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

// ── Inline SVG icons (no external dep) ──────────────────────
const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Orders: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" />
    </svg>
  ),
  Menu: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 014 4c0 1.5-.5 2.8-1.4 3.8L16 21H8l1.4-11.2A5.97 5.97 0 018 6a4 4 0 014-4z" />
      <path d="M6 21h12" />
    </svg>
  ),
  Staff: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85" />
    </svg>
  ),
  Tables: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="3" rx="1" /><path d="M6 10v7M18 10v7M3 17h18" />
    </svg>
  ),
  Inventory: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  ),
  Reports: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  Activity: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  Logout: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
}

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard',  Icon: Icons.Dashboard },
  { href: '/admin/orders',    label: 'Orders',      Icon: Icons.Orders },
  { href: '/admin/menu',      label: 'Menu',        Icon: Icons.Menu },
  { href: '/admin/staff',     label: 'Staff',       Icon: Icons.Staff },
  { href: '/admin/tables',    label: 'Tables',      Icon: Icons.Tables },
  { href: '/admin/inventory', label: 'Inventory',   Icon: Icons.Inventory },
  { href: '/admin/reports',   label: 'Reports',     Icon: Icons.Reports },
  { href: '/admin/activity',  label: 'Activity',    Icon: Icons.Activity },
  { href: '/admin/settings',  label: 'Settings',    Icon: Icons.Settings },
]

interface AdminSidebarProps {
  user: { name: string; role: string }
}

export default function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

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
    <aside className="sidebar" aria-label="Admin navigation">
      {/* Brand */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          {/* Logo mark */}
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: 'var(--charcoal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 014 4c0 1.5-.5 2.8-1.4 3.8L16 21H8l1.4-11.2A5.97 5.97 0 018 6a4 4 0 014-4z" />
              <path d="M6 21h12" />
            </svg>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--charcoal)', whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>RMS Admin</div>
            <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)', whiteSpace: 'nowrap' }}>Management Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
        {navItems.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`sidebar-link ${pathname.startsWith(href) ? 'active' : ''}`}
            title={label}
          >
            <span style={{ flexShrink: 0, display: 'flex' }}><Icon /></span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 8px' }}>
        {/* User pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 14px', marginBottom: '2px', overflow: 'hidden'
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent-bg)',
            border: '1.5px solid var(--border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: 'var(--accent-dark)'
          }}>
            {initials}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--charcoal)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)' }}>{user.role}</div>
          </div>
        </div>

        {/* Logout */}
        <button
          id="admin-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          className="sidebar-link"
          style={{
            width: '100%', border: 'none', cursor: 'pointer',
            color: 'var(--error)', background: 'transparent',
            textAlign: 'left',
          }}
          title="Log out"
        >
          <span style={{ flexShrink: 0, display: 'flex' }}><Icons.Logout /></span>
          <span>{loggingOut ? 'Logging out…' : 'Log Out'}</span>
        </button>
      </div>
    </aside>
  )
}
