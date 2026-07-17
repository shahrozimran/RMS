'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Role {
  id: number
  name: string
}

interface StaffUser {
  id: string
  name: string
  username: string
  email: string | null
  phone: string | null
  status: 'active' | 'suspended' | 'locked' | 'deleted'
  created_at: string
  role: {
    id: number
    name: string
  } | null
}

interface StaffDetailsClientProps {
  staff: StaffUser
  roles: Role[]
}

export default function StaffDetailsClient({ staff, roles }: StaffDetailsClientProps) {
  const router = useRouter()
  
  // Update state
  const [name, setName] = useState(staff.name)
  const [username, setUsername] = useState(staff.username)
  const [roleId, setRoleId] = useState(String(staff.role?.id ?? ''))
  const [email, setEmail] = useState(staff.email ?? '')
  const [phone, setPhone] = useState(staff.phone ?? '')
  const [status, setStatus] = useState<'active' | 'suspended'>(staff.status === 'suspended' ? 'suspended' : 'active')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Password reset state
  const [newPassword, setNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let generated = ''
    for (let i = 0; i < 12; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewPassword(generated)
  }

  // Handle staff updates
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    if (!name.trim()) {
      setError('Name is required')
      setSaving(false)
      return
    }
    if (username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
      setError('Username must be at least 3 characters and lowercase alphanumeric/underscores only')
      setSaving(false)
      return
    }

    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          username,
          role_id: parseInt(roleId),
          email: email.trim() || null,
          phone: phone.trim() || null,
          status
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update staff details')

      setSuccess('Staff details updated successfully.')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Handle password reset
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResettingPassword(true)
    setError('')
    setPasswordSuccess('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long')
      setResettingPassword(false)
      return
    }

    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reset password')

      setPasswordSuccess(`Password updated successfully! Share the new password: ${newPassword}`)
      setNewPassword('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setResettingPassword(false)
    }
  }

  // Handle delete staff
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setError('')

    try {
      const res = await fetch(`/api/staff/${staff.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete staff account')
      router.push('/admin/staff')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
      setDeleting(false)
    }
  }

  const initials = staff.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
      
      {/* Left Column: Summary Info card */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="surface-card" style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-bg)',
            border: '1.5px solid var(--border-strong)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px', fontSize: '18px', fontWeight: 700,
            color: 'var(--accent-dark)'
          }}>
            {initials}
          </div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '4px' }}>
            {staff.name}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', fontFamily: 'monospace', marginBottom: '14px' }}>
            @{staff.username}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
            <span className="badge badge-blue">
              {staff.role?.name || 'Staff'}
            </span>
            <span className={`badge ${staff.status === 'active' ? 'badge-green' : staff.status === 'suspended' ? 'badge-yellow' : 'badge-red'}`}>
              {staff.status}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            Joined: {new Date(staff.created_at).toLocaleDateString()}
          </div>
        </div>

        {/* Delete button card */}
        <div className="surface-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '8px' }}>Danger Zone</h3>
          <p style={{ fontSize: '11px', color: 'var(--charcoal-soft)', lineHeight: '1.5', marginBottom: '14px' }}>
            Removing a staff account flags it as deleted. They will immediately lose access to all portals.
          </p>
          <button
            type="button"
            className="btn btn-red"
            disabled={deleting}
            onClick={handleDelete}
            style={{ width: '100%' }}
          >
            {deleting ? 'Deleting...' : confirmDelete ? 'Click to Confirm Delete' : 'Delete Account'}
          </button>
          {confirmDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDelete(false)}
              style={{ width: '100%', marginTop: '6px', fontSize: '11px' }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Right Column: Manage Details tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Main Details Form */}
        <div className="surface-card" style={{ padding: '28px 36px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '20px' }}>
            Update Staff Information
          </h3>

          {error && <div className="badge badge-red" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', display: 'block' }}>{error}</div>}
          {success && <div className="badge badge-green" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', display: 'block' }}>{success}</div>}

          <form onSubmit={handleUpdate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label" htmlFor="edit-name">Full Name</label>
              <input
                id="edit-name"
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="edit-username">Username</label>
              <input
                id="edit-username"
                className="input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="edit-role">Portal Role</label>
              <select
                id="edit-role"
                className="input"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
                style={{ minHeight: '38px', padding: '6px 12px' }}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="edit-status">Status</label>
              <select
                id="edit-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                required
                style={{ minHeight: '38px', padding: '6px 12px' }}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="edit-email">Email Address</label>
              <input
                id="edit-email"
                className="input"
                type="email"
                placeholder="e.g. name@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="edit-phone">Contact Number</label>
              <input
                id="edit-phone"
                className="input"
                type="text"
                placeholder="e.g. +1 555-0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-start', marginTop: '10px' }}>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ minWidth: '150px' }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Password Reset Form */}
        <div className="surface-card" style={{ padding: '28px 36px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '8px' }}>
            Reset Access Password
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', marginBottom: '20px' }}>
            Update this staff member's password. The new credentials will take effect immediately.
          </p>

          {passwordSuccess && (
            <div className="badge badge-green" style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'block', wordBreak: 'break-all' }}>
              {passwordSuccess}
            </div>
          )}

          <form onSubmit={handlePasswordReset} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '500px' }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label" htmlFor="reset-pass-val">New Password</label>
              <input
                id="reset-pass-val"
                className="input"
                type="text"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={generatePassword}
              style={{ height: '38px', whiteSpace: 'nowrap' }}
            >
              Generate
            </button>
            <button
              type="submit"
              disabled={resettingPassword}
              className="btn btn-primary"
              style={{ height: '38px', whiteSpace: 'nowrap' }}
            >
              {resettingPassword ? 'Updating...' : 'Set Password'}
            </button>
          </form>
        </div>

      </div>

    </div>
  )
}
