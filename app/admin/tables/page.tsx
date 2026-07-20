'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'

interface Table {
  id: number
  table_number: string
  section: string
  capacity: number
  status: 'free' | 'occupied' | 'reserved' | 'cleaning'
  qr_token: string | null
}

export default function AdminTablesPage() {
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tableCount, setTableCount] = useState(10)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mounted, setMounted] = useState(false)

  // Edit Table states
  const [editingTable, setEditingTable] = useState<Table | null>(null)
  const [editCapacity, setEditCapacity] = useState<number>(4)
  const [editStatus, setEditStatus] = useState<Table['status']>('free')

  // QR modal states
  const [qrTable, setQrTable] = useState<Table | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [qrUrl, setQrUrl] = useState<string>('')
  const [regenerating, setRegenerating] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
    fetchTables()
    fetchTableCount()

    const channel = supabase
      .channel('table-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        fetchTables()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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
      const { error: settingsError } = await supabase
        .from('system_settings')
        .upsert({
          key: 'table_count',
          value: { count: tableCount },
          updated_at: new Date().toISOString()
        })
      if (settingsError) throw settingsError

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

  const openEditModal = (table: Table) => {
    setEditingTable(table)
    setEditCapacity(table.capacity || 4)
    setEditStatus(table.status)
    setError('')
    setSuccess('')
  }

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTable) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const { error: updateError } = await supabase
        .from('tables')
        .update({ capacity: editCapacity, status: editStatus })
        .eq('id', editingTable.id)
      if (updateError) throw updateError

      setSuccess(`Table ${editingTable.table_number} updated successfully!`)
      setEditingTable(null)
      fetchTables()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  /* ── QR Code Modal ── */
  const openQrModal = async (table: Table) => {
    if (!table.qr_token) return
    setQrTable(table)
    setQrDataUrl('')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${origin}/order/${table.qr_token}`
    setQrUrl(url)
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: { dark: '#0a0a0f', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      })
      setQrDataUrl(dataUrl)
    } catch (e: any) {
      setError('Failed to generate QR code: ' + e.message)
    }
  }

  const handleDownloadQr = () => {
    if (!qrDataUrl || !qrTable) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `QR_${qrTable.table_number}.png`
    a.click()
  }

  const handlePrintQr = () => {
    if (!qrDataUrl || !qrTable) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - ${qrTable.table_number}</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fff; }
            img { width: 240px; height: 240px; }
            h1 { font-size: 28px; font-weight: 900; margin: 16px 0 4px; }
            p { font-size: 14px; color: #666; margin: 0 0 8px; }
            .url { font-size: 10px; color: #999; word-break: break-all; max-width: 260px; text-align: center; }
          </style>
        </head>
        <body>
          <img src="${qrDataUrl}" alt="QR Code" />
          <h1>${qrTable.table_number}</h1>
          <p>Scan to order from your table</p>
          <div class="url">${qrUrl}</div>
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  const handleRegenerateQr = async () => {
    if (!qrTable) return
    const confirmed = window.confirm(
      `Regenerate QR code for ${qrTable.table_number}?\n\nThis will invalidate the existing QR code. You will need to reprint and replace the physical QR code at the table.`
    )
    if (!confirmed) return

    setRegenerating(true)
    try {
      // Generate new UUID on client and update in DB
      const newToken = crypto.randomUUID()
      const { error } = await supabase
        .from('tables')
        .update({ qr_token: newToken })
        .eq('id', qrTable.id)
      if (error) throw error

      // Reload data and refresh modal
      await fetchTables()
      const updated = { ...qrTable, qr_token: newToken }
      setQrTable(updated)
      await openQrModal(updated)
    } catch (e: any) {
      setError('Failed to regenerate QR: ' + e.message)
    } finally {
      setRegenerating(false)
    }
  }

  if (!mounted) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--charcoal-soft)' }}>Loading table management...</div>
  }

  return (
    <>
      <div className="animate-in">
        <div className="page-header">
          <h1>Table Management</h1>
          <p>Monitor, configure, and generate QR codes for your restaurant tables.</p>
        </div>

        <div className="responsive-grid-split-300">
          {/* Visual floor/table list */}
          <div className="surface-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Floor Layout</h3>
            {loading ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '16px',
                animation: 'skeleton-pulse 1.5s infinite'
              }}>
                {Array.from({ length: 10 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="table-card"
                    style={{
                      aspectRatio: 1,
                      background: 'var(--surface-muted, #E8E3DC)',
                      border: '1.5px solid var(--border)',
                      cursor: 'default',
                      pointerEvents: 'none'
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '16px'
              }}>
                {tables.map((t) => (
                  <div key={t.id} style={{ position: 'relative' }}>
                    <div
                      className={`table-card ${t.status}`}
                      onClick={() => openEditModal(t)}
                      style={{ cursor: 'pointer' }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="3" rx="1"/><path d="M6 10v7M18 10v7M3 17h18"/></svg>
                      <span style={{ fontSize: '16px', fontWeight: 700 }}>{t.table_number}</span>
                      <span style={{ fontSize: '11px', opacity: 0.7 }}>Cap: {t.capacity || 4}</span>
                      <span className={`badge ${
                        t.status === 'free' ? 'badge-green' :
                        t.status === 'occupied' ? 'badge-red' :
                        t.status === 'reserved' ? 'badge-yellow' : 'badge-gray'
                      }`} style={{ textTransform: 'capitalize', fontSize: '10px', padding: '2px 6px', marginTop: '4px' }}>
                        {t.status}
                      </span>
                    </div>

                    {/* QR button */}
                    {t.qr_token && (
                      <button
                        id={`qr-btn-${t.id}`}
                        onClick={(e) => { e.stopPropagation(); openQrModal(t) }}
                        title="View QR Code"
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 26, height: 26, borderRadius: 8,
                          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: '#fff', fontSize: 14, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 0.15s',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                          <path d="M14 14h3v3M17 20h3M20 17v3"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '24px', padding: '12px 16px', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--charcoal-soft)', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <span>ℹ️ Click a table to edit capacity/status.</span>
              <span>📷 Click the QR icon to view & download the table&apos;s QR code.</span>
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
            <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--charcoal-soft)', lineHeight: '1.6' }}>
              <strong>Note:</strong> Increasing the count creates new tables (e.g. T11, T12). Decreasing the count removes empty tables from the end. Each new table automatically gets a unique QR code.
            </div>
          </div>
        </div>
      </div>

      {/* Edit Table Modal */}
      {editingTable && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="surface-card animate-in" style={{ padding: '24px', width: '100%', maxWidth: '360px', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Edit Table {editingTable.table_number}</h3>
            <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', marginBottom: '20px' }}>Configure capacity and status for this table.</p>

            <form onSubmit={handleSaveTable} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="edit-capacity">Table Capacity (Pax)</label>
                <input
                  id="edit-capacity"
                  className="input"
                  type="number"
                  min="1"
                  max="30"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(parseInt(e.target.value) || 1)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="edit-status">Current Status</label>
                <select
                  id="edit-status"
                  className="input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  style={{ appearance: 'auto', background: 'var(--surface)', paddingRight: '12px' }}
                >
                  <option value="free">🟢 Free</option>
                  <option value="occupied">🔴 Occupied</option>
                  <option value="reserved">🟡 Reserved</option>
                  <option value="cleaning">⚫ Cleaning</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingTable(null)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrTable && (
        <div 
          onClick={() => { setQrTable(null); setQrDataUrl('') }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(44, 44, 44, 0.45)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="surface-card animate-in" 
            style={{ 
              padding: '32px', 
              width: '100%', 
              maxWidth: '400px', 
              boxShadow: '0 20px 40px rgba(44,44,44,0.15), 0 0 0 1px rgba(200,169,126,0.2)', 
              textAlign: 'center',
              border: '2px solid var(--accent)',
              borderRadius: '20px',
              position: 'relative'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', textAlign: 'left' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--charcoal)', marginBottom: '4px' }}>
                  Table QR Code
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', margin: 0 }}>
                  Place this code at the table for customer self-ordering.
                </p>
              </div>
              <button
                onClick={() => { setQrTable(null); setQrDataUrl('') }}
                style={{ 
                  background: 'var(--surface-raised)', 
                  border: '1px solid var(--border)', 
                  borderRadius: 10, 
                  width: 34, 
                  height: 34, 
                  cursor: 'pointer', 
                  fontSize: 14, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  flexShrink: 0,
                  color: 'var(--charcoal-mid)',
                  transition: 'all 0.2s',
                }}
              >
                ✕
              </button>
            </div>

            {/* QR Image Container */}
            <div style={{
              background: '#ffffff', 
              borderRadius: '20px', 
              padding: '20px', 
              display: 'inline-block',
              marginBottom: '20px', 
              border: '2.5px solid var(--accent-light)',
              boxShadow: 'var(--shadow-md)',
              lineHeight: 0
            }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR for ${qrTable.table_number}`} style={{ width: 200, height: 200, display: 'block' }} />
              ) : (
                <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: '12px' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid #ccc', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              )}
            </div>

            {/* Table Number Title */}
            <div style={{ 
              fontSize: '24px', 
              fontWeight: 800, 
              color: 'var(--charcoal)', 
              marginBottom: '6px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: '-0.02em'
            }}>
              Table {qrTable.table_number}
            </div>

            {/* Read-only URL box with Copy option */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              marginBottom: '24px', 
              background: 'var(--surface-raised)', 
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '6px 10px',
            }}>
              <span style={{ 
                fontSize: '11px', 
                color: 'var(--charcoal-soft)', 
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                textAlign: 'left'
              }}>
                {qrUrl}
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(qrUrl);
                  alert('URL copied to clipboard!');
                }}
                title="Copy URL"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: 'var(--charcoal-mid)',
                  flexShrink: 0
                }}
              >
                Copy
              </button>
            </div>

            {/* Print/Download Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button
                id={`download-qr-${qrTable.id}`}
                className="btn btn-accent"
                onClick={handleDownloadQr}
                disabled={!qrDataUrl}
                style={{ flex: 1, height: '44px' }}
              >
                ⬇ Download PNG
              </button>
              <button
                id={`print-qr-${qrTable.id}`}
                className="btn btn-secondary"
                onClick={handlePrintQr}
                disabled={!qrDataUrl}
                style={{ flex: 1, height: '44px' }}
              >
                🖨 Print Code
              </button>
            </div>
            
            {/* Secondary Option: Regenerate */}
            <button
              id={`regen-qr-${qrTable.id}`}
              className="btn btn-ghost"
              onClick={handleRegenerateQr}
              disabled={regenerating}
              style={{ width: '100%', fontSize: '12px', color: 'var(--charcoal-soft)', marginBottom: 14, minHeight: '34px' }}
            >
              {regenerating ? 'Regenerating…' : '🔄 Regenerate QR (invalidates old code)'}
            </button>

            {/* Primary Close Button */}
            <button
              className="btn btn-primary"
              onClick={() => { setQrTable(null); setQrDataUrl('') }}
              style={{ width: '100%', height: '46px', fontWeight: 700 }}
            >
              Close Viewer
            </button>

            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>
      )}
    </>
  )
}
