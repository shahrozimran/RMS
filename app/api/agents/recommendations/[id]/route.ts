import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgentAdmin } from '@/lib/agents/server'
import { createAdminClient } from '@/lib/supabase/server'
import { readJson } from '@/lib/api/body'
import { apiError } from '@/lib/api/errors'
import { rateLimit } from '@/lib/api/rate-limit'

const reviewSchema=z.object({decision:z.enum(['acknowledged','dismissed']),note:z.string().trim().max(500).default('')}).strict()
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireAgentAdmin()
    const {id}=await params
    if(!z.uuid().safeParse(id).success) return NextResponse.json({error:'Invalid recommendation ID'},{status:400})
    const parsed=reviewSchema.safeParse(await readJson(request))
    if(!parsed.success) return NextResponse.json({error:'Invalid review'},{status:400})
    await rateLimit(`agent-review:${actor.id}`,60,60)
    const db=await createAdminClient()
    const {data,error}=await db.rpc('review_agent_recommendation',{p_actor:actor.id,p_id:id,p_decision:parsed.data.decision,p_note:parsed.data.note})
    if(error) throw error
    return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}})
  }catch(error) { return apiError(error) }
}
