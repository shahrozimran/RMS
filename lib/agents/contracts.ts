import { z } from 'zod'
import type { AiReview } from './rag-contracts.ts'

const amount = z.number().finite()
export const contextSchema = z.object({
  order: z.object({
    id: z.uuid(), status: z.enum(['draft','active','billed','paid','void','refunded']),
    created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
    source: z.string().max(30), stock_confirmed: z.boolean().optional(),
  }).strict(),
  products: z.array(z.object({
    id: z.uuid().nullable(), name: z.string().max(300), quantity: amount.positive(),
    available: z.boolean(), has_variants: z.boolean(), has_modifiers: z.boolean(), has_recipe: z.boolean(),
    makeable: amount.int().nonnegative().nullable().optional(),
  }).strict()).max(200),
  ingredients: z.array(z.object({
    id: z.uuid(), name: z.string().max(300), unit: z.string().max(50),
    on_hand: amount, threshold: amount, required: amount.positive(), open_demand: amount.nonnegative(),
  }).strict()).max(4000),
}).strict()

export const evidenceSchema = z.object({
  source: z.enum(['orders','products','ingredients','product_ingredients','policy']),
  entity_id: z.string().max(100), label: z.string().max(250),
  observed_at: z.string().datetime({ offset: true }), value: z.string().max(800),
}).strict()
export const findingSchema = z.object({
  kind: z.enum(['stock_pressure','recipe_review','order_review']),
  severity: z.enum(['low','medium','high']), title: z.string().min(1).max(160),
  summary: z.string().min(1).max(2000), evidence: z.array(evidenceSchema).min(1).max(16),
}).strict()
export const messageSchema = z.object({
  task_id: z.uuid(), sender: z.enum(['order','inventory','supervisor']),
  recipient: z.enum(['supervisor','administrator']), objective: z.string().min(1).max(300),
  status: z.enum(['clear','attention','insufficient_data']),
  constraints: z.array(z.string().max(300)).max(8),
  evidence: z.array(evidenceSchema).max(16),
}).strict()
export const outputSchema = z.object({
  schema_version: z.literal(1), policy_version: z.literal('rules.v1'),
  summary: z.string().min(1).max(2000), messages: z.array(messageSchema).length(3),
  findings: z.array(findingSchema).max(3),
}).strict()
export const jobSchema = z.object({
  id: z.uuid(), generation: z.number().int().positive(), lease_token: z.uuid(),
  context: contextSchema, context_hash: z.string().regex(/^[a-f0-9]{32}$/),
  captured_at: z.string().datetime({ offset: true }),
}).strict()
export type OrderContext = z.infer<typeof contextSchema>
export type Evidence = z.infer<typeof evidenceSchema>
export type Finding = z.infer<typeof findingSchema>
export type AgentOutput = z.infer<typeof outputSchema>
export type AgentJob = z.infer<typeof jobSchema>
export type Recommendation = Finding & {
  id: string; order_id: string; run_id: string; context_hash: string;
  status: 'open' | 'acknowledged' | 'dismissed' | 'stale';
  expires_at: string; created_at: string; review_note: string | null;
}
export type Run = {
  id: string; order_id: string; summary: string; policy_version: string;
  messages: AgentOutput['messages']; created_at: string;
  ai_review?: AiReview | null;
}
export type AgentOverview = {
  enabled: boolean; setupRequired: boolean; recommendations: Recommendation[]; runs: Run[];
  jobs: { id: string; order_id: string; status: string; attempts: number; last_error: string | null; updated_at: string }[];
}
