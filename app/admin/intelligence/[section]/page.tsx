import { notFound } from 'next/navigation'
import { z } from 'zod'
import AgentsWorkspace from '@/components/agents/AgentsWorkspace'
import AlertsWorkspace from '@/components/agents/AlertsWorkspace'
import AskWorkspace from '@/components/agents/AskWorkspace'
import KnowledgeLibrary from '@/components/agents/KnowledgeLibrary'
import HelpDeskFrame from '@/components/agents/HelpDeskFrame'
import { agentOverview, helpDeskIssue } from '@/lib/agents/server'
import { helpDeskPages, isHelpDeskPage } from '@/lib/agents/help-desk'

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  return { title: isHelpDeskPage(section) ? helpDeskPages[section].label : 'Help desk' }
}

export default async function HelpDeskPage({ params, searchParams }: {
  params: Promise<{ section: string }>; searchParams: Promise<{ issue?: string; status?: string }>
}) {
  const { section } = await params
  if (!isHelpDeskPage(section) || section === 'overview') notFound()
  const { issue, status } = await searchParams
  const issueId = z.uuid().safeParse(issue)
  if (section === 'ask') return <AskWorkspace />
  if (section === 'alerts') return <AlertsWorkspace admin issueId={issueId.data} key={issueId.data ?? 'inbox'} />
  if (section === 'knowledge') return <HelpDeskFrame page="knowledge"><KnowledgeLibrary preview={false}/></HelpDeskFrame>
  const [initial, focusedIssue] = await Promise.all([
    agentOverview(), section === 'issues' && issueId.success ? helpDeskIssue(issueId.data) : null,
  ])
  return <AgentsWorkspace initial={initial} page={section} focusedIssue={focusedIssue}
    checkFilter={status === 'failed' || status === 'all' ? status : 'waiting'} key={`${section}:${issueId.data ?? status ?? ''}`} />
}
