import { createAdminClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import ActivityClient from './ActivityClient'

export const metadata: Metadata = { title: 'System Activity Logs' }

interface ActivityLog {
  id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  details: any
  ip_address: string | null
  timestamp: string
  user: {
    name: string
    username: string
  } | null
}

export default async function AdminActivityPage() {
  const supabase = await createAdminClient()

  // Fetch the last 1000 activity logs and active users list in parallel
  const [
    { data: logs },
    { data: usersList }
  ] = await Promise.all([
    supabase
      .from('activity_logs')
      .select('id, action, entity_type, entity_id, details, ip_address, timestamp, user:users!user_id(name, username)')
      .order('timestamp', { ascending: false })
      .limit(1000),
    supabase
      .from('users')
      .select('id, name, username')
      .neq('status', 'deleted')
      .order('name')
  ])

  const formattedLogs = (logs ?? []).map((log: any) => ({
    ...log,
    user: Array.isArray(log.user)
      ? (log.user.length > 0 ? log.user[0] : null)
      : (log.user || null)
  })) as ActivityLog[]
  const users = (usersList ?? []) as { id: string; name: string; username: string }[]

  return (
    <div className="animate-in">
      <div className="page-header" style={{ marginBottom: '28px' }}>
        <h1>System Activity Logs</h1>
        <p>Audit trail of all administrative operations, staff logins, and system changes.</p>
      </div>

      <ActivityClient initialLogs={formattedLogs} users={users} />
    </div>
  )
}
