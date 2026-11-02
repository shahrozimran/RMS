// Authentication remains in HttpOnly cookies; no service credentials enter browser code.
import type { PosSettings, SettingEntry } from './types'

export async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body as T
}
export async function readSettings() {
  const { settings } = await apiGet<{ settings: PosSettings }>('/api/settings')
  return Object.entries(settings).map(([key, value]) => ({ key, value })) as SettingEntry[]
}
