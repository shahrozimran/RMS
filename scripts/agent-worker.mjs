import { createClient } from '@supabase/supabase-js'
import { evaluateOrder } from '../lib/agents/engine.ts'
import { jobSchema } from '../lib/agents/contracts.ts'

// Run with Node.js 24. Credentials are loaded by --env-file, never logged.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Configure the RMS server environment before starting the agent worker.'); process.exit(1) }
const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const once = process.argv.includes('--once')
let stopping = false
process.on('SIGINT',()=>{stopping=true})
process.on('SIGTERM',()=>{stopping=true})
const pause = async ms => { for(let remaining=ms;remaining>0&&!stopping;remaining-=250) await new Promise(resolve=>setTimeout(resolve,Math.min(250,remaining))) }

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
    const {data:completed,error:finishError}=await db.rpc('complete_agent_job',{p_job:job.id,p_lease:job.lease_token,p_generation:job.generation,p_hash:job.context_hash,p_output:output})
    if(finishError) throw new Error('WORKER_FAILURE')
    console.log(JSON.stringify({job:job.id,status:completed?'completed':'superseded',findings:output.findings.length}))
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
