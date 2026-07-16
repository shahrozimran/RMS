'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Product {
  id: string
  name: string
}

interface Ingredient {
  id: string
  name: string
  unit: string
}

interface RecipeItem {
  id: string
  ingredient_id: string
  quantity_used: number
  ingredient: {
    name: string
    unit: string
  }
}

export default function AdminRecipesPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [recipe, setRecipe] = useState<RecipeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Add Item to Recipe
  const [selectedIngredientId, setSelectedIngredientId] = useState('')
  const [qtyUsed, setQtyUsed] = useState('0.100')
  const [submittingAdd, setSubmittingAdd] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    if (selectedProductId) {
      fetchRecipe(selectedProductId)
    } else {
      setRecipe([])
    }
  }, [selectedProductId])

  const fetchInitialData = async () => {
    try {
      const [productsRes, ingredientsRes] = await Promise.all([
        supabase.from('products').select('id, name').order('name', { ascending: true }),
        supabase.from('ingredients').select('id, name, unit').order('name', { ascending: true })
      ])
      if (productsRes.error) throw productsRes.error
      if (ingredientsRes.error) throw ingredientsRes.error

      setProducts(productsRes.data || [])
      setIngredients(ingredientsRes.data || [])
      if (productsRes.data && productsRes.data.length > 0) {
        setSelectedProductId(productsRes.data[0].id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecipe = async (productId: string) => {
    setRecipeLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('product_ingredients')
        .select('id, ingredient_id, quantity_used, ingredient:ingredients(name, unit)')
        .eq('product_id', productId)
      if (error) throw error
      setRecipe((data as any) || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRecipeLoading(false)
    }
  }

  const handleAddRecipeItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProductId || !selectedIngredientId) return
    setSubmittingAdd(true)
    setError('')
    setSuccess('')

    const qty = parseFloat(qtyUsed)
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid quantity')
      setSubmittingAdd(false)
      return
    }

    try {
      const { error } = await supabase
        .from('product_ingredients')
        .upsert({
          product_id: selectedProductId,
          ingredient_id: selectedIngredientId,
          quantity_used: qty
        }, { onConflict: 'product_id,ingredient_id' })
      if (error) throw error

      setSuccess('Recipe updated successfully')
      fetchRecipe(selectedProductId)
      setSelectedIngredientId('')
      setQtyUsed('0.100')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingAdd(false)
    }
  }

  const handleDeleteRecipeItem = async (recipeId: string) => {
    setError('')
    setSuccess('')
    try {
      const { error } = await supabase
        .from('product_ingredients')
        .delete()
        .eq('id', recipeId)
      if (error) throw error
      setSuccess('Item removed from recipe')
      fetchRecipe(selectedProductId)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const currentProductName = products.find(p => p.id === selectedProductId)?.name || ''

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800 }}>Recipe Builder</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Map menu items to raw ingredients for auto-deduction.
          </p>
        </div>
        <Link href="/admin/inventory" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          ← Back to Stock
        </Link>
      </div>

      {error && <div className="badge badge-red" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px', display: 'block', width: 'fit-content' }}>{error}</div>}
      {success && <div className="badge badge-green" style={{ padding: '10px', borderRadius: '8px', marginBottom: '16px', display: 'block', width: 'fit-content' }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
        {/* Recipe Viewer */}
        <div className="surface-card" style={{ padding: '24px' }}>
          {loading ? (
            <div>Loading menu products...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group" style={{ maxWidth: '300px' }}>
                <label className="input-label" htmlFor="select-product">Select Product / Menu Item</label>
                <select
                  id="select-product"
                  className="input"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  <option value="" disabled>-- Choose a Product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {selectedProductId && (
                <div style={{ marginTop: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>
                    Recipe for {currentProductName}
                  </h3>
                  {recipeLoading ? (
                    <div>Loading ingredients recipe...</div>
                  ) : recipe.length === 0 ? (
                    <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                      🍽 No ingredients mapped to this product yet. Stock won't auto-deduct when this item is sold.
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Raw Ingredient</th>
                          <th>Qty Required</th>
                          <th>Unit</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipe.map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.ingredient?.name}</td>
                            <td>{Number(item.quantity_used).toFixed(3)}</td>
                            <td>{item.ingredient?.unit}</td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteRecipeItem(item.id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recipe Mod / Add Form */}
        {selectedProductId && (
          <div className="surface-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Link Ingredient</h3>
            <form onSubmit={handleAddRecipeItem} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="select-ingredient">Choose Raw Ingredient</label>
                <select
                  id="select-ingredient"
                  className="input"
                  value={selectedIngredientId}
                  onChange={(e) => setSelectedIngredientId(e.target.value)}
                  required
                >
                  <option value="">-- Select --</option>
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="ing-qty-used">Quantity Used (per unit sold)</label>
                <input
                  id="ing-qty-used"
                  className="input"
                  type="number"
                  step="0.001"
                  placeholder="e.g. 0.150"
                  value={qtyUsed}
                  onChange={(e) => setQtyUsed(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={submittingAdd} className="btn btn-primary" style={{ width: '100%', marginTop: '6px' }}>
                {submittingAdd ? 'Saving...' : 'Add/Update Mapping'}
              </button>
            </form>
            <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Linking ingredients ensures that when a staff member processes payment for this product, the system automatically decrements raw stocks.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
