import type { Metadata } from 'next'
import AlertsWorkspace from '@/components/agents/AlertsWorkspace'

export const metadata: Metadata = { title: 'My alerts' }
export default function StaffAlertsPage() { return <AlertsWorkspace /> }
