'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowRight, Check, Eye, EyeOff, LayoutDashboard, LockKeyhole, ShieldCheck, Utensils, Users } from 'lucide-react'
import Brand from '@/components/ui/Brand'

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.')
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.')
      }
    })
  }

  return <main className="login-screen">
    <section className="login-story"><Brand light/><div className="login-story-main"><span className="login-story-label"><span className="status-dot"/>A calmer way to run your restaurant</span><h2>Great hospitality.<br/><em>Beautifully in sync.</em></h2><p>From the first order to the final bill, bring your people, your menu and your service together.</p><div className="login-widget"><div className="login-widget-top"><span>YOUR DAILY FLOW</span><Utensils size={16}/></div><div className="login-widget-price">One workspace.<br/>Every little detail.</div><div className="login-widget-lines">{['Take orders with confidence','Keep your kitchen connected','See the bigger picture'].map(t=><div key={t}><span className="login-check"><Check size={12}/></span>{t}</div>)}</div></div></div><div className="login-story-foot"><span>Designed for the way you serve.</span><span>RMS © {new Date().getFullYear()}</span></div></section>
    <section className="login-panel"><div className="login-form-wrap animate-in"><Brand/><span className="eyebrow">Your next great service starts here</span><h1>Welcome back.</h1><p>Sign in to your restaurant workspace.</p><div className="login-tabs-new" role="group" aria-label="Sign in role"><button id="tab-staff" type="button" aria-pressed={tab==='staff'} className={tab==='staff'?'active':''} onClick={()=>{setTab('staff');setError('');setShowPass(false)}}><Users size={15}/>Team member</button><button id="tab-admin" type="button" aria-pressed={tab==='admin'} className={tab==='admin'?'active':''} onClick={()=>{setTab('admin');setError('');setShowPass(false)}}><LayoutDashboard size={15}/>Administrator</button></div>
    {error&&<div className="alert" role="alert">{error}</div>}
    <form onSubmit={tab==='staff'?handleStaffLogin:handleAdminLogin} className="login-form-new" id={`${tab}-login-form`}><div className="input-group"><label className="input-label" htmlFor={tab==='staff'?'staff-username':'admin-email'}>{tab==='staff'?'Username':'Email address'}</label><input id={tab==='staff'?'staff-username':'admin-email'} className="input" type={tab==='staff'?'text':'email'} placeholder={tab==='staff'?'Enter your username':'you@restaurant.com'} value={tab==='staff'?staffUsername:adminEmail} onChange={e=>tab==='staff'?setStaffUsername(e.target.value):setAdminEmail(e.target.value)} autoComplete={tab==='staff'?'username':'email'} required disabled={isPending}/></div><div className="input-group"><label className="input-label" htmlFor={`${tab}-password`}>Password</label><div className="login-password"><input id={`${tab}-password`} className="input" type={showPass?'text':'password'} placeholder="Enter your password" value={tab==='staff'?staffPassword:adminPassword} onChange={e=>tab==='staff'?setStaffPassword(e.target.value):setAdminPassword(e.target.value)} autoComplete="current-password" required disabled={isPending}/><button type="button" onClick={()=>setShowPass(!showPass)} aria-label={showPass?'Hide password':'Show password'}>{showPass?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div><button id={`${tab}-login-btn`} type="submit" className="btn btn-primary btn-lg" disabled={isPending}>{isPending?'Signing you in…':'Sign in to workspace'}<ArrowRight size={17}/></button></form>
    <p className="login-secure"><LockKeyhole size={12}/>Secure access for your restaurant team</p>{process.env.NODE_ENV==='development'&&<Link className="login-preview-link" href="/preview">Explore the new design<ArrowRight size={13}/></Link>}<div className="login-bottom"><ShieldCheck size={15}/><p>Your people. Your service. All in one place.<br/><span>Contact your administrator if you need access.</span></p></div></div></section>
  </main>
}
