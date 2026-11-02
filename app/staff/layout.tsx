import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import StaffTopBar from '@/components/layout/StaffTopBar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Service workspace' }
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.authType === 'admin') redirect('/admin/dashboard')
  return <div className="staff-shell" style={{minHeight:'100dvh',display:'flex',flexDirection:'column'}}><StaffTopBar user={{name:session.name,role:session.role}} /><main className="staff-content">{children}</main></div>
}
