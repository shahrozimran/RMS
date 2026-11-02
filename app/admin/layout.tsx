import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import AdminSidebar from '@/components/layout/AdminSidebar'
import AppHeader from '@/components/layout/AppHeader'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin workspace' }
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin' || session.authType !== 'admin') redirect('/staff/dashboard')
  return <div className="app-shell"><AdminSidebar user={{name:session.name,role:session.role}} /><main className="admin-main"><AppHeader name={session.name} /><div className="app-content">{children}</div></main></div>
}
