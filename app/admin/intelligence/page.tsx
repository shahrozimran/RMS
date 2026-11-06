import type { Metadata } from 'next'
import AgentsWorkspace from '@/components/agents/AgentsWorkspace'
import { agentOverview } from '@/lib/agents/server'

export const metadata:Metadata={title:'Operations intelligence'}
export default async function IntelligencePage() {
  return <AgentsWorkspace initial={await agentOverview()}/>
}
