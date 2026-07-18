'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Tab = 'admin' | 'staff'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('staff')
  const [isPending, startTransition] = useTransition()

  // Seed demo admin in the background on mount
  useEffect(() => {
    fetch('/api/auth/seed-admin').catch(err => console.error('Failed to trigger demo admin seed:', err))
  }, [])

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
        // Sign out any active admin session to avoid cookie collision
        const supabase = createClient()
        await supabase.auth.signOut().catch(() => {})

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
        // Clear any old staff cookie from the browser via the API
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})

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
      {/* Left branding panel — hidden on mobile */}
      <div className="login-brand-panel">
        <div className="login-brand-content">
          {/* Logo */}
          <div className="login-brand-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 014 4c0 1.5-.5 2.8-1.4 3.8L16 21H8l1.4-11.2A5.97 5.97 0 018 6a4 4 0 014-4z" />
              <path d="M6 21h12" />
            </svg>
          </div>
          <div className="login-brand-wordmark">RMS</div>
          <h2 className="login-brand-tagline">Restaurant Management System</h2>
          <p className="login-brand-sub">Streamline operations, serve with precision, and grow with confidence.</p>

          {/* Decorative dots */}
          <div className="login-brand-dots">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="login-brand-dot" />
            ))}
          </div>
        </div>
        <p className="login-brand-year">© {new Date().getFullYear()} Restaurant Management System</p>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        <div className="login-card animate-in">
          {/* Mobile brand */}
          <div className="login-mobile-brand">
            <div className="login-mobile-logo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 014 4c0 1.5-.5 2.8-1.4 3.8L16 21H8l1.4-11.2A5.97 5.97 0 018 6a4 4 0 014-4z" />
                <path d="M6 21h12" />
              </svg>
            </div>
            <span>RMS</span>
          </div>

          <div>
            <h1 className="login-heading">Welcome back</h1>
            <p className="login-subheading">Sign in to your portal to continue</p>
          </div>

          {/* Tabs */}
          <div className="login-tabs">
            <button
              id="tab-staff"
              className={`login-tab ${tab === 'staff' ? 'active' : ''}`}
              onClick={() => { setTab('staff'); setError('') }}
              type="button"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              Staff
            </button>
            <button
              id="tab-admin"
              className={`login-tab ${tab === 'admin' ? 'active' : ''}`}
              onClick={() => { setTab('admin'); setError('') }}
              type="button"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                <path d="M16 3.13a4 4 0 010 5.75" />
              </svg>
              Admin
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="login-error" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
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
                      ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <button id="staff-login-btn" className="btn btn-primary btn-lg" type="submit" disabled={isPending} style={{ width: '100%', marginTop: '4px' }}>
                {isPending
                  ? <><span className="spin" style={{ display:'inline-block',width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%'}} />&nbsp;Signing in…</>
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
                      ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <button id="admin-login-btn" className="btn btn-primary btn-lg" type="submit" disabled={isPending} style={{ width: '100%', marginTop: '4px' }}>
                {isPending
                  ? <><span className="spin" style={{ display:'inline-block',width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%'}} />&nbsp;Signing in…</>
                  : 'Sign In to Admin Portal'
                }
              </button>
            </form>
          )}

          <p className="login-footer">Secure access · {new Date().getFullYear()} Restaurant Management System</p>
        </div>
      </div>

      <style>{`
        .login-root {
          min-height: 100dvh;
          display: flex;
          background: var(--canvas);
        }

        /* ── Left branding panel ── */
        .login-brand-panel {
          width: 420px;
          flex-shrink: 0;
          background: var(--charcoal);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px 40px 36px;
          position: relative;
          overflow: hidden;
        }
        .login-brand-panel::before {
          content: '';
          position: absolute;
          top: -80px; right: -80px;
          width: 260px; height: 260px;
          background: radial-gradient(circle, rgba(200,169,126,0.18) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .login-brand-panel::after {
          content: '';
          position: absolute;
          bottom: -60px; left: -60px;
          width: 200px; height: 200px;
          background: radial-gradient(circle, rgba(200,169,126,0.10) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .login-brand-content {
          position: relative;
          z-index: 1;
        }
        .login-brand-logo {
          width: 52px; height: 52px;
          background: rgba(200,169,126,0.12);
          border: 1px solid rgba(200,169,126,0.3);
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 24px;
        }
        .login-brand-wordmark {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 36px;
          font-weight: 800;
          color: #FFFFFF;
          letter-spacing: -0.04em;
          margin-bottom: 8px;
        }
        .login-brand-tagline {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          margin-bottom: 16px;
          line-height: 1.4;
        }
        .login-brand-sub {
          font-size: 13px;
          color: rgba(255,255,255,0.35);
          line-height: 1.7;
          max-width: 280px;
        }
        .login-brand-dots {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin-top: 48px;
          max-width: 120px;
        }
        .login-brand-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: rgba(200,169,126,0.25);
        }
        .login-brand-year {
          font-size: 12px;
          color: rgba(255,255,255,0.25);
          position: relative;
          z-index: 1;
        }

        /* ── Right form panel ── */
        .login-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* Mobile brand (shown only on small screens) */
        .login-mobile-brand {
          display: none;
          align-items: center;
          gap: 10px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 18px;
          font-weight: 800;
          color: var(--charcoal);
          letter-spacing: -0.03em;
        }
        .login-mobile-logo {
          width: 36px; height: 36px;
          background: var(--charcoal);
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
        }

        .login-heading {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 26px;
          font-weight: 700;
          color: var(--charcoal);
          letter-spacing: -0.03em;
          margin: 0;
        }
        .login-subheading {
          font-size: 14px;
          color: var(--charcoal-soft);
          margin-top: 4px;
        }

        /* Tabs */
        .login-tabs {
          display: flex;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 3px;
          gap: 3px;
        }
        .login-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 12px;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: var(--charcoal-soft);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          min-height: 40px;
          letter-spacing: -0.01em;
        }
        .login-tab.active {
          background: var(--surface);
          color: var(--charcoal);
          box-shadow: var(--shadow-xs);
          border: 1px solid var(--border);
        }
        .login-tab:hover:not(.active) { color: var(--charcoal-mid); background: var(--surface-hover); }

        /* Error */
        .login-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 14px;
          background: var(--error-bg);
          border: 1px solid rgba(155,58,58,0.2);
          border-radius: 9px;
          color: var(--error);
          font-size: 13px;
          font-weight: 500;
        }

        /* Form */
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
          color: var(--charcoal-faint);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .login-eye-btn:hover { color: var(--charcoal-mid); }

        .login-footer {
          text-align: center;
          font-size: 12px;
          color: var(--charcoal-faint);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .login-brand-panel { display: none; }
          .login-mobile-brand { display: flex; }
          .login-form-panel { padding: 24px 20px; }
        }
      `}</style>
    </div>
  )
}
