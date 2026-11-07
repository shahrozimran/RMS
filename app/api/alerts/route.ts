import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { requireAgentAdmin } from '@/lib/agents/server'
import { PermissionError } from '@/lib/auth/rbac'
import { createAdminClient } from '@/lib/supabase/server'
import { ApiError, apiError } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { rateLimit } from '@/lib/api/rate-limit'

const sendSchema = z.object({
  id: z.uuid(), recipient: z.uuid(), title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000), issue: z.uuid().nullable(),
}).strict()
const readSchema = z.object({ id: z.uuid() }).strict()
const fields = 'id,kind,title,message,issue_id,created_at,read_at,sender:users!team_alerts_sender_id_fkey(name),recipient:users!team_alerts_recipient_id_fkey(name)'
const empty = { installed: false, inbox: [], sent: [], team: [], issue: null }
const migrationMissing = (error: { code?: string } | null) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code ?? '')

async function signedIn() {
  const actor = await getSession()
  if (!actor) throw new PermissionError('Unauthorized', 401)
  return actor
}

export async function GET(request: NextRequest) {
  try {
    const actor = await signedIn()
    const db = await createAdminClient()
    if (request.nextUrl.searchParams.get('count') === 'true') {
      const { count, error } = await db.from('team_alerts').select('id', { count: 'exact', head: true })
        .eq('recipient_id', actor.id).is('read_at', null)
      if (error && !migrationMissing(error)) throw error
      return NextResponse.json({ count: count ?? 0 })
    }
    const inbox = db.from('team_alerts').select(fields).eq('recipient_id', actor.id).order('created_at', { ascending: false }).limit(50)
    if (actor.authType !== 'admin' || actor.role !== 'Admin') {
      const { data, error } = await inbox
      if (error && migrationMissing(error)) return NextResponse.json({ data: empty })
      if (error) throw error
      return NextResponse.json({ data: { ...empty, installed: true, inbox: data ?? [] } })
    }
    const issueId = z.uuid().safeParse(request.nextUrl.searchParams.get('issue'))
    const [received, sent, team, issue] = await Promise.all([
      inbox,
      db.from('team_alerts').select(fields).eq('sender_id', actor.id).order('created_at', { ascending: false }).limit(50),
      db.from('users').select('id,name,role:roles!inner(name)').eq('status', 'active').is('auth_user_id', null).neq('role.name', 'Admin').order('name').limit(1000),
      issueId.success ? db.from('agent_recommendations').select('id,title,summary').eq('id', issueId.data).maybeSingle() : { data: null, error: null },
    ])
    if (migrationMissing(received.error)) return NextResponse.json({ data: empty })
    for (const result of [received, sent, team, issue]) if (result.error) throw result.error
    return NextResponse.json({ data: { installed: true, inbox: received.data ?? [], sent: sent.data ?? [], team: team.data ?? [], issue: issue.data } })
  } catch (error) { return apiError(error) }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAgentAdmin()
    const input = sendSchema.safeParse(await readJson(request))
    if (!input.success || input.data.title.includes('\0') || input.data.message.includes('\0')) throw new ApiError('Choose a team member and enter a title and message.')
    await rateLimit(`send-alert:${actor.id}`, 20, 60)
    const db = await createAdminClient()
    const { data, error } = await db.rpc('send_team_alert', {
      p_actor: actor.id, p_id: input.data.id, p_recipient: input.data.recipient,
      p_title: input.data.title, p_message: input.data.message, p_issue: input.data.issue,
    })
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    if (migrationMissing(error as { code?: string })) return apiError(new ApiError('Alerts need database migration 016.', 503))
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await signedIn()
    const input = readSchema.safeParse(await readJson(request))
    if (!input.success) throw new ApiError('Choose an alert to mark as read.')
    const db = await createAdminClient()
    const { data, error } = await db.rpc('read_team_alert', { p_actor: actor.id, p_id: input.data.id })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return apiError(error) }
}
