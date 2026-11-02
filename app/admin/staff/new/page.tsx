import { createAuthorizedAdminClient as createAdminClient } from '@/lib/auth/admin'
import type { Metadata } from 'next'
import Link from 'next/link'
import StaffForm from './StaffForm'

export const metadata: Metadata = { title: 'Register Staff Account' }

export default async function NewStaffPage() {
  const supabase = await createAdminClient()

  // Fetch roles to populate select options in the form
  const { data: roles } = await supabase
    .from('roles')
    .select('id, name').neq('name', 'Admin')
    .order('id')

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
          <h1>Add Staff Member</h1>
          <p>Provision a new cashier, waiter, or manager account.</p>
        </div>
      </div>

      <StaffForm roles={rolesList} />
    </div>
  )
}
