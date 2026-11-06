'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, Bot, Check, ChevronDown, Clock3, Layers3, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { agentCatalog } from '@/lib/agents/catalog'
import type { AgentOverview, Recommendation } from '@/lib/agents/contracts'
import LocalDateTime from '@/components/ui/LocalDateTime'
import { pollVisible } from '@/lib/utils/poll'
import './agents.css'

export default function AgentsWorkspace({initial,preview=false}:{initial:AgentOverview;preview?:boolean}) {
  const [data,setData]=useState(initial)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [filter,setFilter]=useState('open')
  const [selected,setSelected]=useState<Recommendation|null>(null)
  const [note,setNote]=useState('')
  const reviewDialog=useRef<HTMLDialogElement>(null)
  const requestSequence=useRef(0)
  const invalidateRequests=useCallback(()=>{requestSequence.current++},[])
  useEffect(()=>{
    const dialog=reviewDialog.current
    if(selected&&!dialog?.open)dialog?.showModal()
    if(!selected&&dialog?.open)dialog.close()
  },[selected])

  const refresh=useCallback(async()=>{
    if(preview)return
    const sequence=++requestSequence.current
    const response=await fetch('/api/agents',{cache:'no-store'})
    const result=await response.json()
    if(!response.ok)throw new Error(result.error||'Unable to refresh agent reviews.')
    if(sequence===requestSequence.current)setData(result.data)
  },[preview])
  useEffect(()=>{
    if(preview||busy)return
    let active=true
    const stop=pollVisible(async()=>{try{await refresh()}catch{if(active)setError('The review feed could not refresh. Please try again.')}},15000)
    return ()=>{active=false;invalidateRequests();stop()}
  },[preview,refresh,busy,invalidateRequests])

  async function command(action:'configure'|'queue'|'refresh') {
    requestSequence.current++;setBusy(true);setError('');setNotice('')
    try {
      if(preview){
        if(action==='configure')setData(old=>({...old,enabled:!old.enabled}))
        if(action==='queue')setData(initial)
        setNotice(action==='queue'?'Sample findings restored. This demonstration uses no live restaurant data.':'Sample workspace updated.')
      }else{
        if(action!=='refresh'){
          const response=await fetch('/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='configure'?{action,enabled:!data.enabled}:{action})})
          const result=await response.json()
          if(!response.ok)throw new Error(result.error||'Unable to update agent reviews.')
          setNotice(action==='queue'?`${result.data} open order(s) queued for the worker.`:'Review settings updated.')
        }
        await refresh()
      }
    }catch(e){setError(e instanceof Error?e.message:'Unable to update reviews.')}finally{setBusy(false)}
  }
  async function review(decision:'acknowledged'|'dismissed') {
    if(!selected)return
    requestSequence.current++;setBusy(true);setError('');setNotice('')
    try {
      let status:string=decision
      if(preview){setData(old=>({...old,recommendations:old.recommendations.map(r=>r.id===selected.id?{...r,status:decision,review_note:note}:r)}))}
      else{
        const response=await fetch(`/api/agents/recommendations/${selected.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,note})})
        const result=await response.json()
        if(!response.ok)throw new Error(result.error||'Unable to save your review.')
        status=result.data.status
        await refresh()
      }
      setSelected(null);setNote('')
      setNotice(status==='stale'?'Source data changed or expired. This finding was marked stale; queue a fresh review.':`Finding ${decision}. Your review was recorded.`)
    }catch(e){setError(e instanceof Error?e.message:'Unable to save the review.')}finally{setBusy(false)}
  }
  const open=data.recommendations.filter(r=>r.status==='open')
  const visible=filter==='all'?data.recommendations:data.recommendations.filter(r=>r.status===filter)
  const pending=data.jobs.filter(j=>j.status==='pending'||j.status==='processing').length
  const failed=data.jobs.filter(j=>j.status==='dead').length
  return <div className="intel-workspace animate-in">
    <div className="workspace-title"><div><span className="eyebrow">Operations intelligence</span><h1>Clear signals. Better decisions.</h1><p>Review operational findings and the facts behind them, with your team in control.</p></div><div className="workspace-title-actions"><button className="btn btn-secondary" onClick={()=>void command('refresh')} disabled={busy}><RefreshCw size={14}/>Refresh</button><button className="btn btn-primary" onClick={()=>void command('queue')} disabled={busy||!data.enabled||data.setupRequired}><Layers3 size={14}/>Review open orders</button></div></div>
    {preview&&<div className="notice">Interactive sample · all evidence and review actions are demonstration data.</div>}
    {data.setupRequired&&<div className="intel-alert" role="status"><ShieldCheck size={20}/><div><strong>Finish the intelligence setup</strong><p>The review service needs its database installation before it can process live orders.</p></div></div>}
    {error&&<p role="alert" className="intel-error">{error}</p>}
    {notice&&<p role="status" className="intel-notice">{notice}</p>}
    <div className="intel-summary"><div><span className="intel-symbol"><Bot size={24}/></span><div><span className="eyebrow">Shared evidence. Bounded decisions.</span><h2>Your operations review desk.</h2><p>Order, inventory and supervisor rules work together to surface stock pressure, recipe gaps and orders that need attention.</p><div className="intel-tags"><span><ShieldCheck size={12}/>Rule-based advisory reviews</span><span><Activity size={12}/>{data.enabled?'Reviews enabled':'Reviews paused'}</span><span><Clock3 size={12}/>Findings expire after 15 minutes</span></div></div></div><button className="btn btn-secondary" disabled={busy||data.setupRequired} onClick={()=>void command('configure')}>{data.enabled?'Pause reviews':'Enable reviews'}<ArrowRight size={14}/></button></div>
    <div className="metric-grid intel-metrics">{[{label:'Needs your review',value:open.length,caption:'In the latest 100 findings'},{label:'Orders in queue',value:pending,caption:'Pending or being processed'},{label:'Recent analyses',value:data.runs.length,caption:'Latest 20 completed runs'},{label:'Needs a retry',value:failed,caption:'Jobs that exhausted retries'}].map(m=><div className="metric-card" key={m.label}><div className="metric-top">{m.label}<span className="metric-icon"><Activity size={15}/></span></div><strong className="metric-value num">{m.value}</strong><div className="metric-foot">{m.caption}</div></div>)}</div>
    <div className="intel-columns"><section className="panel"><div className="panel-heading"><div><h2>Recommendations, with receipts.</h2><p>Acknowledging a finding records your review. It does not change orders, stock or prices.</p></div></div><div className="intel-filter filter-tabs">{['open','acknowledged','dismissed','stale','all'].map(s=><button key={s} className={`filter-tab ${filter===s?'active':''}`} onClick={()=>setFilter(s)}>{s==='open'?'To review':s}</button>)}</div><div className="intel-findings">{visible.length?visible.map(r=><article className="intel-finding" key={r.id}><div className="row space-between"><span className={`badge ${r.severity==='high'?'badge-red':r.severity==='medium'?'badge-orange':'badge-blue'}`}>{r.severity} priority</span><span className="intel-ref">Order #{r.order_id.slice(-6).toUpperCase()}</span></div><h3>{r.title}</h3><p>{r.summary}</p><details><summary>View {r.evidence.length} evidence item(s)<ChevronDown size={13}/></summary><ul>{r.evidence.map((e,i)=><li key={`${e.source}:${e.entity_id}:${i}`}><strong>{e.label}</strong><p>{e.value}</p><small>{e.source} · <LocalDateTime value={e.observed_at}/></small></li>)}</ul></details><div className="intel-finding-footer"><span className="badge badge-gray">{r.status}</span>{r.status==='open'&&<button className="btn btn-secondary" onClick={()=>{setSelected(r);setNote('')}} disabled={busy}>Review finding<ArrowRight size={12}/></button>}{r.review_note&&<p>{r.review_note}</p>}</div></article>):<div className="intel-empty"><ShieldCheck size={32}/><h3>{filter==='open'?'No findings waiting here.':'No reviews in this view.'}</h3><p>Enable reviews, queue open orders and keep the worker running to receive evidence-backed findings.</p></div>}</div></section>
    <aside className="intel-agent-panel panel"><div className="panel-heading"><div><h2>Your agent team</h2><p>Three implemented roles. Four planned extensions.</p></div></div>{agentCatalog.map((agent,i)=><div className="intel-agent" key={agent.id}><span className="intel-agent-index">0{i+1}</span><div><div className="row space-between"><strong>{agent.name}</strong><span className={`badge ${agent.active?'badge-green':'badge-gray'}`}>{agent.active?'Implemented':'Planned'}</span></div><p>{agent.description}</p></div></div>)}<div className="intel-scope"><ShieldCheck size={17}/><p>Every recommendation is advisory. Live graph queries, document RAG, forecasts and autonomous execution are later delivery stages.</p></div></aside></div>
    <section className="panel intel-runs"><div className="panel-heading"><div><h2>The collaboration trail</h2><p>Structured agent messages retained with each completed analysis.</p></div></div>{data.runs.length?data.runs.map(run=><details key={run.id}><summary><span><strong>Order #{run.order_id.slice(-6).toUpperCase()}</strong><small>{run.policy_version} · <LocalDateTime value={run.created_at}/></small></span><ChevronDown size={16}/></summary><p>{run.summary}</p><div className="intel-messages">{run.messages.map((message,index)=><div key={`${message.sender}:${index}`}><span className="eyebrow">{message.sender} → {message.recipient}</span><strong>{message.objective}</strong><span className="badge badge-gray">{message.status.replaceAll('_',' ')}</span><ul>{message.constraints.map(c=><li key={c}>{c}</li>)}</ul></div>)}</div></details>):<div className="intel-empty"><Activity size={28}/><p>Completed analyses will appear here after the worker processes an order.</p></div>}</section>
    <dialog ref={reviewDialog} aria-labelledby="intel-review-heading" className="intel-modal" onCancel={()=>setSelected(null)} onClick={event=>{if(event.target===reviewDialog.current)setSelected(null)}}>{selected&&<><div className="row space-between"><span className="eyebrow">Record your decision</span><button className="icon-button" aria-label="Close finding review" disabled={busy} onClick={()=>setSelected(null)}><X size={18}/></button></div><h2 id="intel-review-heading">{selected.title}</h2><p>Acknowledgement confirms you have reviewed this finding. Your team carries out any operational action separately.</p><label>Review note <span>(optional)</span><textarea value={note} maxLength={500} rows={3} onChange={e=>setNote(e.target.value)} placeholder="What should your team know?" disabled={busy}/></label><div className="intel-modal-actions"><button className="btn btn-secondary" disabled={busy} onClick={()=>void review('dismissed')}>Dismiss finding</button><button className="btn btn-primary" disabled={busy} onClick={()=>void review('acknowledged')}><Check size={14}/>Acknowledge review</button></div></>}</dialog>
  </div>
}
