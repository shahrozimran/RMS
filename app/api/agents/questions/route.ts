import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgentAdmin } from '@/lib/agents/server'
import { answerQuestion, questionInput, questionSource, type QuestionEntry } from '@/lib/agents/questions'
import { createOpenRouter, hasOpenRouterKey } from '@/lib/agents/openrouter'
import { knowledgeHitSchema } from '@/lib/agents/rag-contracts'
import { redactContacts } from '@/lib/agents/rag'
import { createAdminClient } from '@/lib/supabase/server'
import { ApiError, apiError } from '@/lib/api/errors'
import { readJson } from '@/lib/api/body'
import { rateLimit } from '@/lib/api/rate-limit'

export const maxDuration = 40
const fields = 'id,question,status,answer,sources,model,created_at,finished_at'
const migrationMissing = (error?: { code?: string } | null) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code ?? '')

export async function GET() {
  try {
    const actor = await requireAgentAdmin()
    const db = await createAdminClient()
    const { data, error } = await db.from('agent_questions').select(fields).eq('asked_by', actor.id).order('created_at', { ascending: false }).limit(50)
    if (error && migrationMissing(error)) return NextResponse.json({ data: [], installed: false, ai: false })
    if (error) throw error
    return NextResponse.json({ data, installed: true, ai: hasOpenRouterKey() })
  } catch (error) { return apiError(error) }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAgentAdmin()
    const input = questionInput.safeParse(await readJson(request))
    if (!input.success || input.data.question.includes('\0')) throw new ApiError('Enter a question between 5 and 800 characters.')
    const question = redactContacts(input.data.question).slice(0, 800)
    const db = await createAdminClient()
    const existing = await db.from('agent_questions').select(fields).eq('id', input.data.id).eq('asked_by', actor.id).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) {
      if (existing.data.question !== question) throw new ApiError('This question was already submitted.', 409)
      return NextResponse.json({ data: existing.data })
    }
    await rateLimit(`help-question:${actor.id}`, 12, 3600)
    const { error: insertError } = await db.from('agent_questions').insert({ id: input.data.id, asked_by: actor.id, question })
    if (insertError) throw insertError

    let result: Pick<QuestionEntry, 'status' | 'answer' | 'sources' | 'model'> = {
      status: 'failed', answer: 'I could not look up the answer. Try asking again.', sources: [], model: null,
    }
    try {
      const signal = AbortSignal.timeout(28000)
      const model = hasOpenRouterKey() ? createOpenRouter() : null
      const args = { p_actor: actor.id, p_question: question }
      const [{ data, error }, inventory] = await Promise.all([
        db.rpc('help_desk_question_facts', args).abortSignal(signal),
        db.rpc('inventory_question_facts', args).abortSignal(signal),
      ])
      if (error) throw new Error('QUESTION_FACTS_FAILED')
      const currentStock = inventory.error ? [] : z.array(questionSource).max(6).parse(inventory.data)
      const sources = [...currentStock, ...z.array(questionSource).max(8).parse(data)].slice(0, 8)
      try {
        if (model) {
          const [embedding] = await model.embed([question], signal)
          const retrieved = await db.rpc('search_agent_knowledge', { p_queries: [{ role: 'all', terms: question, embedding }] }).abortSignal(signal)
          if (retrieved.error) throw new Error('QUESTION_RETRIEVAL_FAILED')
          const hits = z.array(knowledgeHitSchema).max(2).parse(retrieved.data)
          sources.splice(currentStock.length, 0, ...hits.map(hit => ({ id: `D-${hit.id}`, kind: 'document' as const,
            title: hit.title, excerpt: hit.body, documentId: hit.document_id, chunk: hit.position })))
        }
        result = await answerQuestion(question, sources, model, signal)
      } catch {
        result = await answerQuestion(question, sources, null, signal)
        if (result.status === 'no_evidence') result = { ...result, status: 'failed', answer: 'The answer service could not finish. Try asking again.' }
      }
    } catch { /* Save the failure with the original question. */ }

    const saved = await db.from('agent_questions').update({ ...result, finished_at: new Date().toISOString() })
      .eq('id', input.data.id).eq('asked_by', actor.id).eq('status', 'pending').select(fields).single()
    if (saved.error) throw saved.error
    return NextResponse.json({ data: saved.data }, { status: 201 })
  } catch (error) {
    if (migrationMissing(error as { code?: string })) return apiError(new ApiError('Question history needs database migration 016.', 503))
    return apiError(error)
  }
}
