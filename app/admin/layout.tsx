import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin Portal' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session) redirect('/login')
  if (session.authType !== 'admin') redirect('/staff/dashboard')

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--canvas)' }}>
      <AdminSidebar user={{ name: session.name, role: session.role }} />
      <main
        className="admin-main"
        style={{
          flex: 1,
          marginLeft: 'var(--sidebar-width)',
          padding: '32px 28px',
          minWidth: 0,
          transition: 'margin-left 0.25s ease',
          background: 'var(--canvas)',
        }}
      >
        {children}
      </main>
    </div>
  )
}
