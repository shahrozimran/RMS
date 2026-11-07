'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, LoaderCircle, Send } from 'lucide-react'
import type { QuestionEntry } from '@/lib/agents/questions'
import LocalDateTime from '@/components/ui/LocalDateTime'
import HelpDeskFrame from './HelpDeskFrame'

function practiceAnswer(question: string, id: string): QuestionEntry {
  const now = new Date().toISOString()
  const stock = /stock|bun|shortage|ingredient/i.test(question)
  const orders = /order|ticket/i.test(question)
  const title = stock ? 'Sample stock shortage policy' : 'Sample open orders'
  const answer = stock ? 'Count the buns first. Ask the duty lead to check any substitute before offering it to the guest.'
    : orders ? 'The sample records show four open orders.' : 'There is no matching sample information for this question.'
  return { id, question, answer, status: stock || orders ? 'answered' : 'no_evidence', model: null,
    created_at: now, finished_at: now, sources: stock || orders ? [{ id: 'practice', kind: stock ? 'document' : 'live', title, excerpt: answer }] : [] }
}

export default function AskWorkspace({ preview = false }: { preview?: boolean }) {
  const [entries, setEntries] = useState<QuestionEntry[]>([])
  const [question, setQuestion] = useState('')
  const [installed, setInstalled] = useState(preview)
  const [ai, setAi] = useState(preview)
  const [loading, setLoading] = useState(!preview)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef<{ question: string; id: string } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/agents/questions', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not open past questions.')
    return result as { data: QuestionEntry[]; installed: boolean; ai: boolean }
  }, [])

  useEffect(() => {
    if (preview) return
    let active = true
    load().then(result => {
      if (!active) return
      setEntries(result.data); setInstalled(result.installed); setAi(result.ai)
    }).catch(() => { if (active) setError('Could not open past questions. Refresh to try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [preview, load])

  async function ask() {
    const text = question.trim()
    if (text.length < 5 || busy) return
    if (requestId.current?.question !== text) requestId.current = { question: text, id: crypto.randomUUID() }
    const id = requestId.current.id
    setBusy(true); setError('')
    try {
      let entry = preview ? practiceAnswer(text, id) : null
      if (!entry) {
        const response = await fetch('/api/agents/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, question: text }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not save this question.')
        entry = result.data as QuestionEntry
      }
      setEntries(old => [entry, ...old.filter(item => item.id !== entry.id)].slice(0, 50))
      setQuestion(''); requestId.current = null
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not ask the question.') }
    finally { setBusy(false) }
  }

  async function refresh() {
    setError('')
    try { const result = await load(); setEntries(result.data); setInstalled(result.installed); setAi(result.ai) }
    catch { setError('Could not refresh past questions.') }
  }

  return <HelpDeskFrame page="ask" preview={preview}>
    <section className="panel"><div className="panel-heading"><div><h2>What would you like to know?</h2><p>For example, “How many orders are open?” or “What should we do when stock runs low?”</p></div><BookOpen size={20}/></div>
      <div className="help-desk-body">
        {error && <p className="intel-error" role="alert">{error}</p>}
        {loading && <p role="status">Opening your questions…</p>}
        {!loading && !installed && !error && <p className="notice">Saved questions need database setup. Ask your system administrator to install migration 016.</p>}
        {installed && <form className="help-desk-form" onSubmit={event => { event.preventDefault(); void ask() }}>
          {!ai && <p className="notice">Source lookup is available. AI explanations become available when the OpenRouter key is set.</p>}
          <label className="input-group"><span className="input-label">Your question</span><textarea className="input" rows={3} required minLength={5} maxLength={800} value={question} disabled={busy} onChange={event => setQuestion(event.target.value)} placeholder="Type a question about your restaurant…"/></label>
          <p className="help-desk-note">Use restaurant questions and leave out passwords, customer names and contact details.</p>
          <button className="btn btn-primary" disabled={busy || question.trim().length < 5}>{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Send size={16}/>} {busy ? 'Looking up your answer…' : 'Ask'}</button>
        </form>}
      </div>
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Your questions</h2><p>Questions and their answers are saved here. The latest 50 are shown.</p></div>{!preview && <button className="btn btn-secondary btn-sm" onClick={() => void refresh()} disabled={busy || loading}>Refresh</button>}</div>
      <div className="help-desk-body help-desk-list">{entries.length ? entries.map(entry => <article key={entry.id} className="intel-finding help-desk-answer">
        <h3>{entry.question}</h3><p>{entry.answer || 'This question is still being checked. If it does not finish, ask again.'}</p>
        <small><LocalDateTime value={entry.created_at} mode="date"/> · <LocalDateTime value={entry.created_at}/> · {preview ? 'Sample answer' : entry.model ? 'AI answer' : entry.status === 'answered' ? 'From saved sources' : entry.status === 'pending' ? 'Waiting for answer' : 'Lookup result'}</small>
        {entry.sources.length > 0 && <details><summary>Where this came from ({entry.sources.length})</summary><ul>{entry.sources.map(source => <li key={source.id}><strong>{source.title}</strong><p>{source.excerpt}</p></li>)}</ul></details>}
      </article>) : <p className="muted">Your first question will appear here.</p>}</div>
    </section>
  </HelpDeskFrame>
}
