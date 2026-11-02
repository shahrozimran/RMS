import { UtensilsCrossed } from 'lucide-react'
import type { ReactNode } from 'react'

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><UtensilsCrossed size={27} strokeWidth={1.5} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>
}
