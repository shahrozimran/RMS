'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface ShiftLog {
  id: string
  clockIn: string
  clockOut: string | null
}

interface StaffPerformance {
  id: string
  name: string
  username: string
  role: string
  status: string
  isOnDuty: boolean
  activeShiftSince: string | null
  ordersProcessed: number
  totalRevenue: number
  qrConfirmed: number
  qrRejected: number
  shiftLogs: ShiftLog[]
}

export default function AdminStaffPerformancePage() {
  const [data, setData] = useState<StaffPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStaff, setSelectedStaff] = useState<StaffPerformance | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPerformance()
  }, [])

  const fetchPerformance = async () => {
    try {
      const res = await fetch('/api/admin/staff/performance')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch performance')
      setData(json.data || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="animate-in">
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: 'var(--charcoal-soft)', marginBottom: '4px' }}>
            <Link href="/admin/staff" style={{ color: 'var(--accent-dark)', textDecoration: 'underline' }}>Staff Management</Link>
            <span>/</span>
            <span>Performance & Shifts</span>
          </div>
          <h1>Employee Performance & Shifts</h1>
          <p>Real-time shift logs, completed POS transactions, and QR order actions.</p>
        </div>
        <Link href="/admin/staff" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          ← Back to Accounts
        </Link>
      </div>

      {error && <div className="badge badge-red" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px', display: 'block' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedStaff ? '1fr 340px' : '1fr', gap: '24px', alignItems: 'start' }}>
        {/* Main visual table */}
        <div className="surface-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--charcoal-soft)' }}>
              Loading performance metrics...
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Shift Status</th>
                  <th>Completed Sales</th>
                  <th>Revenue Taken</th>
                  <th>QR Confirmed</th>
                  <th>QR Rejected</th>
                  <th>Logs</th>
                </tr>
              </thead>
              <tbody>
                {data.map((staff) => (
                  <tr key={staff.id} style={{ background: selectedStaff?.id === staff.id ? 'var(--surface-raised)' : undefined }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: 'var(--accent-bg)',
                          border: '1.5px solid var(--border-strong)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '13px', color: 'var(--accent-dark)',
                          flexShrink: 0
                        }}>
                          {staff.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--charcoal)' }}>{staff.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--charcoal-soft)' }}>@{staff.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-gray" style={{ textTransform: 'capitalize' }}>
                        {staff.role}
                      </span>
                    </td>
                    <td>
                      {staff.isOnDuty ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="badge badge-green" style={{ alignSelf: 'flex-start' }}>● On Duty</span>
                          <span style={{ fontSize: '10px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>
                            Since {formatTime(staff.activeShiftSince!)}
                          </span>
                        </div>
                      ) : (
                        <span className="badge badge-gray">⚪ Off Duty</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{staff.ordersProcessed} orders</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                      ${staff.totalRevenue.toFixed(2)}
                    </td>
                    <td>
                      <span className="badge badge-green" style={{ fontSize: '11px' }}>
                        ✓ {staff.qrConfirmed}
                      </span>
                    </td>
                    <td>
                      {staff.qrRejected > 0 ? (
                        <span className="badge badge-red" style={{ fontSize: '11px' }}>
                          ✕ {staff.qrRejected}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--charcoal-soft)', fontSize: '12px' }}>0</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedStaff(staff)}
                      >
                        Logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && data.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--charcoal-soft)' }}>
              No staff statistics available.
            </div>
          )}
        </div>

        {/* Sidebar logs view */}
        {selectedStaff && (
          <div className="surface-card animate-in" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--charcoal)', marginBottom: '2px' }}>
                  {selectedStaff.name}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', margin: 0 }}>
                  Recent Shift Logs
                </p>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                style={{
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 8, width: 28, height: 28,
                  cursor: 'pointer', fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedStaff.shiftLogs.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--charcoal-soft)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                  No shift logs found.
                </div>
              ) : (
                selectedStaff.shiftLogs.map((log) => {
                  const hasClockOut = log.clockOut !== null
                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: '12px',
                        background: 'var(--surface-raised)',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--charcoal)', marginBottom: '4px' }}>
                        📅 {formatDate(log.clockIn)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--charcoal-mid)' }}>
                        <span>IN: {formatTime(log.clockIn)}</span>
                        <span>
                          OUT: {hasClockOut ? formatTime(log.clockOut!) : <span style={{ color: 'var(--success)', fontWeight: 700 }}>Active</span>}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
