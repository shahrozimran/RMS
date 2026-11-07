'use client'

import { useCallback, useEffect, useState } from 'react'
import { Archive, BookOpen, FileText, LoaderCircle, Plus, ShieldCheck } from 'lucide-react'
import { agentCatalog } from '@/lib/agents/catalog'
import type { KnowledgeDocument, KnowledgeState } from '@/lib/agents/rag-contracts'
import LocalDateTime from '@/components/ui/LocalDateTime'

const sampleState: KnowledgeState = {
  installed: true, keyConfigured: true, enabled: true, usedToday: 1, dailyLimit: 30,
  model: 'Gemini 3.1 Flash Lite',
  documents: [{ id: 'sample-stock-policy', title: 'Stock shortage handoff', scope: 'inventory', chunk_count: 1, created_at: '2026-11-06T12:00:00Z' }],
}

export default function KnowledgeLibrary({ preview }: { preview: boolean }) {
  const [state, setState] = useState<KnowledgeState | null>(preview ? sampleState : null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [scope, setScope] = useState<KnowledgeDocument['scope']>('all')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const response = await fetch('/api/agents/knowledge', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load the knowledge library.')
    return result.data as KnowledgeState
  }, [])

  useEffect(() => {
    if (preview) return
    let active = true
    load().then(result => { if (active) setState(result) }).catch(() => {
      if (active) setError('Unable to load the knowledge library. Reopen this tab to retry.')
    })
    return () => { active = false }
  }, [load, preview])

  async function readFile(file: File) {
    setError('')
    try {
      if (!/\.(txt|md)$/i.test(file.name) || file.size > 144000) throw new Error('Choose a small .txt or .md document.')
      const body = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      if (body.length > 36000 || body.includes('\0')) throw new Error('Use UTF-8 text under 36,000 characters.')
      setText(body)
      if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, '').slice(0, 120))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read this document.') }
  }

  async function submit(action: 'import' | 'archive' | 'configure', id?: string) {
    if (!state) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (preview) {
        if (action === 'configure') setState({ ...state, enabled: !state.enabled })
        if (action === 'archive') {
          const documents = state.documents.filter(document => document.id !== id)
          setState({ ...state, documents, enabled: state.enabled && documents.length > 0 })
        }
        if (action === 'import') setState({ ...state, documents: [{ id: crypto.randomUUID(), title, scope, chunk_count: 1, created_at: new Date().toISOString() }, ...state.documents] })
      } else {
        const body = action === 'import' ? { action, title, scope, text, shareWithProvider: consent }
          : action === 'archive' ? { action, id } : { action, enabled: !state.enabled }
        const response = await fetch('/api/agents/knowledge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to update the knowledge library.')
        setState(await load())
      }
      if (action === 'import') { setTitle(''); setText(''); setConsent(false) }
      setNotice(action === 'import' ? 'Document added to the knowledge library.' : action === 'archive' ? 'Document removed from future retrieval.' : 'AI review settings saved.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update the knowledge library.') }
    finally { setBusy(false) }
  }

  return <div className="knowledge-library">
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Reference library</span><h2>Give the agents your playbook</h2>
        <p>Add SOPs, training guides and operating policies. Each specialist retrieves excerpts relevant to its role.</p></div><BookOpen size={21} /></div>
      <div className="knowledge-body">
        {error && <p className="intel-error" role="alert">{error}</p>}
        {notice && <p className="intel-notice" role="status">{notice}</p>}
        {!state && !error && <p role="status">Loading your knowledge library…</p>}
        {state && !state.installed && <p className="notice">Apply database migration 015 to install the knowledge library.</p>}
        {state?.installed && <>
          <div className="knowledge-mode">
            <div><span className={`badge ${state.enabled ? 'badge-green' : 'badge-gray'}`}>{state.enabled ? 'AI reviews enabled' : 'AI reviews paused'}</span>
              <strong>Gemini 3.1 Flash Lite</strong><small>{state.usedToday} of {state.dailyLimit} AI reviews used today · resets at 00:00 UTC</small></div>
            <button className="btn btn-secondary" disabled={busy || (!state.enabled && (!state.keyConfigured || !state.documents.length))} onClick={() => void submit('configure')}>
              {state.enabled ? 'Pause AI reviews' : 'Enable AI reviews'}
            </button>
          </div>
          {!state.keyConfigured && <p className="notice">Set the server OpenRouter key to index documents. The worker also needs that key to run AI reviews.</p>}
          <form className="knowledge-form" onSubmit={event => { event.preventDefault(); void submit('import') }}>
            <div className="knowledge-form-row">
              <label className="input-group"><span className="input-label">Document title</span><input className="input" value={title} required maxLength={120} onChange={event => setTitle(event.target.value)} placeholder="Kitchen opening checklist" /></label>
              <label className="input-group"><span className="input-label">Retrieval team</span><select className="input" value={scope} onChange={event => setScope(event.target.value as KnowledgeDocument['scope'])}>
                <option value="all">All seven agents</option>{agentCatalog.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select></label>
            </div>
            <label className="input-group"><span className="input-label">Load a text or Markdown file</span><input className="input" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={event => {
              const file = event.target.files?.[0]
              if (file) void readFile(file)
              event.target.value = ''
            }} /></label>
            <label className="input-group"><span className="input-label">Reference text</span><textarea className="input" rows={7} minLength={40} maxLength={36000} required value={text} onChange={event => setText(event.target.value)} placeholder="Paste a policy, checklist or training guide…" /></label>
            <label className="knowledge-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required />
              <span>{preview ? 'Allow indexing for this sample.' : 'I approve sending this text to OpenRouter for indexing and relevant excerpts for AI reviews. I removed credentials and personal information.'}</span></label>
            <button className="btn btn-primary" disabled={busy || !state.keyConfigured || !consent || title.trim().length < 1 || text.trim().length < 40}>
              {busy ? <LoaderCircle className="animate-spin" size={15} /> : <Plus size={15} />} {busy ? 'Working…' : 'Index document'}
            </button>
          </form>
        </>}
      </div>
    </section>
    <aside className="panel">
      <div className="panel-heading"><div><h2>Indexed sources</h2><p>Archiving removes a source from future retrieval. Published reviews retain their cited excerpts.</p></div><ShieldCheck size={19} /></div>
      <div className="knowledge-body knowledge-list">
        {state?.documents.length ? state.documents.map(document => <article key={document.id} className="knowledge-doc">
          <FileText size={19} /><div><strong>{document.title}</strong><small>{document.scope === 'all' ? 'All agents' : agentCatalog.find(agent => agent.id === document.scope)?.name} · {document.chunk_count} {document.chunk_count === 1 ? 'excerpt' : 'excerpts'}</small><small><LocalDateTime value={document.created_at} /></small></div>
          <button className="icon-button" title="Archive source" aria-label={`Archive ${document.title}`} disabled={busy} onClick={() => void submit('archive', document.id)}><Archive size={15} /></button>
        </article>) : <p className="muted">Sources appear here after indexing.</p>}
      </div>
    </aside>
  </div>
}
