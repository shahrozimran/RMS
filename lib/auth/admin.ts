import { redirect } from 'next/navigation'
import { getSession } from './session'
import { createAdminClient } from '@/lib/supabase/server'

export async function createAuthorizedAdminClient() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin' || session.authType !== 'admin') redirect('/staff/dashboard')
  return createAdminClient()
}
