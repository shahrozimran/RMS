import { createAuthorizedAdminClient as createAdminClient } from '@/lib/auth/admin'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import StaffDetailsClient from './StaffDetailsClient'

export const metadata: Metadata = { title: 'Staff Member Profile' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StaffDetailPage({ params }: PageProps) {
  const supabase = await createAdminClient()
  const resolvedParams = await params

  // Parallel fetch: staff details and all roles
  const [
    { data: staff },
    { data: roles }
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, username, email, phone, status, created_at, role:roles(id,name)')
      .eq('id', resolvedParams.id)
      .single(),
    supabase
      .from('roles')
      .select('id, name')
      .order('id')
  ])

  if (!staff || staff.status === 'deleted') {
    notFound()
  }

  const staffUser = staff as any
  const rolesList = roles ?? []

  return (
    <div className="animate-in">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <Link 
          href="/admin/staff" 
          className="btn btn-secondary" 
          style={{ 
            textDecoration: 'none', 
            padding: '8px 12px', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            minHeight: 'unset' 
          }}
          title="Back to staff list"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Staff Account details</h1>
          <p>Review credentials, reset passwords, or manage access permissions.</p>
        </div>
      </div>

      <StaffDetailsClient staff={staffUser} roles={rolesList} />
    </div>
  )
}
