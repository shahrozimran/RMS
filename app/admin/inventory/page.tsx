'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Ingredient {
  id: string
  name: string
  unit: string
  quantity_available: number
  reorder_threshold: number
  cost_per_unit: number | null
}

export default function AdminInventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Top Up Form
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [topUpQty, setTopUpQty] = useState('')
  const [topUpNotes, setTopUpNotes] = useState('')
  const [submittingTopUp, setSubmittingTopUp] = useState(false)

  // Add/Edit Form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('kg')
  const [newThreshold, setNewThreshold] = useState('2.0')
  const [newQty, setNewQty] = useState('10.0')
  const [newCost, setNewCost] = useState('1.0')
  const [submittingAdd, setSubmittingAdd] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchIngredients()

    // Realtime stock alerts and ingredient changes
    const channel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => {
        fetchIngredients()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchIngredients = async () => {
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      setIngredients(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedIngredient) return
    setSubmittingTopUp(true)
    setError('')
    setSuccess('')

    const qty = parseFloat(topUpQty)
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid positive quantity')
      setSubmittingTopUp(false)
      return
    }

    try {
      // 1. Log transaction
      const { error: txError } = await supabase
        .from('stock_transactions')
        .insert({
          ingredient_id: selectedIngredient.id,
          type: 'top_up',
          quantity: qty,
          notes: topUpNotes || 'Manual stock replenishment',
          performed_by: (await supabase.auth.getUser()).data.user?.id || null
        })
      if (txError) throw txError

      // 2. Increment stock quantity
      const newQtyVal = Number(selectedIngredient.quantity_available) + qty
      const { error: updateError } = await supabase
        .from('ingredients')
        .update({ quantity_available: newQtyVal, updated_at: new Date().toISOString() })
        .eq('id', selectedIngredient.id)
      if (updateError) throw updateError

      setSuccess(`Replenished ${qty} ${selectedIngredient.unit} of ${selectedIngredient.name}`)
      setSelectedIngredient(null)
      setTopUpQty('')
      setTopUpNotes('')
      fetchIngredients()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingTopUp(false)
    }
  }

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingAdd(true)
    setError('')
    setSuccess('')

    try {
      const { error } = await supabase
        .from('ingredients')
        .insert({
          name: newName,
          unit: newUnit,
          quantity_available: parseFloat(newQty) || 0,
          reorder_threshold: parseFloat(newThreshold) || 0,
          cost_per_unit: parseFloat(newCost) || 0
        })
      if (error) throw error

      setSuccess(`Added new ingredient: ${newName}`)
      setShowAddForm(false)
      setNewName('')
      setNewUnit('kg')
      setNewThreshold('2.0')
      setNewQty('10.0')
      setNewCost('1.0')
      fetchIngredients()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingAdd(false)
    }
  }

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800 }}>Inventory / Stock</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Manage raw ingredient stock, reorder levels, and menu item recipes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/admin/inventory/recipes" className="btn btn-secondary" style={{ textDecoration: 'none' }}>🍽 Recipe Builder</Link>
          <button id="add-ingredient-toggle-btn" className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Close Form' : '+ New Ingredient'}
          </button>
        </div>
      </div>

      {error && <div className="badge badge-red" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px', display: 'block', width: 'fit-content' }}>{error}</div>}
      {success && <div className="badge badge-green" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px', display: 'block', width: 'fit-content' }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
        {/* Ingredient list */}
        <div className="surface-card" style={{ overflow: 'hidden', padding: '0px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Loading stock levels...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ingredient Name</th>
                  <th>Unit</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                  <th>Cost/Unit</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((item) => {
                  const isLow = Number(item.quantity_available) <= Number(item.reorder_threshold)
                  const isOut = Number(item.quantity_available) <= 0
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</td>
                      <td>{item.unit}</td>
                      <td style={{ fontWeight: 'bold' }}>{Number(item.quantity_available).toFixed(2)}</td>
                      <td>{Number(item.reorder_threshold).toFixed(2)}</td>
                      <td>${item.cost_per_unit ? Number(item.cost_per_unit).toFixed(2) : '0.00'}</td>
                      <td>
                        {isOut ? (
                          <span className="badge badge-red">Out of Stock</span>
                        ) : isLow ? (
                          <span className="badge badge-yellow">Low Stock</span>
                        ) : (
                          <span className="badge badge-green">Healthy</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedIngredient(item)}
                        >
                          ➕ Replenish
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Action column (Replenish / Add New) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top-up Form */}
          {selectedIngredient && (
            <div className="surface-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>
                Replenish: {selectedIngredient.name}
              </h3>
              <form onSubmit={handleTopUp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="replenish-qty">Quantity ({selectedIngredient.unit})</label>
                  <input
                    id="replenish-qty"
                    className="input"
                    type="number"
                    step="0.001"
                    placeholder="e.g. 5.0"
                    value={topUpQty}
                    onChange={(e) => setTopUpQty(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="replenish-notes">Notes</label>
                  <input
                    id="replenish-notes"
                    className="input"
                    type="text"
                    placeholder="Supplier details, cost, etc."
                    value={topUpNotes}
                    onChange={(e) => setTopUpNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button type="submit" disabled={submittingTopUp} className="btn btn-primary" style={{ flex: 1 }}>
                    {submittingTopUp ? 'Replenishing...' : 'Submit'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSelectedIngredient(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Add New Form */}
          {showAddForm && (
            <div className="surface-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Add Raw Ingredient</h3>
              <form onSubmit={handleAddIngredient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="new-ing-name">Ingredient Name</label>
                  <input
                    id="new-ing-name"
                    className="input"
                    type="text"
                    placeholder="e.g. Mozzarella Cheese"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="new-ing-unit">Unit</label>
                  <select
                    id="new-ing-unit"
                    className="input"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                  >
                    <option value="kg">kg (Kilogram)</option>
                    <option value="g">g (Gram)</option>
                    <option value="L">L (Liter)</option>
                    <option value="ml">ml (Milliliter)</option>
                    <option value="pcs">pcs (Pieces)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="new-ing-qty">Starting Quantity</label>
                  <input
                    id="new-ing-qty"
                    className="input"
                    type="number"
                    step="0.001"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="new-ing-threshold">Reorder Threshold</label>
                  <input
                    id="new-ing-threshold"
                    className="input"
                    type="number"
                    step="0.001"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="new-ing-cost">Cost per Unit ($)</label>
                  <input
                    id="new-ing-cost"
                    className="input"
                    type="number"
                    step="0.01"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={submittingAdd} className="btn btn-primary" style={{ width: '100%', marginTop: '6px' }}>
                  {submittingAdd ? 'Adding...' : 'Create Ingredient'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
