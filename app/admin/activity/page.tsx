import { createAdminClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

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

  // Fetch the last 100 activity logs
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('id, action, entity_type, entity_id, details, ip_address, timestamp, user:users!user_id(name, username)')
    .order('timestamp', { ascending: false })
    .limit(100) as { data: ActivityLog[] | null }

  const formattedLogs = logs ?? []

  const getActionBadgeClass = (action: string) => {
    const act = action.toLowerCase()
    if (act.includes('delete') || act.includes('void')) return 'badge-red'
    if (act.includes('create') || act.includes('add') || act.includes('login')) return 'badge-green'
    if (act.includes('update') || act.includes('edit')) return 'badge-blue'
    return 'badge-gray'
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ marginBottom: '28px' }}>
        <h1>System Activity Logs</h1>
        <p>Audit trail of all administrative operations, staff logins, and system changes.</p>
      </div>

      <div className="surface-card" style={{ overflow: 'hidden' }}>
        {formattedLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--charcoal-soft)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--charcoal-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p style={{ fontSize: '14px' }}>No system activity logs found.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Timestamp</th>
                <th style={{ width: '180px' }}>Performed By</th>
                <th style={{ width: '140px' }}>Action</th>
                <th style={{ width: '140px' }}>Target</th>
                <th>Details</th>
                <th style={{ width: '130px' }}>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {formattedLogs.map((log) => {
                const date = new Date(log.timestamp)
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                
                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: '13px', color: 'var(--charcoal-soft)', whiteSpace: 'nowrap' }}>
                      {dateStr} &middot; <span style={{ fontFamily: 'monospace' }}>{timeStr}</span>
                    </td>
                    <td>
                      {log.user ? (
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--charcoal)' }}>{log.user.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)' }}>@{log.user.username}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>System</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${getActionBadgeClass(log.action)}`} style={{ textTransform: 'capitalize' }}>
                        {log.action.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </td>
                    <td>
                      {log.entity_type ? (
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--charcoal)' }}>{log.entity_type}</div>
                          {log.entity_id && (
                            <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)', fontFamily: 'monospace' }}>
                              #{log.entity_id.substring(0, 8)}...
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--charcoal-soft)' }}>&mdash;</span>
                      )}
                    </td>
                    <td>
                      {log.details ? (
                        <pre style={{
                          margin: 0,
                          padding: '6px 8px',
                          background: 'var(--surface-raised)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          maxHeight: '80px',
                          overflowY: 'auto',
                          color: 'var(--charcoal)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all'
                        }}>
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      ) : (
                        <span style={{ color: 'var(--charcoal-soft)' }}>&mdash;</span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--charcoal-soft)', fontFamily: 'monospace' }}>
                      {log.ip_address || 'unknown'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
