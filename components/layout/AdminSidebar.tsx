'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard',  icon: '▣' },
  { href: '/admin/orders',    label: 'Orders',      icon: '🗒' },
  { href: '/admin/menu',      label: 'Menu',        icon: '🍽' },
  { href: '/admin/staff',     label: 'Staff',       icon: '👥' },
  { href: '/admin/tables',    label: 'Tables',      icon: '🪑' },
  { href: '/admin/inventory', label: 'Inventory',   icon: '📦' },
  { href: '/admin/reports',   label: 'Reports',     icon: '📊' },
  { href: '/admin/activity',  label: 'Activity',    icon: '⚡' },
  { href: '/admin/settings',  label: 'Settings',    icon: '⚙' },
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

  return (
    <aside className="sidebar" aria-label="Admin navigation">
      {/* Brand */}
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#f97316,#c2410c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px'
          }}>🍴</div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>RMS Admin</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Management Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0', overflow: 'hidden auto' }}>
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${pathname.startsWith(item.href) ? 'active' : ''}`}
            title={item.label}
          >
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 8px' }}>
        <div className="sidebar-link" style={{ cursor: 'default', marginBottom: '4px' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#f97316,#c2410c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 700, color: '#fff'
          }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.role}</div>
          </div>
        </div>
        <button
          id="admin-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          className="sidebar-link btn-ghost"
          style={{ width: '100%', border: 'none', cursor: 'pointer', color: '#f87171', background: 'transparent' }}
          title="Log out"
        >
          <span style={{ fontSize: '18px', flexShrink: 0 }}>🚪</span>
          <span>{loggingOut ? 'Logging out…' : 'Log Out'}</span>
        </button>
      </div>
    </aside>
  )
}
