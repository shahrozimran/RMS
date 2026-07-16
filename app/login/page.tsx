'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Tab = 'admin' | 'staff'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('staff')
  const [isPending, startTransition] = useTransition()

  // Staff fields
  const [staffUsername, setStaffUsername] = useState('')
  const [staffPassword, setStaffPassword] = useState('')

  // Admin fields
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: staffUsername, password: staffPassword }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        router.push('/staff/dashboard')
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        const supabase = createClient()
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword,
        })
        if (authError) throw new Error(authError.message)
        router.push('/admin/dashboard')
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <div className="login-root">
      {/* Background elements */}
      <div className="login-bg-orb orb-1" />
      <div className="login-bg-orb orb-2" />

      <div className="login-card animate-in">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#brandGrad)" />
              <path d="M8 22 C8 16 12 10 16 10 C20 10 24 16 24 22" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M16 10 L16 6" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="16" cy="6" r="2" fill="white"/>
              <path d="M6 22 L26 22" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32">
                  <stop offset="0%" stopColor="#f97316"/>
                  <stop offset="100%" stopColor="#c2410c"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="login-title">RMS</h1>
            <p className="login-subtitle">Restaurant Management</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="login-tabs">
          <button
            id="tab-staff"
            className={`login-tab ${tab === 'staff' ? 'active' : ''}`}
            onClick={() => { setTab('staff'); setError('') }}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Staff Login
          </button>
          <button
            id="tab-admin"
            className={`login-tab ${tab === 'admin' ? 'active' : ''}`}
            onClick={() => { setTab('admin'); setError('') }}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Admin Login
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="login-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        {/* Staff Form */}
        {tab === 'staff' && (
          <form onSubmit={handleStaffLogin} className="login-form" id="staff-login-form">
            <div className="input-group">
              <label className="input-label" htmlFor="staff-username">Username</label>
              <input
                id="staff-username"
                className="input"
                type="text"
                placeholder="Enter your username"
                value={staffUsername}
                onChange={e => setStaffUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="staff-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="staff-password"
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={staffPassword}
                  onChange={e => setStaffPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: '44px' }}
                  required
                />
                <button type="button" className="login-eye-btn" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                  {showPass
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
            <button id="staff-login-btn" className="btn btn-primary btn-lg" type="submit" disabled={isPending} style={{ width: '100%', marginTop: '8px' }}>
              {isPending
                ? <><span className="spin" style={{ display:'inline-block',width:18,height:18,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%'}} />&nbsp;Signing in…</>
                : 'Sign In to Staff Portal'
              }
            </button>
          </form>
        )}

        {/* Admin Form */}
        {tab === 'admin' && (
          <form onSubmit={handleAdminLogin} className="login-form" id="admin-login-form">
            <div className="input-group">
              <label className="input-label" htmlFor="admin-email">Email Address</label>
              <input
                id="admin-email"
                className="input"
                type="email"
                placeholder="admin@restaurant.com"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="admin-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="admin-password"
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Admin password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: '44px' }}
                  required
                />
                <button type="button" className="login-eye-btn" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                  {showPass
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
            <button id="admin-login-btn" className="btn btn-primary btn-lg" type="submit" disabled={isPending} style={{ width: '100%', marginTop: '8px' }}>
              {isPending
                ? <><span className="spin" style={{ display:'inline-block',width:18,height:18,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%'}} />&nbsp;Signing in…</>
                : 'Sign In to Admin Portal'
              }
            </button>
          </form>
        )}

        <p className="login-footer">
          Secure access · {new Date().getFullYear()} Restaurant Management System
        </p>
      </div>

      <style>{`
        .login-root {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface-0);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .login-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          z-index: 0;
        }
        .orb-1 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%);
          top: -100px; right: -80px;
        }
        .orb-2 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%);
          bottom: -80px; left: -60px;
        }
        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          background: var(--surface-2);
          border: 1px solid var(--border-light);
          border-radius: 24px;
          padding: 36px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        }
        .login-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .login-logo {
          flex-shrink: 0;
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg,rgba(249,115,22,0.2),rgba(194,65,12,0.2));
          border-radius: 14px;
          border: 1px solid rgba(249,115,22,0.3);
        }
        .login-title {
          font-size: 24px;
          font-weight: 800;
          background: linear-gradient(135deg, #f97316, #fb923c);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
        }
        .login-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin: 2px 0 0;
        }
        .login-tabs {
          display: flex;
          background: var(--surface-3);
          border-radius: 12px;
          padding: 4px;
          gap: 4px;
        }
        .login-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          min-height: 44px;
        }
        .login-tab.active {
          background: var(--surface-5);
          color: var(--text-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .login-tab:hover:not(.active) { color: var(--text-secondary); }
        .login-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: 10px;
          color: #f87171;
          font-size: 13px;
          font-weight: 500;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .login-eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .login-eye-btn:hover { color: var(--text-secondary); }
        .login-footer {
          text-align: center;
          font-size: 12px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  )
}
