import { createAuthorizedAdminClient } from '@/lib/auth/admin'
import MenuWorkspace from '@/components/menu/MenuWorkspace'
import { DEFAULT_CURRENCY } from '@/lib/utils/currency'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Menu Management' }
export default async function AdminMenuPage(){
  const supabase=await createAuthorizedAdminClient()
  const [products,categories,currency]=await Promise.all([
    supabase.from('products').select('*').order('created_at',{ascending:false}),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('system_settings').select('value').eq('key','currency').maybeSingle(),
  ])
  if(products.error||categories.error||currency.error)throw products.error||categories.error||currency.error
  return <MenuWorkspace products={(products.data||[]).map(p=>({...p,modifiers:[]}))} categories={categories.data||[]} currency={currency.data?.value||DEFAULT_CURRENCY}/>
}
