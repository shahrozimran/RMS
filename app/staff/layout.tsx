import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import StaffTopBar from '@/components/layout/StaffTopBar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Staff Portal' }

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.authType === 'admin') redirect('/admin/dashboard')

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--canvas)' }}>
      <StaffTopBar user={{ name: session.name, role: session.role }} />
      <main style={{ flex: 1, padding: '28px 24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
