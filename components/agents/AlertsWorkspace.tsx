'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, Send } from 'lucide-react'
import type { AlertState, TeamAlert } from '@/lib/api/alert-types'
import { helpDeskHref } from '@/lib/agents/help-desk'
import LocalDateTime from '@/components/ui/LocalDateTime'
import HelpDeskFrame from './HelpDeskFrame'
import './agents.css'

const sampleIssue = { id: '00000000-0000-4000-8000-000000000010', title: 'Mapped ingredient demand exceeds stock', summary: 'Confirm the physical bun count and update the duty lead.' }
function practiceAlerts(admin: boolean, issueId?: string): AlertState {
  return { installed: true, team: admin ? [{ id: 'sample-waiter', name: 'Sofia Ahmed' }, { id: 'sample-cashier', name: 'Oliver Chen' }] : [],
    issue: issueId ? { ...sampleIssue, id: issueId } : null, sent: [],
    inbox: [{ id: 'practice-alert', kind: admin ? 'issue' : 'staff_message', title: 'Check the bun count',
      message: 'Please confirm how many buns are in stock before taking another burger order.',
      sender: admin ? null : { name: 'Alex Morgan' }, recipient: null, issue_id: admin ? sampleIssue.id : null,
      read_at: null, created_at: '2026-11-06T12:00:00Z' }],
  }
}

export default function AlertsWorkspace({ admin = false, preview = false, issueId }: { admin?: boolean; preview?: boolean; issueId?: string }) {
  const [data, setData] = useState<AlertState | null>(() => preview ? practiceAlerts(admin, issueId) : null)
  const [view, setView] = useState<'inbox' | 'sent' | 'send'>(admin && issueId ? 'send' : 'inbox')
  const [recipient, setRecipient] = useState('')
  const [title, setTitle] = useState(preview && issueId ? sampleIssue.title : '')
  const [message, setMessage] = useState(preview && issueId ? sampleIssue.summary : '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef<{ body: string; id: string } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/alerts${issueId ? `?issue=${encodeURIComponent(issueId)}` : ''}`, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not open alerts.')
    return result.data as AlertState
  }, [issueId])

  useEffect(() => {
    if (preview) return
    let active = true
    load().then(result => {
      if (!active) return
      setData(result)
      if (result.issue) { setTitle(result.issue.title.slice(0, 120)); setMessage(result.issue.summary.slice(0, 1000)) }
    }).catch(() => { if (active) setError('Could not open alerts. Refresh to try again.') })
    return () => { active = false }
  }, [preview, load])

  async function refresh() {
    if (preview) return
    setBusy(true); setError('')
    try { setData(await load()) }
    catch { setError('Could not refresh alerts.') }
    finally { setBusy(false) }
  }

  async function send() {
    if (!data || !recipient || !title.trim() || !message.trim()) return
    const payload = { recipient, title: title.trim(), message: message.trim(), issue: data.issue?.id ?? null }
    const body = JSON.stringify(payload)
    if (requestId.current?.body !== body) requestId.current = { body, id: crypto.randomUUID() }
    const id = requestId.current.id
    setBusy(true); setError(''); setNotice('')
    try {
      if (preview) {
        const alert: TeamAlert = { id, kind: 'staff_message', title: payload.title, message: payload.message, issue_id: payload.issue,
          created_at: new Date().toISOString(), read_at: null, sender: { name: 'Alex Morgan' }, recipient: { name: data.team.find(member => member.id === recipient)?.name ?? 'Team member' } }
        setData({ ...data, sent: [alert, ...data.sent] })
      } else {
        const response = await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not send the alert.')
        try { setData(await load()) } catch { setError('The alert was sent. Refresh to see it in Sent alerts.') }
      }
      requestId.current = null
      setRecipient(''); setTitle(''); setMessage(''); setView('sent'); setNotice('Alert sent.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send the alert.') }
    finally { setBusy(false) }
  }

  async function markRead(alert: TeamAlert) {
    setBusy(true); setError('')
    try {
      let readAt = new Date().toISOString()
      if (!preview) {
        const response = await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: alert.id }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not mark the alert as read.')
        readAt = result.data
      }
      setData(old => old && ({ ...old, inbox: old.inbox.map(item => item.id === alert.id ? { ...item, read_at: readAt } : item) }))
      window.dispatchEvent(new Event('rms-alerts-updated'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not mark the alert as read.') }
    finally { setBusy(false) }
  }

  const content = <section className="panel"><div className="panel-heading"><div><h2>{view === 'send' ? 'Send a private alert' : view === 'sent' ? 'Sent alerts' : 'Your alerts'}</h2>
    <p>{view === 'send' ? 'Choose who should see the message and tell them what to check.' : view === 'sent' ? 'See your messages and whether the team member has read them.' : 'Read messages and mark them as read when you have seen them.'}</p></div>
    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void refresh()}>Refresh</button></div>
    <div className="help-desk-body help-desk-list">
      {admin && <div className="filter-tabs help-desk-tabs" aria-label="Alert views">{(['inbox', 'sent', 'send'] as const).map(tab => <button className={`filter-tab ${view === tab ? 'active' : ''}`} key={tab} onClick={() => setView(tab)} aria-pressed={view === tab}>{tab === 'inbox' ? 'My alerts' : tab === 'sent' ? 'Sent alerts' : 'Send an alert'}</button>)}</div>}
      {error && <p className="intel-error" role="alert">{error}</p>}{notice && <p className="intel-notice" role="status">{notice}</p>}
      {!data && !error && <p role="status">Opening alerts…</p>}
      {data && !data.installed && <p className="notice">Alerts need database setup. Ask your system administrator to install migration 016.</p>}
      {data?.installed && (view === 'send' ? <form className="help-desk-form" onSubmit={event => { event.preventDefault(); void send() }}>
        {data.issue && <p className="notice">Linked issue · {data.issue.title}</p>}
        <label className="input-group"><span className="input-label">Send to</span><select className="input" value={recipient} onChange={event => setRecipient(event.target.value)} required disabled={busy}>
          <option value="">Choose a team member</option>{data.team.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
        <label className="input-group"><span className="input-label">Title</span><input className="input" required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={busy}/></label>
        <label className="input-group"><span className="input-label">Message</span><textarea className="input" required rows={4} maxLength={1000} value={message} onChange={event => setMessage(event.target.value)} disabled={busy}/></label>
        <button className="btn btn-primary" disabled={busy || !recipient || !title.trim() || !message.trim()}><Send size={16}/>{busy ? 'Sending…' : 'Send alert'}</button>
      </form> : <>{(view === 'sent' ? data.sent : data.inbox).length ? (view === 'sent' ? data.sent : data.inbox).map(alert => <article className="intel-finding help-desk-answer" key={alert.id}>
        <span className={`badge ${alert.read_at ? 'badge-gray' : 'badge-green'}`}>{alert.read_at ? 'Read' : view === 'sent' ? 'Unread by recipient' : 'New'}</span><h3>{alert.title}</h3><p>{alert.message}</p>
        <small>{view === 'sent' ? `To ${alert.recipient?.name ?? 'Team member'}` : `From ${alert.sender?.name ?? 'Restaurant help desk'}`} · <LocalDateTime value={alert.created_at} mode="date"/> · <LocalDateTime value={alert.created_at}/></small>
        <div className="help-desk-actions">
          {view === 'inbox' && !alert.read_at && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void markRead(alert)}><Check size={14}/>Mark as read</button>}
          {admin && alert.issue_id && <Link className="btn btn-secondary btn-sm" href={helpDeskHref('issues', preview, { issue: alert.issue_id })}>Open issue</Link>}
          {admin && alert.kind === 'check_failed' && <Link className="btn btn-secondary btn-sm" href={helpDeskHref('checks', preview, { status: 'failed' })}>Open checks</Link>}
          {admin && alert.kind === 'low_stock' && <Link className="btn btn-secondary btn-sm" href={preview ? '/preview?view=inventory' : '/admin/inventory'}>Open ingredients</Link>}
        </div>
      </article>) : <p className="muted">{view === 'sent' ? 'You have not sent any alerts yet.' : 'You have no alerts.'}</p>}</>)}
    </div>
  </section>

  return admin ? <HelpDeskFrame page="alerts" preview={preview}>{content}{preview && <Link className="btn btn-secondary btn-sm" href="/preview?view=staff-alerts"><Bell size={15}/>See a team member’s alert screen</Link>}</HelpDeskFrame>
    : <div className="intel-workspace"><div className="workspace-title"><div><span className="eyebrow">Team messages</span><h1>My alerts</h1><p>Messages from the restaurant manager.</p></div></div>{preview && <p className="notice">Practice view with a sample message.</p>}{content}</div>
}
