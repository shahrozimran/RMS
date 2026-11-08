import { createOpenRouter, hasOpenRouterKey, CHAT_MODEL } from '../lib/agents/openrouter.ts'
import { jobSchema } from '../lib/agents/contracts.ts'
import { retrieveRoleKnowledge, runAiReview } from '../lib/agents/rag.ts'

// Synthetic test data only. This command does not connect to Supabase.
if (!hasOpenRouterKey()) {
  console.error('Add OPENROUTER_API_KEY to the server environment or .env.local before running this check.')
  process.exit(1)
}

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const observed = new Date().toISOString()
const job = jobSchema.parse({ id: id(1), generation: 1, lease_token: id(2), captured_at: observed, context_hash: 'a'.repeat(32), context: {
  order: { id: id(3), status: 'active', created_at: observed, updated_at: observed, source: 'pos' },
  products: [{ id: id(4), name: 'Sample soup', quantity: 2, available: true, has_variants: false, has_modifiers: false, has_recipe: true }],
  ingredients: [{ id: id(5), name: 'Sample broth', unit: 'litres', on_hand: 1, threshold: 1, required: 2, open_demand: 2 }],
} })
const facts = { open_orders: 2, kitchen_orders: 2, oldest_active_at: observed, staff_on_shift: 1, assigned_open_orders: 2,
  order_has_table: false, table_status: null, table_capacity: null, floor: { free: 4, occupied: 0, reserved: 0, cleaning: 0 },
  sales_days: 30, paid_orders: 5, top_items: [{ name: 'Sample soup', quantity: 5 }] }

try {
  const model = createOpenRouter()
  const signal = AbortSignal.timeout(43000)
  const hits = await retrieveRoleKnowledge(job, model, async () => [{ role: 'inventory', id: id(6), document_id: id(7),
    title: 'Sample shortage procedure', position: 1, body: 'Verify the physical count and ask the duty lead to review shortages.', score: 1 }], signal)
  const result = await runAiReview(job, facts, hits, model, signal)
  console.log(JSON.stringify({ model: CHAT_MODEL, agents: result.agents.length, citedSources: result.sources.length }))
} catch (error) {
  const code = /^OPENROUTER_HTTP_\d{3}$/.test(error?.message ?? '') ? error.message : 'AI_RESPONSE_OR_CONNECTION_FAILED'
  console.error(`Provider check failed (${code}). Check the key, credits and supported provider endpoints.`)
  process.exitCode = 1
}
