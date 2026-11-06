import { NextResponse } from 'next/server'
import { z } from 'zod'
import { agentOverview,requireAgentAdmin } from '@/lib/agents/server'
import { createAdminClient } from '@/lib/supabase/server'
import { readJson } from '@/lib/api/body'
import { apiError } from '@/lib/api/errors'
import { rateLimit } from '@/lib/api/rate-limit'

const commandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('configure'),enabled:z.boolean()}).strict(),
  z.object({action:z.literal('queue'),order_id:z.uuid().optional()}).strict(),
])
export async function GET() {
  try { return NextResponse.json({data:await agentOverview()},{headers:{'Cache-Control':'no-store'}}) }
  catch(error) { return apiError(error) }
}
export async function POST(request:Request) {
  try {
    const actor=await requireAgentAdmin()
    const parsed=commandSchema.safeParse(await readJson(request))
    if(!parsed.success) return NextResponse.json({error:'Invalid agent command'},{status:400})
    await rateLimit(`agent-command:${actor.id}`,20,60)
    const db=await createAdminClient()
    const result=parsed.data.action==='configure'
      ? await db.rpc('set_agent_review_enabled',{p_actor:actor.id,p_enabled:parsed.data.enabled})
      : await db.rpc('queue_agent_reviews',{p_actor:actor.id,p_order:parsed.data.order_id||null})
    if(result.error) throw result.error
    return NextResponse.json({data:result.data},{headers:{'Cache-Control':'no-store'}})
  }catch(error) { return apiError(error) }
}
