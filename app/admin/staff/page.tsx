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
        <div>
          <h1 style={{ fontSize:'26px', fontWeight:800 }}>Staff Management</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'14px', marginTop:'4px' }}>{staff?.length ?? 0} staff members</p>
        </div>
        <Link id="add-staff-btn" href="/admin/staff/new" className="btn btn-primary" style={{ textDecoration:'none' }}>+ Add Staff</Link>
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
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#f97316,#c2410c)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'14px', color:'#fff', flexShrink:0 }}>
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{s.name}</span>
                  </div>
                </td>
                <td style={{ fontFamily:'monospace', fontSize:'13px' }}>@{s.username}</td>
                <td>{(s.role as any)?.name ? <span className="badge badge-blue">{(s.role as any).name}</span> : '—'}</td>
                <td style={{ fontSize:'13px' }}>{s.email || s.phone || <span style={{ color:'var(--text-muted)' }}>—</span>}</td>
                <td><span className={`badge ${STATUS_CLASS[s.status] ?? 'badge-gray'}`}>{s.status}</span></td>
                <td style={{ fontSize:'13px', color:'var(--text-muted)' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <Link href={`/admin/staff/${s.id}`} className="btn btn-secondary btn-sm" style={{ textDecoration:'none' }}>View</Link>
                    <Link href={`/admin/staff/${s.id}/edit`} className="btn btn-ghost btn-sm" style={{ textDecoration:'none' }}>Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(staff?.length ?? 0) === 0 && (
          <div style={{ textAlign:'center', padding:'48px', color:'var(--text-muted)' }}>
            <div style={{ fontSize:'32px', marginBottom:'12px' }}>👥</div>
            <p>No staff members yet. <Link href="/admin/staff/new" style={{ color:'var(--brand-400)' }}>Add the first one</Link>.</p>
          </div>
        )}
      </div>
    </div>
  )
}
