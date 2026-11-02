import { createAuthorizedAdminClient } from '@/lib/auth/admin'
import TeamWorkspace, {type TeamMember} from '@/components/team/TeamWorkspace'
import type { Metadata } from 'next'
export const metadata:Metadata={title:'Team Management'}
export default async function AdminStaffPage(){
 const db=await createAuthorizedAdminClient()
 const {data,error}=await db.from('users').select('id,name,username,email,phone,status,role:roles(name)').is('auth_user_id',null).neq('status','deleted').order('created_at',{ascending:false})
 if(error)throw error
 const members=(data||[]).map(m=>({...m,role:Array.isArray(m.role)?m.role[0]||null:m.role})) as TeamMember[]
 return <TeamWorkspace members={members}/>
}
