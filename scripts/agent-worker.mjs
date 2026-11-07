import { createClient } from '@supabase/supabase-js'
import { evaluateOrder } from '../lib/agents/engine.ts'
import { jobSchema } from '../lib/agents/contracts.ts'
import { createOpenRouter, hasOpenRouterKey } from '../lib/agents/openrouter.ts'
import { operationsFactsSchema } from '../lib/agents/rag-contracts.ts'
import { retrieveRoleKnowledge, runAiReview } from '../lib/agents/rag.ts'
import { supabaseUrl } from '../lib/supabase/connection.mjs'

// Run with Node.js 24. Credentials are loaded by --env-file, never logged.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Configure the RMS server environment before starting the agent worker.'); process.exit(1) }
const db = createClient(supabaseUrl(url),key,{auth:{persistSession:false,autoRefreshToken:false}})
const model = createOpenRouter()
const once = process.argv.includes('--once')
let stopping = false
process.on('SIGINT',()=>{stopping=true})
process.on('SIGTERM',()=>{stopping=true})
const pause = async ms => { for(let remaining=ms;remaining>0&&!stopping;remaining-=250) await new Promise(resolve=>setTimeout(resolve,Math.min(250,remaining))) }

async function reviewWithAi(job) {
  const signal = AbortSignal.timeout(43000)
  const { data, error } = await db.rpc('prepare_agent_ai_review', {
    p_job: job.id, p_lease: job.lease_token, p_generation: job.generation, p_has_key: hasOpenRouterKey(),
  }).abortSignal(signal)
  // Keep the original worker protocol usable until the new migration is applied.
  if (error && ['42883', 'PGRST202'].includes(error.code)) return null
  if (error) throw new Error('AI_PREPARATION_FAILED')
  if (data?.status === 'disabled') return null
  if (data?.status === 'key_missing' || data?.status === 'budget_reached') {
    return { revision: null, review: { status: 'fallback', reason: data.status } }
  }
  try {
    if (data?.status !== 'ready' || !Number.isInteger(data.revision)) throw new Error('INVALID_AI_CONTEXT')
    const facts = operationsFactsSchema.parse(data.facts)
    const hits = await retrieveRoleKnowledge(job, model, async queries => {
      const result = await db.rpc('search_agent_knowledge', { p_queries: queries }).abortSignal(signal)
      if (result.error) throw new Error('KNOWLEDGE_SEARCH_FAILED')
      return result.data
    }, signal)
    return { revision: data.revision, review: await runAiReview(job, facts, hits, model, signal) }
  } catch {
    return { revision: null, review: { status: 'fallback', reason: 'provider_unavailable' } }
  }
}

async function processNext() {
  const {data,error} = await db.rpc('claim_agent_job')
  if(error) { console.error('Unable to claim agent work. Check migration 014, connectivity and server credentials.'); return false }
  if(!data) return false
  const parsed=jobSchema.safeParse(data)
  const validLease = typeof data.id==='string' && typeof data.lease_token==='string' && Number.isInteger(data.generation)
  if(!parsed.success) {
    if(validLease) await db.rpc('fail_agent_job',{p_job:data.id,p_lease:data.lease_token,p_generation:data.generation,p_error:'INVALID_CONTEXT'})
    console.error('Agent job has unsupported source data; no recommendation was recorded.')
    return true
  }
  const job=parsed.data
  try {
    const output=evaluateOrder(job)
    const ai = await reviewWithAi(job)
    const lease = { p_job:job.id, p_lease:job.lease_token, p_generation:job.generation, p_hash:job.context_hash }
    const {data:completed,error:finishError}=ai
      ? await db.rpc('complete_agent_ai_job',{...lease,p_rules:output,p_revision:ai.revision,p_review:ai.review})
      : await db.rpc('complete_agent_job',{...lease,p_output:output})
    if(finishError) throw new Error('WORKER_FAILURE')
    console.log(JSON.stringify({job:job.id,status:completed?'completed':'superseded',findings:output.findings.length,ai:ai?.review.status??'off'}))
  }catch{
    await db.rpc('fail_agent_job',{p_job:job.id,p_lease:job.lease_token,p_generation:job.generation,p_error:'ENGINE_FAILURE'})
    console.error('Agent job failed and will follow the bounded retry policy.')
  }
  return true
}
do {
  let worked=false
  try { worked=await processNext() } catch { console.error('Agent worker connection unavailable; retrying without exposing request details.') }
  if(!once&&!stopping) await pause(worked?250:5000)
} while(!once&&!stopping)
