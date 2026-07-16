import { createAdminClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import AdminDashboardClient from './DashboardClient'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function AdminDashboardPage() {
  const supabase = await createAdminClient()
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  // Parallel data fetching
  const [
    { data: todayOrders },
    { data: activeOrders },
    { data: staffCount },
    { data: topItems },
    { data: recentOrders },
    { data: settings },
  ] = await Promise.all([
    supabase.from('orders').select('total, status').gte('created_at', startOfDay).eq('status', 'paid'),
    supabase.from('orders').select('id, status, order_type, total, created_at, staff:users(name), table:tables(table_number)').in('status', ['active', 'billed']).order('created_at', { ascending: false }),
    supabase.from('users').select('id', { count: 'exact' }).eq('status', 'active').neq('role_id', 1),
    supabase.rpc('get_top_items', { p_limit: 5 }),
    supabase.from('orders').select('id, status, order_type, total, created_at, staff:users(name), table:tables(table_number)').order('created_at', { ascending: false }).limit(8),
    supabase.from('system_settings').select('key, value').in('key', ['currency', 'restaurant_name']),
  ])

  const todayRevenue = (todayOrders ?? []).reduce((s, o) => s + Number(o.total), 0)
  const currency = settings?.find(s => s.key === 'currency')?.value ?? { code: 'USD', symbol: '$', locale: 'en-US' }

  return (
    <AdminDashboardClient
      todayRevenue={todayRevenue}
      todayOrderCount={todayOrders?.length ?? 0}
      activeOrderCount={activeOrders?.length ?? 0}
      staffOnlineCount={staffCount ?? 0}
      topItems={topItems ?? []}
      recentOrders={recentOrders ?? []}
      activeOrders={activeOrders ?? []}
      currency={currency}
    />
  )
}
