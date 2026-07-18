import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Staff Management' }

const STATUS_CLASS: Record<string, string> = {
  active: 'badge-green', suspended: 'badge-yellow', locked: 'badge-red', deleted: 'badge-gray',
}

export default async function AdminStaffPage() {
  const supabase = await createAdminClient()
  const { data: staff } = await supabase
    .from('users')
    .select('id, name, username, email, phone, status, created_at, role:roles(name)')
    .is('auth_user_id', null)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  return (
    <div className="animate-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'28px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Staff Management</h1>
          <p>{staff?.length ?? 0} staff members</p>
        </div>
        <div style={{ display:'flex', gap:'10px' }}>
          <Link href="/admin/staff/performance" className="btn btn-secondary" style={{ textDecoration:'none' }}>
            📊 Shifts & Performance
          </Link>
          <Link id="add-staff-btn" href="/admin/staff/new" className="btn btn-primary" style={{ textDecoration:'none' }}>+ Add Staff</Link>
        </div>
      </div>

      <div className="surface-card" style={{ overflow:'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>Username</th>
              <th>Role</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).map((s: any) => (
              <tr key={s.id}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--accent-bg)', border:'1.5px solid var(--border-strong)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'13px', color:'var(--accent-dark)', flexShrink:0 }}>
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight:600, color:'var(--charcoal)' }}>{s.name}</span>
                  </div>
                </td>
                <td style={{ fontFamily:'monospace', fontSize:'13px' }}>@{s.username}</td>
                <td>{(s.role as any)?.name ? <span className="badge badge-blue">{(s.role as any).name}</span> : '—'}</td>
                <td style={{ fontSize:'13px' }}>{s.email || s.phone || <span style={{ color:'var(--charcoal-soft)' }}>—</span>}</td>
                <td><span className={`badge ${STATUS_CLASS[s.status] ?? 'badge-gray'}`}>{s.status}</span></td>
                <td style={{ fontSize:'13px', color:'var(--charcoal-soft)' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <Link href={`/admin/staff/${s.id}`} className="btn btn-secondary btn-sm" style={{ textDecoration:'none' }}>Manage Account</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(staff?.length ?? 0) === 0 && (
          <div style={{ textAlign:'center', padding:'48px', color:'var(--charcoal-soft)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--charcoal-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin:'0 auto 12px', display:'block' }}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <p style={{ fontSize:'14px' }}>No staff members yet. <Link href="/admin/staff/new" style={{ color:'var(--accent-dark)', textDecoration:'underline' }}>Add the first one</Link>.</p>
          </div>
        )}
      </div>
    </div>
  )
}
