import { createAuthorizedAdminClient as createAdminClient } from '@/lib/auth/admin'
import type { Metadata } from 'next'
import AdminDashboardClient from './DashboardClient'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function AdminDashboardPage() {
  const supabase = await createAdminClient()
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  const { data: summary, error } = await supabase.rpc('get_admin_dashboard', { p_from_date: startOfDay })
  if (error) throw error

  return (
    <AdminDashboardClient
      todayRevenue={summary.todayRevenue}
      todayOrderCount={summary.todayOrderCount}
      activeOrderCount={summary.activeOrderCount}
      staffOnlineCount={summary.staffCount}
      topItems={summary.topItems}
      recentOrders={summary.recentOrders}
      activeOrders={summary.activeOrders}
      currency={summary.currency}
    />
  )
}
