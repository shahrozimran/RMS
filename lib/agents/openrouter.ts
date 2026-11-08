import { z } from 'zod'

export const CHAT_MODEL = 'google/gemini-3.1-flash-lite'
export const EMBEDDING_MODEL = 'google/gemini-embedding-001'
const dimensions = 768
const privacy = { data_collection: 'deny', zdr: true }

export function hasOpenRouterKey() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

export function createOpenRouter(key = process.env.OPENROUTER_API_KEY?.trim(), send = fetch) {
  async function request(endpoint: 'embeddings' | 'chat/completions', body: unknown, signal?: AbortSignal) {
    if (!key) throw new Error('OPENROUTER_KEY_MISSING')
    const timeout = AbortSignal.timeout(12000)
    const response = await send(`https://openrouter.ai/api/v1/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`OPENROUTER_HTTP_${response.status}`)
    const text = await response.text()
    if (text.length > 2100000) throw new Error('OPENROUTER_RESPONSE_TOO_LARGE')
    return JSON.parse(text) as unknown
  }

  return {
    async embed(input: string[], signal?: AbortSignal) {
      if (!input.length || input.length > 45 || input.some(value => value.length > 2600)) throw new Error('INVALID_EMBEDDING_INPUT')
      const result = z.object({ data: z.array(z.object({
        index: z.number().int().nonnegative(),
        embedding: z.array(z.number().finite().min(-100).max(100)).length(dimensions),
      })).length(input.length) }).parse(await request('embeddings', {
        model: EMBEDDING_MODEL, input, dimensions, encoding_format: 'float', provider: privacy,
      }, signal))
      return result.data.sort((a, b) => a.index - b.index).map((row, index) => {
        if (row.index !== index || !row.embedding.some(value => value !== 0)) throw new Error('INVALID_EMBEDDING_RESULT')
        return row.embedding
      })
    },
    async complete({ system, data, schema, maxTokens, signal }: {
      system: string; data: unknown; schema: object; maxTokens: number; signal?: AbortSignal
    }) {
      const content = JSON.stringify(data)
      if (content.length > 30000) throw new Error('AI_CONTEXT_TOO_LARGE')
      const response = z.object({ choices: z.array(z.object({
        finish_reason: z.literal('stop'), message: z.object({ content: z.string().max(15000) }),
      })).length(1) }).parse(await request('chat/completions', {
        model: CHAT_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content }],
        response_format: { type: 'json_schema', json_schema: { name: 'rms_review', strict: true, schema } },
        max_tokens: maxTokens,
        reasoning: { effort: 'minimal', exclude: true },
        provider: { ...privacy, require_parameters: true, max_price: { prompt: 0.30, completion: 1.60 } },
      }, signal))
      return JSON.parse(response.choices[0].message.content) as unknown
    },
  }
}

export type ReviewModel = ReturnType<typeof createOpenRouter>
