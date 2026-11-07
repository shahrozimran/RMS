export const helpDeskPages = {
  overview: { label: 'Help desk', description: 'See what needs attention and find the right next step.' },
  issues: { label: 'Issues', description: 'See what was flagged, why it matters and what your team can check.' },
  checks: { label: 'Order checks', description: 'See which orders are waiting, being checked or need another try.' },
  reviews: { label: 'Past reviews', description: 'Open a completed review to see what the team found and the sources it used.' },
  ask: { label: 'Ask a question', description: 'Ask about your restaurant records or saved policies and see where the answer came from.' },
  alerts: { label: 'Alerts', description: 'Read new alerts or send a private message to a team member.' },
  knowledge: { label: 'Saved policies', description: 'Add the instructions and checklists your team follows.' },
} as const

export type HelpDeskPage = keyof typeof helpDeskPages
export type ReviewPage = Extract<HelpDeskPage, 'overview' | 'issues' | 'checks' | 'reviews'>

export function isHelpDeskPage(value: string): value is HelpDeskPage {
  return Object.hasOwn(helpDeskPages, value)
}

export function helpDeskPreviewPage(view: string): HelpDeskPage | null {
  if (view === 'intelligence') return 'overview'
  const page = view.startsWith('intelligence-') ? view.slice('intelligence-'.length) : ''
  return isHelpDeskPage(page) ? page : null
}

export function helpDeskHref(page: HelpDeskPage, preview = false, params?: Record<string, string>) {
  const url = preview ? `/preview?view=intelligence${page === 'overview' ? '' : `-${page}`}`
    : `/admin/intelligence${page === 'overview' ? '' : `/${page}`}`
  return params ? `${url}${preview ? '&' : '?'}${new URLSearchParams(params)}` : url
}
