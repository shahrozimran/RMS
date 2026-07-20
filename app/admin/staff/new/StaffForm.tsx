'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Role {
  id: number
  name: string
}

interface StaffFormProps {
  roles: Role[]
}

export default function StaffForm({ roles }: StaffFormProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string
    username: string
    password: string
    roleName: string
  } | null>(null)

  // Password Generator
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let generated = ''
    for (let i = 0; i < 12; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setPassword(generated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Basic Validation
    if (phone.trim() && !/^\+?[0-9]{10,15}$/.test(phone.trim())) {
      setError('Contact number must be between 10 and 15 digits (e.g. +1234567890 or 03001234567)')
      setLoading(false)
      return
    }
    if (!name.trim()) {
      setError('Full name is required')
      setLoading(false)
      return
    }
    if (username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
      setError('Username must be at least 3 characters and contain lowercase letters, numbers, and underscores only')
      setLoading(false)
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      setLoading(false)
      return
    }
    if (!roleId) {
      setError('Please select a role')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          username,
          password,
          role_id: parseInt(roleId),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create staff account')

      const selectedRole = roles.find(r => r.id === parseInt(roleId))

      setCreatedCredentials({
        name: json.data.name,
        username: json.data.username,
        password: json.generated_password || password,
        roleName: selectedRole?.name || 'Staff'
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const [copied, setCopied] = useState(false)
  const handleCopyCredentials = () => {
    if (!createdCredentials) return
    const text = `Restaurant Management System\nStaff Credentials\n---------------------------\nName: ${createdCredentials.name}\nRole: ${createdCredentials.roleName}\nUsername: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (createdCredentials) {
    return (
      <div className="surface-card animate-in" style={{ padding: '36px', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
        {/* Success Icon */}
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%', background: 'var(--success-bg)',
          border: '1.5px solid var(--success)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--charcoal)', marginBottom: '8px' }}>
          Staff Account Created!
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--charcoal-soft)', marginBottom: '28px' }}>
          Please copy these login credentials. For security, the password will not be shown again.
        </p>

        {/* Credentials Details Block */}
        <div style={{
          background: 'var(--surface-raised)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '20px', textAlign: 'left', marginBottom: '24px'
        }}>
          <div style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)', display: 'block', marginBottom: '2px' }}>Role</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--charcoal)' }}>{createdCredentials.roleName}</span>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)', display: 'block', marginBottom: '2px' }}>Username</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--charcoal)', fontFamily: 'monospace' }}>
              {createdCredentials.username}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-soft)', display: 'block', marginBottom: '2px' }}>Password</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-dark)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {createdCredentials.password}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCopyCredentials}
            style={{ width: '100%' }}
          >
            {copied ? 'Copied to Clipboard!' : 'Copy Credentials'}
          </button>
          
          <Link
            href="/admin/staff"
            className="btn btn-secondary"
            style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}
          >
            Back to Staff Directory
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="surface-card animate-in" style={{ padding: '28px 36px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '20px' }}>
        Account Information
      </h2>

      {error && (
        <div className="badge badge-red" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '20px', display: 'block', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Name */}
        <div className="input-group">
          <label className="input-label" htmlFor="staff-name">Full Name</label>
          <input
            id="staff-name"
            type="text"
            className="input"
            placeholder="e.g. John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Username */}
        <div className="input-group">
          <label className="input-label" htmlFor="staff-username">Username</label>
          <input
            id="staff-username"
            type="text"
            className="input"
            placeholder="lowercase, numbers and underscores only (e.g. john_d)"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            required
          />
        </div>

        {/* Role Select */}
        <div className="input-group">
          <label className="input-label" htmlFor="staff-role">Portal Role</label>
          <select
            id="staff-role"
            className="input"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            required
            style={{ minHeight: '38px', padding: '6px 12px' }}
          >
            <option value="">Choose a Role...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Password */}
        <div className="input-group">
          <label className="input-label" htmlFor="staff-password">Access Password</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              id="staff-password"
              type="text"
              className="input"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={generatePassword}
              style={{ flexShrink: 0 }}
            >
              Generate
            </button>
          </div>
        </div>

        {/* Email */}
        <div className="input-group">
          <label className="input-label" htmlFor="staff-email">Email Address (Optional)</label>
          <input
            id="staff-email"
            type="email"
            className="input"
            placeholder="e.g. john.doe@restaurant.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Phone */}
        <div className="input-group">
          <label className="input-label" htmlFor="staff-phone">Contact Number (Optional)</label>
          <input
            id="staff-phone"
            type="text"
            className="input"
            placeholder="e.g. +1 555-0199"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
          <Link
            href="/admin/staff"
            className="btn btn-secondary"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
