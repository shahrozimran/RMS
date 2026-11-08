import { z } from 'zod'

export const specialistRoles = ['order', 'inventory', 'sales', 'kitchen', 'staff', 'tables'] as const
export const agentRoles = [...specialistRoles, 'supervisor'] as const
export const scopes = ['all', ...agentRoles] as const
export const documentSchema = z.object({
  action: z.literal('import'),
  title: z.string().trim().min(1).max(120),
  scope: z.enum(scopes),
  text: z.string().trim().min(40).max(36000),
  shareWithProvider: z.literal(true),
}).strict()

const count = z.number().int().nonnegative()
export const operationsFactsSchema = z.object({
  open_orders: count,
  kitchen_orders: count,
  oldest_active_at: z.string().datetime({ offset: true }).nullable(),
  staff_on_shift: count,
  assigned_open_orders: count,
  order_has_table: z.boolean(),
  table_status: z.enum(['free', 'occupied', 'reserved', 'cleaning']).nullable(),
  table_capacity: count.nullable(),
  floor: z.object({ free: count, occupied: count, reserved: count, cleaning: count }).strict(),
  sales_days: z.literal(30),
  paid_orders: count,
  top_items: z.array(z.object({ name: z.string().max(300), quantity: count }).strict()).max(5),
}).strict()

export const knowledgeHitSchema = z.object({
  role: z.enum(scopes),
  id: z.uuid(),
  document_id: z.uuid(),
  title: z.string().min(1).max(120),
  position: z.number().int().min(1).max(45),
  body: z.string().min(1).max(2200),
  score: z.number().finite(),
}).strict()

export const insightSchema = z.object({
  role: z.enum(agentRoles),
  status: z.enum(['clear', 'attention', 'insufficient_data']),
  observation: z.string().trim().min(1).max(480),
  suggestion: z.string().trim().min(1).max(480),
  sourceIds: z.array(z.string().max(40)).max(4),
}).strict()

export type AgentRole = typeof agentRoles[number]
export type OperationsFacts = z.infer<typeof operationsFactsSchema>
export type KnowledgeHit = z.infer<typeof knowledgeHitSchema>
export type AgentInsight = z.infer<typeof insightSchema>
export type Citation = {
  id: string
  kind: 'live' | 'document'
  title: string
  excerpt: string
  documentId?: string
  chunk?: number
}
export type AiReview = {
  status: 'completed'
  model: string
  observedAt: string
  agents: AgentInsight[]
  sources: Citation[]
} | {
  status: 'fallback'
  reason: 'key_missing' | 'budget_reached' | 'provider_unavailable' | 'knowledge_changed'
}

export type KnowledgeDocument = {
  id: string
  title: string
  scope: typeof scopes[number]
  chunk_count: number
  created_at: string
}
export type KnowledgeState = {
  installed: boolean
  keyConfigured: boolean
  enabled: boolean
  usedToday: number
  dailyLimit: number
  model: string
  documents: KnowledgeDocument[]
}
