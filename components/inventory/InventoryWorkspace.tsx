'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Boxes, ClipboardList, Plus, Search, Soup } from 'lucide-react'
import { ingredientUnits, type Ingredient, type InventoryData, type RecipeProduct } from '@/lib/api/inventory-types'
import { apiGet } from '@/lib/api/client'
import LocalDateTime from '@/components/ui/LocalDateTime'
import './inventory.css'

const units = { g: 'Grams (g)', kg: 'Kilograms (kg)', mL: 'Millilitres (mL)', L: 'Litres (L)', pcs: 'Pieces (pcs)' }
const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 3 })
const sample: InventoryData = {
  ingredients: [
    { id: 'sauce', name: 'Tomato sauce', unit: 'mL', quantity_available: 1800, reorder_threshold: 500, updated_at: null },
    { id: 'dough', name: 'Pizza dough', unit: 'pcs', quantity_available: 12, reorder_threshold: 5, updated_at: null },
    { id: 'chicken', name: 'Chicken', unit: 'g', quantity_available: 480, reorder_threshold: 500, updated_at: null },
  ],
  products: [
    { id: 'pizza', name: 'Chicken pizza', available: true, has_options: false, makeable: 4, recipe: { sauce: 90, dough: 1, chicken: 120 } },
    { id: 'sandwich', name: 'Chicken sandwich', available: true, has_options: false, makeable: 6, recipe: { sauce: 30, chicken: 80 } },
  ],
  history: [
    { id: 'sample-usage', name: 'Chicken', unit: 'g', type: 'deduction', quantity: 240, reference_id: null, notes: 'Order confirmed', performed_by: 'Alex Morgan', created_at: '2026-11-06T12:00:00Z' },
  ],
}

type Edit = 'add' | Ingredient | RecipeProduct
type Change =
  | { action: 'add'; name: string; unit: string; count: number; threshold: number }
  | { action: 'count'; id: string; count: number; threshold: number; expectedAt: string | null; note: string }
  | { action: 'recipe'; id: string; lines: Record<string, number>; previous: Record<string, number> }
const tabs = [{ id: 'stock', label: 'Stock on hand' }, { id: 'recipes', label: 'Recipes & how many we can make' }, { id: 'history', label: 'Stock history' }] as const

function practiceChange(data: InventoryData, change: Change): InventoryData {
  let ingredients = data.ingredients
  let products = data.products
  let history = data.history
  if (change.action === 'recipe') {
    products = products.map(product => product.id === change.id ? { ...product, recipe: change.lines } : product)
  } else {
    const old = change.action === 'count' ? ingredients.find(item => item.id === change.id) : undefined
    const updated = { id: old?.id ?? crypto.randomUUID(), name: old?.name ?? (change.action === 'add' ? change.name : ''),
      unit: old?.unit ?? (change.action === 'add' ? change.unit : ''), quantity_available: change.count, reorder_threshold: change.threshold, updated_at: null }
    ingredients = old ? ingredients.map(item => item.id === old.id ? updated : item) : [...ingredients, updated]
    const delta = change.count - (old?.quantity_available ?? 0)
    if (delta !== 0) history = [{ id: crypto.randomUUID(), name: updated.name, unit: updated.unit,
      type: old ? 'adjustment' : 'top_up', quantity: delta, reference_id: null, notes: change.action === 'count' ? change.note : 'Opening stock',
      performed_by: 'Alex Morgan', created_at: new Date().toISOString() }, ...history]
  }
  return { ingredients, history, products: products.map(product => {
    const limits = Object.entries(product.recipe).map(([id, used]) => Math.floor(((ingredients.find(item => item.id === id)?.quantity_available ?? 0) * 1000) / Math.round(used * 1000)))
    return { ...product, makeable: limits.length ? Math.min(...limits) : null }
  }) }
}

export default function InventoryWorkspace({ preview = false }: { preview?: boolean }) {
  const [data, setData] = useState<InventoryData | null>(preview ? sample : null)
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('stock')
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<Edit | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const load = () => apiGet<{ data: InventoryData }>('/api/inventory')

  useEffect(() => {
    if (preview) return
    let active = true
    load().then(result => { if (active) setData(result.data) }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [preview])

  function open(value: Edit | null) {
    setEdit(value); setError(''); setNotice('')
  }

  async function refresh() {
    setBusy(true); setError(''); setNotice('')
    try { setData((await load()).data); setEdit(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh inventory.') }
    finally { setBusy(false) }
  }

  async function save(change: Change) {
    if (!data || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (preview) setData(practiceChange(data, change))
      else {
        const response = await fetch('/api/inventory', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not save your changes.')
        try { setData((await load()).data) }
        catch { setError('Your changes were saved. Refresh to see the current count.') }
      }
      setEdit(null)
      setNotice(change.action === 'recipe' ? 'Recipe saved.' : change.action === 'add' ? 'Ingredient added.' : 'Stock count saved.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your changes.') }
    finally { setBusy(false) }
  }

  const stock = data?.ingredients ?? []
  const products = data?.products ?? []
  const ingredients = new Map(stock.map(item => [item.id, item]))
  const match = (name: string) => name.toLowerCase().includes(search.trim().toLowerCase())

  return <div className="inventory-workspace">
    <div className="workspace-title"><div><span className="eyebrow">Kitchen supplies</span><h1>Ingredients</h1>
      <p>Count what you have, set what each dish uses, and see how much more you can make.</p></div>
      {data && <button className="btn btn-primary" disabled={busy} onClick={() => { setTab('stock'); open('add') }}><Plus size={16}/>Add ingredient</button>}
    </div>
    <div className="notice inventory-note"><Boxes size={18}/><p>Stock comes out when you send a POS order to the kitchen or confirm a QR order. Dishes can share the same ingredients.</p></div>
    {error && <p className="notice inventory-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!data && !error && <p role="status">Opening inventory…</p>}
    {!data && error && <button className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>Try again</button>}
    {data && <>
      <div className="filter-toolbar inventory-toolbar">
        <nav className="filter-tabs" aria-label="Ingredient views">{tabs.map(item => <button key={item.id} className={`filter-tab ${tab === item.id ? 'active' : ''}`}
          aria-pressed={tab === item.id} disabled={busy} onClick={() => { setTab(item.id); setSearch(''); open(null) }}>{item.label}</button>)}</nav>
        {!preview && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void refresh()}>Refresh</button>}
      </div>
      {edit && (edit === 'add' || 'unit' in edit
        ? <CountForm key={edit === 'add' ? edit : edit.id} ingredient={edit === 'add' ? undefined : edit} busy={busy} save={save} close={() => open(null)}/>
        : <RecipeForm key={edit.id} product={edit} ingredients={stock} busy={busy} save={save} close={() => open(null)}/>)}
      {tab !== 'history' && <label className="search-field inventory-search"><Search size={16}/><input aria-label={tab === 'stock' ? 'Find an ingredient' : 'Find a dish'}
        placeholder={tab === 'stock' ? 'Find an ingredient…' : 'Find a dish…'} value={search} onChange={event => setSearch(event.target.value)}/></label>}
      {tab === 'stock' && <section className="panel"><div className="panel-heading"><div><h2>Stock on hand</h2>
        <p>{stock.filter(item => item.quantity_available <= item.reorder_threshold).length} at or below the low stock level</p></div></div>
        <div className="inventory-table"><table className="data-table"><thead><tr><th>Ingredient</th><th>On hand</th><th>Low stock level</th><th>Used in</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{stock.filter(item => match(item.name)).map(item => <tr key={item.id}><td><strong>{item.name}</strong></td>
            <td><strong className="num">{amount.format(item.quantity_available)} {item.unit}</strong> {item.quantity_available <= item.reorder_threshold && <span className="badge badge-orange">Low stock</span>}</td>
            <td>{amount.format(item.reorder_threshold)} {item.unit}</td><td>{products.filter(product => item.id in product.recipe).length} recipes</td>
            <td><button className="btn btn-secondary btn-sm" disabled={busy} aria-label={`Update count for ${item.name}`} onClick={() => open(item)}>Update count</button></td></tr>)}</tbody>
        </table></div>{!stock.some(item => match(item.name)) && <p className="inventory-empty">No ingredients found. Add an ingredient to start tracking it.</p>}
      </section>}
      {tab === 'recipes' && <section className="panel"><div className="panel-heading"><div><h2>How many can we make?</h2>
        <p>Each estimate is for one dish at a time. Making one dish uses stock that other dishes may share.</p></div><Soup size={21}/></div>
        <div className="inventory-recipes">{products.filter(item => match(item.name)).map(product => <article className="inventory-recipe" key={product.id}>
          <div className="inventory-recipe-title"><h3>{product.name}</h3>{!product.available && <span className="badge badge-gray">Off menu</span>}</div>
          <p className="inventory-yield">{product.makeable === null ? <span>No recipe yet</span> : <><strong className="num">{amount.format(product.makeable)}</strong> can be made</>}</p>
          <div className="inventory-recipe-lines">{Object.entries(product.recipe).map(([id, used]) => {
            const ingredient = ingredients.get(id)
            return <span key={id}>{ingredient?.name} · {amount.format(used)} {ingredient?.unit}</span>
          })}</div>
          {product.has_options && <small>Uses the base recipe for sizes and extras.</small>}
          <button className="btn btn-secondary btn-sm" disabled={busy || !stock.length} aria-label={`Edit recipe for ${product.name}`} onClick={() => open(product)}>
            {product.makeable === null ? 'Add recipe' : 'Edit recipe'} <ArrowUpRight size={14}/>
          </button>
        </article>)}</div>
        {!products.some(item => match(item.name)) && <p className="inventory-empty">No matching dishes. Add dishes in Menu management.</p>}
        {!stock.length && <p className="inventory-empty">Add an ingredient before creating a recipe.</p>}
      </section>}
      {tab === 'history' && <section className="panel"><div className="panel-heading"><div><h2>Recent stock changes</h2><p>Up to 50 changes, with their reason and who recorded them.</p></div><ClipboardList size={20}/></div>
        <div className="inventory-table"><table className="data-table"><thead><tr><th>Ingredient</th><th>Change</th><th>Reason</th><th>Recorded by</th><th>When</th></tr></thead>
          <tbody>{data.history.map(item => {
            const change = item.type === 'deduction' ? -item.quantity : item.quantity
            return <tr key={item.id}><td><strong>{item.name}</strong></td><td className="num">{change > 0 ? '+' : ''}{amount.format(change)} {item.unit}</td>
              <td>{item.notes ?? 'Stock change'}{item.reference_id && <><br/><Link href={`/admin/orders/${item.reference_id}`}>Order #{item.reference_id.slice(-6).toUpperCase()}</Link></>}</td>
              <td>{item.performed_by ?? 'System'}</td><td><LocalDateTime value={item.created_at} mode="date"/> · <LocalDateTime value={item.created_at}/></td></tr>
          })}</tbody>
        </table></div>{!data.history.length && <p className="inventory-empty">Stock changes will appear here.</p>}
      </section>}
    </>}
  </div>
}

type FormActions = { busy: boolean; save: (change: Change) => Promise<void>; close: () => void }

function CountForm({ ingredient, busy, save, close }: FormActions & { ingredient?: Ingredient }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const count = Number(fields.get('count'))
    const threshold = Number(fields.get('threshold'))
    void save(ingredient ? { action: 'count', id: ingredient.id, count, threshold, expectedAt: ingredient.updated_at, note: String(fields.get('note')) }
      : { action: 'add', name: String(fields.get('name')), unit: String(fields.get('unit')), count, threshold })
  }

  return <section className="panel inventory-editor"><div className="panel-heading"><div><h2>{ingredient ? `Update ${ingredient.name}` : 'Add an ingredient'}</h2>
    <p>{ingredient ? 'Enter the full amount you have now after counting or receiving a delivery.' : 'Choose one unit. Recipes will use the same unit.'}</p></div></div>
    <form onSubmit={submit}><fieldset className="inventory-form" disabled={busy}>
      {!ingredient && <><label className="input-group"><span className="input-label">Ingredient name</span><input autoFocus name="name" className="input" required maxLength={120} placeholder="e.g. Tomato sauce"/></label>
        <label className="input-group"><span className="input-label">Unit</span><select className="input" name="unit" required defaultValue=""><option value="" disabled>Choose a unit</option>
          {ingredientUnits.map(unit => <option key={unit} value={unit}>{units[unit]}</option>)}</select></label></>}
      <label className="input-group"><span className="input-label">{ingredient ? `New total count (${ingredient.unit})` : 'Starting count'}</span><input autoFocus={Boolean(ingredient)} className="input" name="count" type="number" min={0} max={9999999.999} step="0.001" required defaultValue={ingredient?.quantity_available ?? 0}/></label>
      <label className="input-group"><span className="input-label">{ingredient ? `Low stock level (${ingredient.unit})` : 'Low stock level'}</span><input className="input" name="threshold" type="number" min={0} max={9999999.999} step="0.001" required defaultValue={ingredient?.reorder_threshold ?? 0}/></label>
      {ingredient && <label className="input-group inventory-span"><span className="input-label">Reason for change</span><input className="input" name="note" required maxLength={200} placeholder="e.g. Delivery received or physical count"/></label>}
      <div className="inventory-form-actions"><button className="btn btn-primary">{busy ? 'Saving…' : ingredient ? 'Save count' : 'Add ingredient'}</button><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button></div>
    </fieldset></form>
  </section>
}

type RecipeLine = { key: string; ingredient: string; count: string }

function RecipeForm({ product, ingredients, busy, save, close }: FormActions & { product: RecipeProduct; ingredients: Ingredient[] }) {
  const [lines, setLines] = useState<RecipeLine[]>(() => Object.entries(product.recipe).map(([id, value]) => ({ key: id, ingredient: id, count: String(value) })))
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = Object.fromEntries(lines.map(line => [line.ingredient, Number(line.count)]))
    if (Object.keys(next).length !== lines.length) { setError('Use each ingredient once per recipe.'); return }
    void save({ action: 'recipe', id: product.id, lines: next, previous: product.recipe })
  }

  return <section className="panel inventory-editor"><div className="panel-heading"><div><h2>Recipe for {product.name}</h2>
    <p>Enter how much of each ingredient goes into one serving. Changes apply to new orders.</p></div></div>
    <form onSubmit={submit}><fieldset className="inventory-form" disabled={busy}>
      <div className="inventory-span inventory-lines">{lines.map((line, index) => {
        const unit = ingredients.find(item => item.id === line.ingredient)?.unit
        const update = (patch: Partial<RecipeLine>) => setLines(current => current.map(item => item.key === line.key ? { ...item, ...patch } : item))
        return <div className="inventory-line" key={line.key}><label className="input-group"><span className="input-label">Ingredient {index + 1}</span>
          <select className="input" value={line.ingredient} onChange={event => update({ ingredient: event.target.value, count: '' })} required>
            <option value="">Choose an ingredient</option>{ingredients.map(item => <option key={item.id} value={item.id} disabled={item.id !== line.ingredient && lines.some(other => other.ingredient === item.id)}>{item.name} ({item.unit})</option>)}
          </select></label>
          <label className="input-group"><span className="input-label">Amount per serving{unit ? ` (${unit})` : ''}</span><input className="input" type="number" min={0.001} max={9999999.999} step="0.001" required value={line.count} onChange={event => update({ count: event.target.value })}/></label>
          <button type="button" className="btn btn-secondary btn-sm" aria-label={`Remove ingredient ${index + 1}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Remove</button></div>
      })}</div>
      <div className="inventory-span"><button type="button" className="btn btn-secondary btn-sm" disabled={lines.length >= Math.min(ingredients.length, 40)}
        onClick={() => setLines(current => [...current, { key: crypto.randomUUID(), ingredient: '', count: '' }])}><Plus size={15}/>Add recipe ingredient</button></div>
      {error && <p className="inventory-span" role="alert">{error}</p>}
      {!lines.length && <p className="inventory-span muted">An empty recipe turns off ingredient deduction for new orders of this dish.</p>}
      <div className="inventory-form-actions"><button className="btn btn-primary">{busy ? 'Saving…' : 'Save recipe'}</button><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button></div>
    </fieldset></form>
  </section>
}
