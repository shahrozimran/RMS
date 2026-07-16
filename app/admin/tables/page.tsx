'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Table {
  id: number
  table_number: string
  section: string
  capacity: number
  status: 'free' | 'occupied' | 'reserved' | 'cleaning'
}

export default function AdminTablesPage() {
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tableCount, setTableCount] = useState(10)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchTables()
    fetchTableCount()

    // Live subscription for table changes
    const channel = supabase
      .channel('table-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        fetchTables()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchTables = async () => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .order('id', { ascending: true })
      if (error) throw error
      setTables(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchTableCount = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'table_count')
        .single()
      if (data?.value) {
        setTableCount((data.value as any).count || 10)
      }
    } catch (err) {}
  }

  const handleUpdateCount = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // 1. Update the table count setting
      const { error: settingsError } = await supabase
        .from('system_settings')
        .upsert({
          key: 'table_count',
          value: { count: tableCount },
          updated_at: new Date().toISOString()
        })
      if (settingsError) throw settingsError

      // 2. Call pg function generate_tables to sync records
      const { data, error: rpcError } = await supabase.rpc('generate_tables', {
        p_count: tableCount
      })
      if (rpcError) throw rpcError

      setSuccess(`Tables updated successfully: ${data}`)
      fetchTables()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateTableStatus = async (id: number, currentStatus: string) => {
    const nextStatusMap: Record<string, string> = {
      free: 'reserved',
      reserved: 'cleaning',
      cleaning: 'free',
      occupied: 'cleaning' // occupied must go to cleaning when done
    }
    const nextStatus = nextStatusMap[currentStatus] || 'free'

    try {
      const { error } = await supabase
        .from('tables')
        .update({ status: nextStatus })
        .eq('id', id)
      if (error) throw error
      fetchTables()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800 }}>Table Management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Monitor and configure your restaurant floor layout.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>
        {/* Visual floor/table list */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Floor Layout</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Loading floor plan...</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '16px'
            }}>
              {tables.map((t) => (
                <div
                  key={t.id}
                  className={`table-card ${t.status}`}
                  onClick={() => updateTableStatus(t.id, t.status)}
                >
                  <span style={{ fontSize: '24px' }}>🪑</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{t.table_number}</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>Cap: {t.capacity || 4}</span>
                  <span className={`badge ${
                    t.status === 'free' ? 'badge-green' :
                    t.status === 'occupied' ? 'badge-red' :
                    t.status === 'reserved' ? 'badge-yellow' : 'badge-gray'
                  }`} style={{ textTransform: 'capitalize', fontSize: '10px', padding: '2px 6px', marginTop: '4px' }}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: '24px', padding: '12px', background: 'var(--surface-3)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <span>🟢 Click Green table to Reserve</span>
            <span>🟡 Click Yellow table to Clean</span>
            <span>⚫ Click Grey table to Free</span>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="surface-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Table Settings</h3>
          <form onSubmit={handleUpdateCount} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label" htmlFor="table-count">Total Table Count</label>
              <input
                id="table-count"
                className="input"
                type="number"
                min="1"
                max="100"
                value={tableCount}
                onChange={(e) => setTableCount(parseInt(e.target.value) || 1)}
                required
              />
            </div>
            {error && <div className="badge badge-red" style={{ padding: '8px', borderRadius: '6px' }}>{error}</div>}
            {success && <div className="badge badge-green" style={{ padding: '8px', borderRadius: '6px' }}>{success}</div>}
            <button
              id="save-table-count-btn"
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {saving ? 'Saving...' : 'Sync Tables'}
            </button>
          </form>
          <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            <strong>Note:</strong> Increasing the count creates new tables (e.g. T11, T12). Decreasing the count removes empty tables from the end. Tables that are currently occupied will never be deleted.
          </div>
        </div>
      </div>
    </div>
  )
}
