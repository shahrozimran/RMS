'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SUPPORTED_CURRENCIES, type CurrencyConfig } from '@/lib/utils/currency'

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'currency' | 'payments'>('profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Settings State
  const [restaurantName, setRestaurantName] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')
  const [restaurantPhone, setRestaurantPhone] = useState('')

  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState('USD')
  const [serviceChargeType, setServiceChargeType] = useState<'percentage' | 'flat'>('percentage')
  const [serviceChargeVal, setServiceChargeVal] = useState('0')

  const [cashEnabled, setCashEnabled] = useState(true)
  const [cardEnabled, setCardEnabled] = useState(true)
  const [upiEnabled, setUpiEnabled] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
      if (error) throw error

      if (data) {
        data.forEach(item => {
          const val = item.value as any
          if (item.key === 'restaurant_name') setRestaurantName(val)
          if (item.key === 'restaurant_address') setRestaurantAddress(val)
          if (item.key === 'restaurant_phone') setRestaurantPhone(val)
          if (item.key === 'currency') setSelectedCurrencyCode(val.code)
          if (item.key === 'service_charge') {
            setServiceChargeType(val.type || 'percentage')
            setServiceChargeVal(String(val.value || 0))
          }
          if (item.key === 'payment_methods') {
            setCashEnabled(!!val.cash)
            setCardEnabled(!!val.card)
            setUpiEnabled(!!val.upi)
          }
        })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const updates = []

      if (activeTab === 'profile') {
        updates.push(
          { key: 'restaurant_name', value: restaurantName, updated_at: new Date().toISOString() },
          { key: 'restaurant_address', value: restaurantAddress, updated_at: new Date().toISOString() },
          { key: 'restaurant_phone', value: restaurantPhone, updated_at: new Date().toISOString() }
        )
      } else if (activeTab === 'currency') {
        const matchingConfig = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrencyCode) || SUPPORTED_CURRENCIES[0]
        updates.push(
          { key: 'currency', value: matchingConfig, updated_at: new Date().toISOString() },
          {
            key: 'service_charge',
            value: { type: serviceChargeType, value: parseFloat(serviceChargeVal) || 0 },
            updated_at: new Date().toISOString()
          }
        )
      } else if (activeTab === 'payments') {
        updates.push({
          key: 'payment_methods',
          value: { cash: cashEnabled, card: cardEnabled, upi: upiEnabled },
          updated_at: new Date().toISOString()
        })
      }

      const { error } = await supabase
        .from('system_settings')
        .upsert(updates)
      if (error) throw error

      setSuccess('Settings updated successfully')
      fetchSettings()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-in">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800 }}>System Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
          Configure restaurant profiles, billing parameters, currency format and checkout options.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Navigation Tabs */}
        <div className="surface-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { setActiveTab('profile'); setError(''); setSuccess('') }}
            style={{ border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}
          >
            🏢 Restaurant Profile
          </button>
          <button
            className={`sidebar-link ${activeTab === 'currency' ? 'active' : ''}`}
            onClick={() => { setActiveTab('currency'); setError(''); setSuccess('') }}
            style={{ border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}
          >
            🪙 Currency & Charges
          </button>
          <button
            className={`sidebar-link ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => { setActiveTab('payments'); setError(''); setSuccess('') }}
            style={{ border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}
          >
            💳 Payment Methods
          </button>
        </div>

        {/* Content Frame */}
        <div className="surface-card" style={{ padding: '28px' }}>
          {loading ? (
            <div>Loading settings...</div>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeTab === 'profile' && (
                <>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Restaurant Profile</h3>
                  <div className="input-group">
                    <label className="input-label" htmlFor="rest-name">Restaurant Name</label>
                    <input
                      id="rest-name"
                      className="input"
                      type="text"
                      value={restaurantName}
                      onChange={(e) => setRestaurantName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label" htmlFor="rest-addr">Address</label>
                    <input
                      id="rest-addr"
                      className="input"
                      type="text"
                      value={restaurantAddress}
                      onChange={(e) => setRestaurantAddress(e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label" htmlFor="rest-phone">Contact Number</label>
                    <input
                      id="rest-phone"
                      className="input"
                      type="text"
                      value={restaurantPhone}
                      onChange={(e) => setRestaurantPhone(e.target.value)}
                    />
                  </div>
                </>
              )}

              {activeTab === 'currency' && (
                <>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Currency & Service Charges</h3>
                  <div className="input-group">
                    <label className="input-label" htmlFor="system-currency">Select Currency</label>
                    <select
                      id="system-currency"
                      className="input"
                      value={selectedCurrencyCode}
                      onChange={(e) => setSelectedCurrencyCode(e.target.value)}
                    >
                      {SUPPORTED_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol}) - {c.locale}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '16px' }}>
                    <div className="input-group">
                      <label className="input-label" htmlFor="charge-val">Service Charge Value</label>
                      <input
                        id="charge-val"
                        className="input"
                        type="number"
                        step="0.01"
                        value={serviceChargeVal}
                        onChange={(e) => setServiceChargeVal(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" htmlFor="charge-type">Type</label>
                      <select
                        id="charge-type"
                        className="input"
                        value={serviceChargeType}
                        onChange={(e) => setServiceChargeType(e.target.value as any)}
                      >
                        <option value="percentage">% Percentage</option>
                        <option value="flat">Flat Amount</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'payments' && (
                <>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Checkout Payment Methods</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={cashEnabled}
                        onChange={(e) => setCashEnabled(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--brand-500)' }}
                      />
                      Enable Cash Payment (Calculates change)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={cardEnabled}
                        onChange={(e) => setCardEnabled(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--brand-500)' }}
                      />
                      Enable Card Payment
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={upiEnabled}
                        onChange={(e) => setUpiEnabled(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--brand-500)' }}
                      />
                      Enable UPI / QR Code Online Transfers
                    </label>
                  </div>
                </>
              )}

              {error && <div className="badge badge-red" style={{ padding: '8px', borderRadius: '6px' }}>{error}</div>}
              {success && <div className="badge badge-green" style={{ padding: '8px', borderRadius: '6px' }}>{success}</div>}

              <button
                id="save-settings-btn"
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ width: 'fit-content', alignSelf: 'flex-start', minWidth: '140px' }}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
