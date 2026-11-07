export const ingredientUnits = ['g', 'kg', 'mL', 'L', 'pcs'] as const

export type Ingredient = {
  id: string
  name: string
  unit: string
  quantity_available: number
  reorder_threshold: number
  updated_at: string | null
}

export type RecipeProduct = {
  id: string
  name: string
  available: boolean
  has_options: boolean
  makeable: number | null
  recipe: Record<string, number>
}

export type StockChange = {
  id: string
  name: string
  unit: string
  type: 'top_up' | 'deduction' | 'adjustment'
  quantity: number
  reference_id: string | null
  notes: string | null
  performed_by: string | null
  created_at: string
}

export type InventoryData = { ingredients: Ingredient[]; products: RecipeProduct[]; history: StockChange[] }
