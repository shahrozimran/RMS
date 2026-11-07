import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { PermissionError } from '@/lib/auth/rbac'
import type { AgentOverview, Recommendation } from './contracts'

const issueFields = 'id,order_id,run_id,kind,severity,title,summary,evidence,context_hash,status,expires_at,created_at,review_note'

export async function requireAgentAdmin() {
  const session=await getSession()
  if(!session) throw new PermissionError('Unauthorized',401)
  if(session.role!=='Admin'||session.authType!=='admin') throw new PermissionError('Administrator access required')
  return session
}

export async function agentOverview(): Promise<AgentOverview> {
  await requireAgentAdmin()
  const db=await createAdminClient()
  const results=await Promise.all([
    db.from('system_settings').select('value').eq('key','agent_review_enabled').maybeSingle(),
    db.from('agent_jobs').select('id,order_id,status,attempts,last_error,updated_at').order('updated_at',{ascending:false}).limit(100),
    recentRuns(db),
    db.from('agent_recommendations').select(issueFields).order('created_at',{ascending:false}).limit(100),
  ])
  const errors=results.map(result=>result.error).filter(Boolean)
  if(errors.some(error=>error?.code==='42P01'||error?.code==='PGRST205')) {
    return {enabled:false,setupRequired:true,jobs:[],runs:[],recommendations:[]}
  }
  if(errors.length) throw errors[0]
  return { enabled:results[0].data?.value===true,setupRequired:false,
    jobs:results[1].data||[],runs:(results[2].data||[]) as AgentOverview['runs'],
    recommendations:(results[3].data||[]) as AgentOverview['recommendations'] }
}

export async function helpDeskIssue(id: string): Promise<Recommendation | null> {
  await requireAgentAdmin()
  const db = await createAdminClient()
  const { data, error } = await db.from('agent_recommendations').select(issueFields).eq('id', id).maybeSingle()
  if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error
  return data as Recommendation | null
}

async function recentRuns(db: Awaited<ReturnType<typeof createAdminClient>>) {
  const fields = 'id,order_id,summary,policy_version,messages,created_at'
  const [history, latestAi] = await Promise.all([
    db.from('agent_runs').select(fields).order('created_at', { ascending: false }).limit(20),
    db.from('agent_runs').select('id,ai_review').not('ai_review', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (latestAi.error && !['42703', 'PGRST204', '42P01', 'PGRST205'].includes(latestAi.error.code)) throw latestAi.error
  return { ...history, data: history.data?.map(run => ({
    ...run, ai_review: latestAi.data && run.id === latestAi.data.id ? latestAi.data.ai_review : null,
  })) }
}
