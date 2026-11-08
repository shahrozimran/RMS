'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, Bell, Bot, Check, ChevronDown, RefreshCw, X } from 'lucide-react'
import type { AgentOverview, Recommendation, Run } from '@/lib/agents/contracts'
import type { AiReview } from '@/lib/agents/rag-contracts'
import { helpDeskHref, type ReviewPage } from '@/lib/agents/help-desk'
import LocalDateTime from '@/components/ui/LocalDateTime'
import { pollVisible } from '@/lib/utils/poll'
import AiReviewPanel from './AiReviewPanel'
import HelpDeskFrame from './HelpDeskFrame'

const issueLabels = { open: 'Needs review', acknowledged: 'Checked', dismissed: 'Dismissed', stale: 'Out of date', all: 'All issues' }
const checkLabels: Record<string, string> = { pending: 'Waiting', processing: 'Checking now', completed: 'Finished', dead: 'Needs another try' }
const orderRef = (id: string) => `#${id.slice(-6).toUpperCase()}`

function ReviewDetails({ run, preview }: { run: Run; preview: boolean }) {
  const [review, setReview] = useState<AiReview | null | undefined>(run.ai_review ?? (preview ? null : undefined))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (review !== undefined || loading) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/agents/runs/${run.id}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error('Could not open this review.')
      setReview(result.data)
    } catch { setError('Could not open this review. Close and reopen it to try again.') }
    finally { setLoading(false) }
  }

  return <details onToggle={event => { if (event.currentTarget.open) void load() }}>
    <summary><span><strong>Order {orderRef(run.order_id)}</strong><small><LocalDateTime value={run.created_at} mode="date" /> · <LocalDateTime value={run.created_at} /></small></span><ChevronDown size={17}/></summary>
    <p>{run.summary}</p>
    {loading && <p role="status">Opening review…</p>}
    {error && <p role="alert">{error}</p>}
    {review && <AiReviewPanel review={review} orderId={run.order_id} preview={preview} />}
    <div className="intel-messages">{run.messages.map((message, index) => <div key={`${message.sender}:${index}`}>
      <span className="eyebrow">{message.sender === 'supervisor' ? 'Final check' : `${message.sender} check`}</span><strong>{message.objective}</strong>
      <ul>{message.evidence.length ? message.evidence.map((item, i) => <li key={i}>{item.label} · {item.value}</li>) : message.constraints.map(item => <li key={item}>{item}</li>)}</ul>
    </div>)}</div>
  </details>
}

export default function AgentsWorkspace({ initial, preview = false, page = 'overview', checkFilter = 'waiting', focusedIssue }: {
  initial: AgentOverview; preview?: boolean; page?: ReviewPage; checkFilter?: 'waiting' | 'failed' | 'all'; focusedIssue?: Recommendation | null
}) {
  const [data, setData] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<keyof typeof issueLabels>(focusedIssue ? 'all' : 'open')
  const [selected, setSelected] = useState<Recommendation | null>(null)
  const [note, setNote] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const sequence = useRef(0)
  const invalidateRefresh = useCallback(() => { sequence.current++ }, [])

  useEffect(() => {
    const modal = dialog.current
    if (selected && !modal?.open) modal?.showModal()
    if (!selected && modal?.open) modal.close()
  }, [selected])

  const refresh = useCallback(async () => {
    if (preview) return
    const request = ++sequence.current
    const response = await fetch('/api/agents', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not refresh the checks.')
    if (request === sequence.current) setData(result.data)
  }, [preview])

  useEffect(() => {
    if (preview || busy || data.setupRequired) return
    const stop = pollVisible(refresh, 20000)
    return () => { invalidateRefresh(); stop() }
  }, [busy, data.setupRequired, preview, refresh, invalidateRefresh])

  async function command(action: 'configure' | 'queue' | 'refresh', orderId?: string) {
    sequence.current++
    setBusy(true); setError(''); setNotice('')
    try {
      if (preview) {
        if (action === 'configure') setData(old => ({ ...old, enabled: !old.enabled }))
        if (action === 'queue') setData(old => ({ ...old, jobs: old.jobs.map(job => orderId === job.order_id ? { ...job, status: 'pending', attempts: 0 } : job) }))
        setNotice(action === 'queue' ? 'Sample check added to the list.' : 'Practice view updated.')
      } else {
        if (action !== 'refresh') {
          const response = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action === 'configure' ? { action, enabled: !data.enabled } : { action, order_id: orderId }) })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Could not update the checks.')
          setNotice(action === 'queue' ? `${result.data} order${result.data === 1 ? '' : 's'} added for checking.` : 'Check settings saved.')
        }
        await refresh()
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the checks.') }
    finally { setBusy(false) }
  }

  async function review(decision: 'acknowledged' | 'dismissed') {
    if (!selected) return
    sequence.current++
    setBusy(true); setError(''); setNotice('')
    try {
      let status: Recommendation['status'] = decision
      if (!preview) {
        const response = await fetch(`/api/agents/recommendations/${selected.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not save your decision.')
        status = result.data.status
      }
      setData(old => ({ ...old, recommendations: [...old.recommendations.filter(item => item.id !== selected.id), { ...selected, status, review_note: note }] }))
      setSelected(null); setNote('')
      setNotice(status === 'stale' ? 'The source changed. Check the order again for a fresh result.' : 'Your decision was saved.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your decision.') }
    finally { setBusy(false) }
  }

  const linkedIssue = focusedIssue && (data.recommendations.find(item => item.id === focusedIssue.id) ?? focusedIssue)
  const recommendations = linkedIssue ? [linkedIssue, ...data.recommendations.filter(item => item.id !== linkedIssue.id)] : data.recommendations
  const visibleIssues = recommendations.filter(item => filter === 'all' || item.status === filter)
  const waiting = data.jobs.filter(job => job.status === 'pending' || job.status === 'processing')
  const failed = data.jobs.filter(job => job.status === 'dead')
  const visibleJobs = checkFilter === 'waiting' ? waiting : checkFilter === 'failed' ? failed : data.jobs
  const latestAi = data.runs.find(run => run.ai_review)
  const metrics = [
    { label: 'Needs your review', value: data.recommendations.filter(item => item.status === 'open').length, caption: 'See open issues', href: helpDeskHref('issues', preview) },
    { label: 'Orders in queue', value: waiting.length, caption: 'See orders waiting or being checked', href: helpDeskHref('checks', preview, { status: 'waiting' }) },
    { label: 'Recent reviews', value: data.runs.length, caption: 'Read completed reviews', href: helpDeskHref('reviews', preview) },
    { label: 'Needs a retry', value: failed.length, caption: 'See checks that could not finish', href: helpDeskHref('checks', preview, { status: 'failed' }) },
  ]

  return <HelpDeskFrame page={page} preview={preview} actions={<>
    <button className="btn btn-secondary" disabled={busy || data.setupRequired} onClick={() => void command('refresh')}><RefreshCw size={14}/>Refresh</button>
    {(page === 'overview' || page === 'checks') && <button className="btn btn-primary" disabled={busy || !data.enabled || data.setupRequired} onClick={() => void command('queue')}>Check open orders</button>}
  </>}>
    {data.setupRequired && <p className="notice">The order checks need their database setup before they can run.</p>}
    {error && <p className="intel-error" role="alert">{error}</p>}
    {notice && <p className="intel-notice" role="status">{notice}</p>}

    {page === 'overview' && <>
      <div className="intel-summary"><div><span className="intel-symbol"><Bot size={24}/></span><div><h2>Keep track of your restaurant</h2><p>Open a card to see the orders, issues or reviews behind the number. The latest records are shown first.</p><div className="intel-tags"><span><Activity size={13}/>{data.enabled ? 'Order checks are on' : 'Order checks are paused'}</span></div></div></div>
        <button className="btn btn-secondary" disabled={busy || data.setupRequired} onClick={() => void command('configure')}>{data.enabled ? 'Pause checks' : 'Turn on checks'}</button></div>
      <div className="metric-grid intel-metrics">{metrics.map(metric => <Link href={metric.href} key={metric.label} className="metric-card help-desk-card">
        <div className="metric-top">{metric.label}<span className="metric-icon"><ArrowRight size={16}/></span></div>
        <strong className="metric-value num">{metric.value}</strong><div className="metric-foot">{metric.caption}</div>
      </Link>)}</div>
      {latestAi?.ai_review && <AiReviewPanel review={latestAi.ai_review} orderId={latestAi.order_id} preview={preview} />}
    </>}

    {page === 'issues' && <section className="panel"><div className="panel-heading"><div><h2>Issues to check</h2><p>Read the facts, record your decision or ask a team member to check an issue.</p></div></div>
      <div className="intel-filter filter-tabs">{(Object.keys(issueLabels) as (keyof typeof issueLabels)[]).map(key => <button key={key} aria-pressed={filter === key} className={`filter-tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{issueLabels[key]}</button>)}</div>
      <div className="intel-findings">{visibleIssues.length ? visibleIssues.map(item => <article key={item.id} className="intel-finding" id={`issue-${item.id}`}>
        <div className="row space-between"><span className={`badge ${item.severity === 'high' ? 'badge-red' : 'badge-gray'}`}>{item.severity === 'high' ? 'Urgent' : 'Check suggested'}</span><span className="intel-ref">Order {orderRef(item.order_id)}</span></div>
        <h3>{item.title}</h3><p>{item.summary}</p>
        <details><summary>Why this was flagged <ChevronDown size={14}/></summary><ul>{item.evidence.map((e, index) => <li key={index}><strong>{e.label}</strong><p>{e.value}</p><small><LocalDateTime value={e.observed_at}/></small></li>)}</ul></details>
        <div className="intel-finding-footer"><span className="badge badge-gray">{issueLabels[item.status]}</span><div className="help-desk-actions">
          <Link className="btn btn-secondary btn-sm" href={helpDeskHref('alerts', preview, { issue: item.id })}><Bell size={13}/>Alert a team member</Link>
          {item.status === 'open' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => { setSelected(item); setNote('') }}>Review issue</button>}
        </div>{item.review_note && <p>{item.review_note}</p>}</div>
      </article>) : <p className="intel-empty">There are no issues in this list.</p>}</div>
    </section>}

    {page === 'checks' && <section className="panel"><div className="panel-heading"><div><h2>Order check list</h2><p>Retry a check when it could not finish.</p></div></div>
      <nav className="intel-filter filter-tabs" aria-label="Check status">{(['waiting', 'failed', 'all'] as const).map(key => <Link key={key}
        className={`filter-tab ${checkFilter === key ? 'active' : ''}`} aria-current={checkFilter === key ? 'page' : undefined}
        href={helpDeskHref('checks', preview, { status: key })}>{key === 'waiting' ? 'In queue' : key === 'failed' ? 'Needs a retry' : 'All recent checks'}</Link>)}</nav>
      {!data.enabled && <p className="help-desk-note">Checks are paused. Turn them on from the help desk to retry an order.</p>}
      <div className="intel-findings">{visibleJobs.length ? visibleJobs.map(job => <article className="intel-finding help-desk-check" key={job.id}>
        <div><strong>Order {orderRef(job.order_id)}</strong><p>{checkLabels[job.status] ?? 'Waiting'} · {job.attempts} {job.attempts === 1 ? 'try' : 'tries'}</p></div>
        <LocalDateTime value={job.updated_at}/>{job.status === 'dead' && <button className="btn btn-secondary btn-sm" disabled={busy || !data.enabled} onClick={() => void command('queue', job.order_id)}>Try again</button>}
      </article>) : <p className="intel-empty">There are no orders in this list.</p>}</div>
    </section>}

    {page === 'reviews' && <section className="panel intel-runs"><div className="panel-heading"><div><h2>Completed reviews</h2><p>Choose an order to read its review. The latest 20 are shown here.</p></div></div>
      {data.runs.length ? data.runs.map(run => <ReviewDetails run={run} preview={preview} key={run.id}/>) : <p className="intel-empty">Completed reviews will appear here.</p>}
    </section>}

    <dialog ref={dialog} aria-labelledby="issue-review-title" className="intel-modal" onCancel={() => setSelected(null)}>
      {selected && <><div className="row space-between"><span className="eyebrow">Review this issue</span><button className="icon-button" aria-label="Close issue review" disabled={busy} onClick={() => setSelected(null)}><X size={18}/></button></div>
        <h2 id="issue-review-title">{selected.title}</h2><p>Add a note about what you checked.</p><label>Note (optional)<textarea rows={3} maxLength={500} value={note} disabled={busy} onChange={event => setNote(event.target.value)}/></label>
        {error && <p role="alert" className="intel-error">{error}</p>}
        <div className="intel-modal-actions"><button className="btn btn-secondary" disabled={busy} onClick={() => void review('dismissed')}>Dismiss issue</button><button className="btn btn-primary" disabled={busy} onClick={() => void review('acknowledged')}><Check size={15}/>Mark checked</button></div></>}
    </dialog>
  </HelpDeskFrame>
}
