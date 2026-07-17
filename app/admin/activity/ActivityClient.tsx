'use client'

import { useState, useMemo } from 'react'

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

interface ActivityClientProps {
  initialLogs: ActivityLog[]
  users: { id: string; name: string; username: string }[]
}

export default function ActivityClient({ initialLogs, users }: ActivityClientProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntity, setSelectedEntity] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [focused, setFocused] = useState(false)
  const itemsPerPage = 20

  // 1. Get unique entity types present in the logs for the filter dropdown
  const entityTypes = useMemo(() => {
    const types = new Set<string>()
    initialLogs.forEach(log => {
      if (log.entity_type) {
        types.add(log.entity_type)
      }
    })
    return Array.from(types).sort()
  }, [initialLogs])

  // 2. Get unique action names present in the logs for suggestions
  const uniqueActions = useMemo(() => {
    const actions = new Set<string>()
    initialLogs.forEach(log => {
      if (log.action) actions.add(log.action)
    })
    return Array.from(actions)
  }, [initialLogs])

  // 3. Compute search suggestions based on current input
  const suggestions = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase()
    const list: { label: string; value: string; type: 'action' | 'entity' | 'user'; rawValue: string }[] = []

    // Match unique action names
    uniqueActions.forEach(action => {
      if (action.toLowerCase().includes(term)) {
        list.push({ 
          label: action.replace(/_/g, ' '), 
          value: action, 
          type: 'action',
          rawValue: action 
        })
      }
    })

    // Match user names
    users.forEach(u => {
      if (u.name.toLowerCase().includes(term) || u.username.toLowerCase().includes(term)) {
        list.push({ 
          label: `${u.name} (@${u.username})`, 
          value: u.name, 
          type: 'user',
          rawValue: u.name
        })
      }
    })

    // Match entity types
    entityTypes.forEach(type => {
      if (type.toLowerCase().includes(term)) {
        list.push({ 
          label: `Entity: ${type}`, 
          value: '', 
          type: 'entity',
          rawValue: type 
        })
      }
    })

    return list.slice(0, 8)
  }, [searchTerm, uniqueActions, users, entityTypes])

  // 2. Filter and Search logs
  const filteredLogs = useMemo(() => {
    return initialLogs.filter(log => {
      // User filter
      if (selectedUser && log.user?.name !== selectedUser && log.user?.username !== selectedUser) {
        // Fallback check if user is null (System)
        if (selectedUser === 'system' && log.user !== null) return false
        if (selectedUser !== 'system') {
          const userObj = users.find(u => u.name === selectedUser || u.username === selectedUser)
          if (!userObj || log.user?.name !== userObj.name) return false
        }
      }

      // Entity type filter
      if (selectedEntity && log.entity_type !== selectedEntity) {
        return false
      }

      // Search term (Search action, entity_id, user name, or details JSON content)
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchAction = log.action.toLowerCase().includes(term)
        const matchUser = log.user?.name.toLowerCase().includes(term) || log.user?.username.toLowerCase().includes(term)
        const matchEntityId = log.entity_id?.toLowerCase().includes(term)
        const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(term) : false
        const matchEntityType = log.entity_type?.toLowerCase().includes(term)

        if (!matchAction && !matchUser && !matchEntityId && !matchDetails && !matchEntityType) {
          return false
        }
      }

      return true
    })
  }, [initialLogs, searchTerm, selectedEntity, selectedUser, users])

  // 3. Paginated logs
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredLogs, currentPage])

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage)

  const getActionBadgeClass = (action: string) => {
    const act = action.toLowerCase()
    if (act.includes('delete') || act.includes('void')) return 'badge-red'
    if (act.includes('create') || act.includes('add') || act.includes('login')) return 'badge-green'
    if (act.includes('update') || act.includes('edit')) return 'badge-blue'
    return 'badge-gray'
  }

  const handleClearFilters = () => {
    setSearchTerm('')
    setSelectedEntity('')
    setSelectedUser('')
    setCurrentPage(1)
  }

  return (
    <div>
      <style>{`
        .suggestion-item:hover {
          background: var(--surface-hover) !important;
        }
      `}</style>

      {/* Filters Bar */}
      <div className="surface-card" style={{ padding: '18px 24px', display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div className="input-group" style={{ flex: '1 1 240px', minWidth: '200px', position: 'relative' }}>
          <label className="input-label" htmlFor="search-logs">Search Logs</label>
          <input
            id="search-logs"
            type="text"
            className="input"
            placeholder="Search action, details, user..."
            value={searchTerm}
            onChange={(e) => { 
              setSearchTerm(e.target.value) 
              setCurrentPage(1)
              setFocused(true)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            style={{ minHeight: '38px', padding: '6px 12px' }}
          />

          {focused && suggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 10,
              maxHeight: '220px',
              overflowY: 'auto',
              marginTop: '4px'
            }}>
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    if (suggestion.type === 'entity') {
                      setSelectedEntity(suggestion.rawValue)
                      setSearchTerm('')
                    } else if (suggestion.type === 'user') {
                      setSelectedUser(suggestion.rawValue)
                      setSearchTerm('')
                    } else {
                      setSearchTerm(suggestion.rawValue)
                    }
                    setFocused(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.15s ease'
                  }}
                  className="suggestion-item"
                >
                  <span style={{ color: 'var(--charcoal)', fontWeight: 500 }}>{suggestion.label}</span>
                  <span style={{ fontSize: '10px', color: 'var(--charcoal-soft)', background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    {suggestion.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter by Entity */}
        <div className="input-group" style={{ width: '180px' }}>
          <label className="input-label" htmlFor="filter-entity">Entity Type</label>
          <select
            id="filter-entity"
            className="input"
            value={selectedEntity}
            onChange={(e) => { setSelectedEntity(e.target.value); setCurrentPage(1) }}
            style={{ minHeight: '38px', padding: '6px 12px' }}
          >
            <option value="">All Entities</option>
            {entityTypes.map(type => (
              <option key={type} value={type} style={{ textTransform: 'capitalize' }}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Filter by Staff */}
        <div className="input-group" style={{ width: '180px' }}>
          <label className="input-label" htmlFor="filter-staff">Performed By</label>
          <select
            id="filter-staff"
            className="input"
            value={selectedUser}
            onChange={(e) => { setSelectedUser(e.target.value); setCurrentPage(1) }}
            style={{ minHeight: '38px', padding: '6px 12px' }}
          >
            <option value="">All Users</option>
            <option value="system">System</option>
            {users.map(u => (
              <option key={u.id} value={u.name}>
                {u.name} (@{u.username})
              </option>
            ))}
          </select>
        </div>

        {/* Reset button */}
        {(searchTerm || selectedEntity || selectedUser) && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleClearFilters}
            style={{ marginTop: '20px', height: '36px' }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Suggested Searches */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--charcoal-soft)', fontWeight: 500 }}>Common Filters:</span>
        {[
          { label: '🔑 Staff Logins', search: 'LOGIN', entity: '' },
          { label: '🍔 Menu Updates', search: '', entity: 'product' },
          { label: '🧾 Orders & Billing', search: '', entity: 'order' },
          { label: '⚙️ Settings Changes', search: 'UPDATE_SETTINGS', entity: '' },
          { label: '📦 Stock Top-ups', search: 'top_up', entity: '' }
        ].map((pill) => (
          <button
            key={pill.label}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSearchTerm(pill.search)
              setSelectedEntity(pill.entity)
              setCurrentPage(1)
            }}
            style={{ borderRadius: '20px', fontSize: '11px', padding: '4px 12px' }}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Main Table view */}
      <div className="surface-card" style={{ overflow: 'hidden', padding: 0 }}>
        {paginatedLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '54px 24px', color: 'var(--charcoal-soft)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--charcoal-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p style={{ fontSize: '14px', fontWeight: 500 }}>No matching activity logs found.</p>
            {(searchTerm || selectedEntity || selectedUser) && (
              <button 
                onClick={handleClearFilters}
                style={{ marginTop: '12px', background: 'none', border: 'none', color: 'var(--accent-dark)', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px' }}
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '160px' }}>Timestamp</th>
                  <th style={{ width: '180px' }}>Performed By</th>
                  <th style={{ width: '150px' }}>Action</th>
                  <th style={{ width: '140px' }}>Target</th>
                  <th>Details</th>
                  <th style={{ width: '130px' }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log) => {
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
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--charcoal)', textTransform: 'capitalize' }}>{log.entity_type}</div>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px', color: 'var(--charcoal-soft)' }}>
                  Showing Page <strong>{currentPage}</strong> of {totalPages} ({filteredLogs.length} total results)
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
