import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgentAdmin } from '@/lib/agents/server'
import { documentSchema, type KnowledgeState } from '@/lib/agents/rag-contracts'
import { CHAT_MODEL, createOpenRouter, hasOpenRouterKey } from '@/lib/agents/openrouter'
import { chunkKnowledge, redactContacts } from '@/lib/agents/rag'
import { createAdminClient } from '@/lib/supabase/server'
import { readJson } from '@/lib/api/body'
import { ApiError, apiError } from '@/lib/api/errors'
import { rateLimit } from '@/lib/api/rate-limit'

const commands = z.discriminatedUnion('action', [
  documentSchema,
  z.object({ action: z.literal('archive'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('configure'), enabled: z.boolean() }).strict(),
])

function missingMigration(error: { code?: string } | null) {
  return Boolean(error && ['42P01', 'PGRST205', 'PGRST202'].includes(error.code ?? ''))
}

export async function GET() {
  try {
    await requireAgentAdmin()
    const db = await createAdminClient()
    const [config, documents] = await Promise.all([
      db.from('agent_rag_control').select('enabled,budget_day,used').single(),
      db.from('agent_knowledge_documents').select('id,title,scope,chunk_count,created_at').is('archived_at', null).order('created_at', { ascending: false }).limit(100),
    ])
    const installed = !missingMigration(config.error) && !missingMigration(documents.error)
    if (installed && (config.error || documents.error)) throw config.error || documents.error
    const state: KnowledgeState = {
      installed, keyConfigured: hasOpenRouterKey(), model: CHAT_MODEL, dailyLimit: 30,
      enabled: installed && config.data?.enabled === true,
      usedToday: config.data?.budget_day === new Date().toISOString().slice(0, 10) ? config.data.used : 0,
      documents: installed ? (documents.data ?? []) as KnowledgeState['documents'] : [],
    }
    return NextResponse.json({ data: state })
  } catch (error) { return apiError(error) }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAgentAdmin()
    const parsed = commands.safeParse(await readJson(request))
    if (!parsed.success) throw new ApiError('Check the title, scope, text and sharing consent.')
    const command = parsed.data
    await rateLimit(`agent-knowledge:${command.action}:${actor.id}`, command.action === 'import' ? 8 : 20, 3600)
    const db = await createAdminClient()
    if (command.action === 'configure') {
      if (command.enabled && !hasOpenRouterKey()) throw new ApiError('Configure the server OpenRouter key first.', 503)
      const result = await db.rpc('set_agent_rag_enabled', { p_actor: actor.id, p_enabled: command.enabled })
      if (result.error) throw result.error
      return NextResponse.json({ data: result.data })
    }
    if (command.action === 'archive') {
      const result = await db.rpc('archive_agent_knowledge', { p_actor: actor.id, p_document: command.id })
      if (result.error) throw result.error
      if (!result.data) throw new ApiError('Document is already archived or unavailable.', 404)
      return NextResponse.json({ data: true })
    }
    if (!hasOpenRouterKey()) throw new ApiError('Configure the server OpenRouter key first.', 503)
    if (command.text.includes('\0') || command.title.includes('\0')) throw new ApiError('Use plain UTF-8 text or Markdown.')
    const title = redactContacts(command.title).slice(0, 120)
    const body = redactContacts(command.text)
    if (body.length > 36000) throw new ApiError('Document is too long after redaction.')
    const digest = createHash('sha256').update(body).digest('hex')
    const duplicate = await db.from('agent_knowledge_documents').select('id').eq('scope', command.scope).eq('digest', digest).is('archived_at', null).maybeSingle()
    if (duplicate.error) throw duplicate.error
    if (duplicate.data) throw new ApiError('This document is already indexed for that team.', 409)
    const chunks = chunkKnowledge(body)
    let embeddings: number[][]
    try { embeddings = await createOpenRouter().embed(chunks.map(chunk => `${title}\n${chunk}`)) }
    catch { throw new ApiError('OpenRouter could not index this document. Check the key and credits, then retry.', 502) }
    const result = await db.rpc('import_agent_knowledge', {
      p_actor: actor.id, p_title: title, p_scope: command.scope, p_digest: digest,
      p_chunks: chunks.map((chunk, index) => ({ body: chunk, embedding: embeddings[index] })),
    })
    if (result.error) throw result.error
    return NextResponse.json({ data: result.data }, { status: 201 })
  } catch (error) {
    if (missingMigration(error as { code?: string })) return apiError(new ApiError('Apply database migration 015 before using the knowledge library.', 503))
    // Database or provider payloads can contain submitted text. Only return known errors.
    if (error instanceof ApiError || error instanceof SyntaxError || (error instanceof Error && error.name === 'PermissionError')) return apiError(error)
    const code = (error as { code?: string }).code
    if (code === '23505') return apiError(new ApiError('This document is already indexed for that team.', 409))
    if (code === '22023') return apiError(new ApiError('The knowledge library rejected this change. Check the document limits and active sources.'))
    if (code === '42501') return apiError(new ApiError('Administrator access required.', 403))
    return apiError(new ApiError('Unable to update the knowledge library.', 500))
  }
}
