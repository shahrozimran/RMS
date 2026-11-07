import { BookOpen, ChevronDown, Sparkles } from 'lucide-react'
import type { AiReview } from '@/lib/agents/rag-contracts'
import { agentCatalog } from '@/lib/agents/catalog'
import LocalDateTime from '@/components/ui/LocalDateTime'

const fallbackReasons = {
  key_missing: 'The worker needs its OpenRouter key.',
  budget_reached: 'The daily AI review allowance has been used.',
  provider_unavailable: 'The AI request could not be completed or validated.',
  knowledge_changed: 'The knowledge library changed during this review.',
}

export default function AiReviewPanel({ review, orderId, preview }: { review: AiReview; orderId: string; preview: boolean }) {
  if (review.status === 'fallback') return <p className="notice">{fallbackReasons[review.reason]} The rules review is available below.</p>
  const supervisor = review.agents.find(agent => agent.role === 'supervisor')
  const specialists = review.agents.filter(agent => agent.role !== 'supervisor')
  return <section className="panel rag-review">
    <div className="panel-heading"><div><span className="eyebrow">{preview ? 'Sample AI review' : 'AI review'}</span><h2>Supervisor briefing</h2>
      <p>Order #{orderId.slice(-6).toUpperCase()} · Seven roles · <LocalDateTime value={review.observedAt} /> · {preview ? 'Demonstration' : 'Gemini 3.1 Flash Lite'}</p></div><Sparkles size={22} /></div>
    {supervisor && <div className="rag-supervisor"><strong>{supervisor.observation}</strong><p>{supervisor.suggestion}</p></div>}
    <details className="rag-specialists"><summary>See what was checked and why <ChevronDown size={16} /></summary>
      <div className="rag-insight-grid">{specialists.map(insight => <article key={insight.role}>
        <div className="row space-between"><h3>{agentCatalog.find(agent => agent.id === insight.role)?.name}</h3><span className={`badge ${insight.status === 'attention' ? 'badge-orange' : 'badge-gray'}`}>{insight.status.replaceAll('_', ' ')}</span></div>
        <p>{insight.observation}</p><p><strong>Suggested check</strong> {insight.suggestion}</p>
        <small>{insight.sourceIds.map(id => review.sources.find(source => source.id === id)?.title).filter(Boolean).join(' · ') || 'Evidence requested'}</small>
      </article>)}</div>
      <div className="rag-sources"><h3><BookOpen size={16} /> Cited evidence</h3>{review.sources.map(source => <details key={source.id}>
        <summary>{source.title} <span className="badge badge-gray">{source.kind === 'document' ? `Excerpt ${source.chunk}` : 'Live snapshot'}</span></summary>
        <p>{source.excerpt}</p>
      </details>)}</div>
    </details>
  </section>
}
