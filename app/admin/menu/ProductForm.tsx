'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Category {
  id: number
  name: string
}

interface PriceVariant {
  label: string
  price: number
}

interface ProductFormProps {
  categories: Category[]
  initialProduct?: {
    id: string
    name: string
    description?: string | null
    category_id?: number | null
    base_price: number
    price_variants?: PriceVariant[] | null
    tax_rate: number
    image_url?: string | null
    is_available: boolean
    is_86d: boolean
  }
}

export default function ProductForm({ categories, initialProduct }: ProductFormProps) {
  const router = useRouter()
  const isEditMode = !!initialProduct

  // Form Fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [basePrice, setBasePrice] = useState('0.00')
  const [taxRate, setTaxRate] = useState('0.00')
  const [isAvailable, setIsAvailable] = useState(true)
  const [is86d, setIs86d] = useState(false)
  const [imageUrl, setImageUrl] = useState('')

  // Price Variants State
  const [priceVariants, setPriceVariants] = useState<PriceVariant[]>([])
  
  // Image Upload States
  const [uploading, setUploading] = useState(false)
  const [imageInputMode, setImageInputMode] = useState<'upload' | 'url'>('upload')

  // Submission States
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load initial product data if editing
  useEffect(() => {
    if (initialProduct) {
      setName(initialProduct.name)
      setDescription(initialProduct.description || '')
      setCategoryId(initialProduct.category_id ? initialProduct.category_id.toString() : '')
      setBasePrice(Number(initialProduct.base_price).toFixed(2))
      setTaxRate(Number(initialProduct.tax_rate).toFixed(2))
      setIsAvailable(initialProduct.is_available)
      setIs86d(initialProduct.is_86d)
      setImageUrl(initialProduct.image_url || '')
      setPriceVariants(initialProduct.price_variants || [])
      if (initialProduct.image_url && !initialProduct.image_url.includes('menu-images')) {
        // If it's an external URL, default to url input mode
        setImageInputMode('url')
      }
    }
  }, [initialProduct])

  // Handle image file upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload image')
      }

      setImageUrl(data.url)
    } catch (err: any) {
      setError(err.message || 'Image upload failed. You can also specify an external URL instead.')
      setImageInputMode('url')
    } finally {
      setUploading(false)
    }
  }

  // Manage Price Variants
  const addPriceVariant = () => {
    setPriceVariants([...priceVariants, { label: '', price: 0 }])
  }

  const removePriceVariant = (index: number) => {
    setPriceVariants(priceVariants.filter((_, i) => i !== index))
  }

  const updateVariantLabel = (index: number, val: string) => {
    const updated = [...priceVariants]
    updated[index].label = val
    setPriceVariants(updated)
  }

  const updateVariantPrice = (index: number, val: string) => {
    const updated = [...priceVariants]
    // Clean numeric input
    const cleanVal = val.replace(/[^0-9.]/g, '')
    updated[index].price = parseFloat(cleanVal) || 0
    setPriceVariants(updated)
  }

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Basic Validations
    if (!name.trim()) {
      setError('Product name is required')
      setLoading(false)
      return
    }

    const basePriceNum = parseFloat(basePrice)
    if (isNaN(basePriceNum) || basePriceNum < 0) {
      setError('Base price must be a non-negative number')
      setLoading(false)
      return
    }

    const taxRateNum = parseFloat(taxRate)
    if (isNaN(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) {
      setError('Tax rate must be between 0% and 100%')
      setLoading(false)
      return
    }

    // Validate Variants
    for (let i = 0; i < priceVariants.length; i++) {
      const v = priceVariants[i]
      if (!v.label.trim()) {
        setError(`Price variant #${i + 1} is missing a label (e.g. 'Large')`)
        setLoading(false)
        return
      }
      if (v.price <= 0) {
        setError(`Price variant '${v.label}' must have a price greater than 0`)
        setLoading(false)
        return
      }
    }

    // Format Payload
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      category_id: categoryId ? parseInt(categoryId) : null,
      base_price: basePriceNum,
      tax_rate: taxRateNum,
      price_variants: priceVariants.length > 0 ? priceVariants : [],
      image_url: imageUrl.trim() || null,
      is_available: isAvailable,
      is_86d: is86d,
    }

    try {
      const url = isEditMode ? `/api/products/${initialProduct.id}` : '/api/products'
      const method = isEditMode ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${isEditMode ? 'update' : 'create'} product`)
      }

      router.push('/admin/menu')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred during save.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '28px', alignItems: 'start' }}>
      {/* Left Column: Form Details */}
      <div className="surface-card animate-in" style={{ padding: '28px 36px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '24px' }}>
          {isEditMode ? 'Edit Menu Item Details' : 'Menu Item Specifications'}
        </h2>

        {error && (
          <div className="badge badge-red animate-in" style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', display: 'block', fontSize: '13px', lineHeight: '1.4', width: '100%', boxSizing: 'border-box' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Item Name */}
          <div className="input-group">
            <label className="input-label" htmlFor="product-name">Item Name</label>
            <input
              id="product-name"
              type="text"
              className="input"
              placeholder="e.g. Classic Margherita Pizza"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Description */}
          <div className="input-group">
            <label className="input-label" htmlFor="product-description">Description (Optional)</label>
            <textarea
              id="product-description"
              className="input"
              placeholder="e.g. Hand-stretched sourdough crust with fresh mozzarella, San Marzano tomatoes, and fresh basil."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              style={{ minHeight: '80px', resize: 'vertical', padding: '10px 14px' }}
            />
          </div>

          {/* Category & Tax Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label" htmlFor="product-category">Category</label>
              <select
                id="product-category"
                className="input"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={loading}
                style={{ minHeight: '44px' }}
              >
                <option value="">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="product-tax">Tax Rate (%)</label>
              <input
                id="product-tax"
                type="text"
                className="input"
                placeholder="0.00"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value.replace(/[^0-9.]/g, ''))}
                disabled={loading}
              />
            </div>
          </div>

          {/* Base Price */}
          <div className="input-group">
            <label className="input-label" htmlFor="product-price">Base Price ($)</label>
            <input
              id="product-price"
              type="text"
              className="input"
              placeholder="0.00"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value.replace(/[^0-9.]/g, ''))}
              required
              disabled={loading}
            />
            <span style={{ fontSize: '12px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>
              The standard base price when ordering the default size or item variant.
            </span>
          </div>

          {/* Section Divider */}
          <div className="divider" style={{ margin: '12px 0' }} />

          {/* Price Variants Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <label className="input-label" style={{ marginBottom: '2px' }}>Price Variants</label>
                <span style={{ fontSize: '12px', color: 'var(--charcoal-soft)' }}>
                  Configure customized prices for sizes, portions or options (e.g. Regular vs Large).
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addPriceVariant}
                disabled={loading}
              >
                + Add Variant
              </button>
            </div>

            {priceVariants.length === 0 ? (
              <div style={{ padding: '16px', background: 'var(--canvas)', border: '1px dashed var(--border-strong)', borderRadius: '8px', textAlign: 'center', color: 'var(--charcoal-soft)', fontSize: '13px' }}>
                No variants configured. This item will sell at the single base price.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {priceVariants.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center' }} className="animate-in">
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Large / Half Portion / Double Patty"
                      value={v.label}
                      onChange={(e) => updateVariantLabel(i, e.target.value)}
                      disabled={loading}
                      style={{ flex: 2 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '100px' }}>
                      <span style={{ color: 'var(--charcoal-soft)' }}>$</span>
                      <input
                        type="text"
                        className="input"
                        placeholder="0.00"
                        value={v.price || ''}
                        onChange={(e) => updateVariantPrice(i, e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removePriceVariant(i)}
                      disabled={loading}
                      style={{ padding: '8px 10px', minHeight: '38px' }}
                      title="Remove variant"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section Divider */}
          <div className="divider" style={{ margin: '12px 0' }} />

          {/* Submit Actions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="submit"
              disabled={loading || uploading}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {loading ? (isEditMode ? 'Updating Item...' : 'Adding Item...') : (isEditMode ? 'Save Changes' : 'Add Menu Item')}
            </button>
            <Link
              href="/admin/menu"
              className="btn btn-secondary"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>

      {/* Right Column: Status & Media uploads */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Availability Card */}
        <div className="surface-card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            Availability Settings
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* isAvailable Checkbox */}
            <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
              <input
                id="product-is-available"
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                disabled={loading}
                style={{ marginTop: '4px', cursor: 'pointer', accentColor: 'var(--charcoal)' }}
              />
              <div>
                <label htmlFor="product-is-available" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--charcoal)', cursor: 'pointer' }}>
                  Available in Menu
                </label>
                <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>
                  Determines if cashiers/waiters can see and select this item for new orders.
                </p>
              </div>
            </div>

            {/* is86d Checkbox */}
            <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
              <input
                id="product-is-86d"
                type="checkbox"
                checked={is86d}
                onChange={(e) => setIs86d(e.target.checked)}
                disabled={loading}
                style={{ marginTop: '4px', cursor: 'pointer', accentColor: 'var(--charcoal)' }}
              />
              <div>
                <label htmlFor="product-is-86d" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--charcoal)', cursor: 'pointer' }}>
                  Mark as 86'd (Sold Out)
                </label>
                <p style={{ fontSize: '12px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>
                  Flag this item as sold out for today. It will be greyed out in the order portal.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Product Image Card */}
        <div className="surface-card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            Product Image
          </h3>

          {/* Toggle between Upload File and URL */}
          <div style={{ display: 'flex', background: 'var(--canvas)', borderRadius: '6px', padding: '3px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setImageInputMode('upload')}
              style={{
                flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '4px', cursor: 'pointer',
                background: imageInputMode === 'upload' ? 'var(--surface)' : 'transparent',
                color: imageInputMode === 'upload' ? 'var(--charcoal)' : 'var(--charcoal-soft)',
                boxShadow: imageInputMode === 'upload' ? 'var(--shadow-xs)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setImageInputMode('url')}
              style={{
                flex: 1, padding: '6px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '4px', cursor: 'pointer',
                background: imageInputMode === 'url' ? 'var(--surface)' : 'transparent',
                color: imageInputMode === 'url' ? 'var(--charcoal)' : 'var(--charcoal-soft)',
                boxShadow: imageInputMode === 'url' ? 'var(--shadow-xs)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              External URL
            </button>
          </div>

          {imageInputMode === 'upload' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div 
                style={{
                  border: '1.5px dashed var(--border-strong)', borderRadius: '10px', padding: '24px 16px', textAlign: 'center',
                  background: 'var(--canvas)', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-strong)'}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={loading || uploading}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer'
                  }}
                />
                
                {uploading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div className="spin" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', color: 'var(--charcoal-soft)' }}>Uploading to server...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--charcoal-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--charcoal)', display: 'block' }}>Choose a file</span>
                      <span style={{ fontSize: '11px', color: 'var(--charcoal-soft)', marginTop: '2px', display: 'block' }}>PNG, JPG, or WEBP up to 5MB</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="input-group">
              <label className="input-label" htmlFor="product-image-url">Image URL</label>
              <input
                id="product-image-url"
                type="text"
                className="input"
                placeholder="https://example.com/pizza.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                disabled={loading}
                style={{ fontSize: '12px' }}
              />
            </div>
          )}

          {/* Image Preview Block */}
          {imageUrl && (
            <div className="animate-in" style={{ marginTop: '16px', position: 'relative', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface-raised)' }}>
              <img
                src={imageUrl}
                alt="Product Preview"
                style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
              />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                disabled={loading}
                style={{
                  position: 'absolute', top: '8px', right: '8px', background: 'rgba(44,44,44,0.75)', color: '#fff', border: 'none',
                  borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'background 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--error)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(44,44,44,0.75)'}
                title="Remove image"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
