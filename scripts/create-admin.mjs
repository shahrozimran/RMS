import { createClient } from '@supabase/supabase-js'

// Operator-only provisioning. Supply a unique password through the environment.
const required = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BOOTSTRAP_ADMIN_EMAIL','BOOTSTRAP_ADMIN_USERNAME','BOOTSTRAP_ADMIN_PASSWORD']
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`)
const email = process.env.BOOTSTRAP_ADMIN_EMAIL
const username = process.env.BOOTSTRAP_ADMIN_USERNAME
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
if (!/^[a-z0-9_]{3,50}$/.test(username) || !email.includes('@') || password.length < 16) throw new Error('Use a valid email, lowercase username and unique password of at least 16 characters')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const { data: role, error: roleError } = await db.from('roles').select('id').eq('name','Admin').single()
if (roleError || !role) throw new Error('Admin role not found; apply migrations first')
const { data: identity, error: authError } = await db.auth.admin.createUser({ email,password,email_confirm:true })
if (authError || !identity.user) throw new Error(authError?.message || 'Could not create admin identity')
const { error } = await db.from('users').insert({ auth_user_id:identity.user.id,name:process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator',username,email,role_id:role.id,status:'active' })
if (error) {
  const rollback = await db.auth.admin.deleteUser(identity.user.id)
  if (rollback.error) console.error('Provisioning rollback failed; remove the newly created Auth identity manually:',identity.user.id)
  throw new Error(error.message)
}
console.log('Administrator created. Sign in through the Admin tab. Remove bootstrap password variables from your environment.')
