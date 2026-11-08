import Link from 'next/link'
import type { ReactNode } from 'react'
import { helpDeskHref, helpDeskPages, type HelpDeskPage } from '@/lib/agents/help-desk'
import './agents.css'

export default function HelpDeskFrame({ page, preview = false, actions, children }: {
  page: HelpDeskPage; preview?: boolean; actions?: ReactNode; children: ReactNode
}) {
  const current = helpDeskPages[page]
  return <div className="intel-workspace animate-in">
    <div className="workspace-title"><div><span className="eyebrow">Restaurant help desk</span><h1>{current.label}</h1><p>{current.description}</p></div>{actions && <div className="workspace-title-actions">{actions}</div>}</div>
    <nav className="filter-tabs help-desk-tabs" aria-label="Help desk pages">
      {(Object.keys(helpDeskPages) as HelpDeskPage[]).map(key => <Link key={key} href={helpDeskHref(key, preview)}
        className={`filter-tab ${key === page ? 'active' : ''}`} aria-current={key === page ? 'page' : undefined}>{helpDeskPages[key].label}</Link>)}
    </nav>
    {preview && <p className="notice">Practice view with sample records.</p>}
    {children}
  </div>
}
