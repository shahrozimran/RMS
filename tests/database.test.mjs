import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { evaluateOrder } from '../lib/agents/engine.ts'

let db, admin, waiter, manager, product, modifier, ingredient
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const scalar = async (sql, args = []) => Object.values((await query(sql,args))[0])[0]
const rpc = (name,args,casts) => scalar(`select public.${name}(${args.map((_,i)=>`$${i+1}${casts?.[i] ? '::'+casts[i] : ''}`).join(',')})`,args)
const payload = (extra = {}) => ({ order_type: 'takeaway', items: [{ product_id: product, quantity: 1, unit_price: 10, tax_rate: 5 }], ...extra })
const create = (actor = waiter, data = payload()) => rpc('save_order',[actor,JSON.stringify(data)],['uuid','jsonb'])
const settle = (id,amount=10.5,extra={}) => rpc('settle_order',[waiter,id,JSON.stringify([{method:'cash',amount,cash_tendered:amount}]),extra.code??null,extra.discount??0],['uuid','uuid','jsonb','text','numeric'])

before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create publication supabase_realtime;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
  for (const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    // Core PostgreSQL already supplies gen_random_uuid. Supabase installs pgcrypto separately.
    const sql = (await readFile('supabase/migrations/'+file,'utf8')).replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";','')
    await db.exec(sql)
    if (file.startsWith('001_')) await db.exec(`grant all on all tables in schema public to anon,authenticated,service_role; grant all on all sequences in schema public to anon,authenticated,service_role;`)
    if (file.startsWith('010_')) await db.exec(`grant all on all tables in schema public to anon,authenticated,service_role; grant all on all sequences in schema public to anon,authenticated,service_role;`)
  }
  await db.exec(`select set_config('request.jwt.claim.role','service_role',false)`)
  const auth = await scalar('insert into auth.users values(gen_random_uuid()) returning id')
  admin=await scalar(`insert into public.users(name,username,auth_user_id,role_id) values('Admin','test_admin',$1,1) returning id`,[auth])
  waiter=await scalar(`insert into public.users(name,username,role_id,password_hash) values('Waiter','test_waiter',3,'test-hash') returning id`)
  manager=await scalar(`insert into public.users(name,username,role_id,password_hash) values('Manager','test_manager',2,'test-hash') returning id`)
  product=await scalar(`insert into public.products(name,base_price,tax_rate) values('Test meal',10,5) returning id`)
  modifier=await scalar(`insert into public.modifiers(product_id,name,price) values($1,'Extra',2) returning id`,[product])
  ingredient=await scalar(`insert into public.ingredients(name,unit,quantity_available,reorder_threshold) values('Test stock','unit',100,98) returning id`)
  await db.query(`insert into public.product_ingredients(product_id,ingredient_id,quantity_used) values($1,$2,2)`,[product,ingredient])
})
after(async()=>{ await db?.close() })

test('anonymous callers cannot invoke privileged functions or read table capabilities',async()=>{
  await db.exec('set role anon')
  try {
    await assert.rejects(query('select * from public.tables'),/permission denied/)
    await assert.rejects(query('select public.generate_tables(200)'),/permission denied/)
    await assert.rejects(query(`insert into public.qr_pending_orders(table_id,table_token,items) values(1,gen_random_uuid(),'[]')`),/permission denied/)
    await assert.rejects(query('select public.get_order_analytics()'),/permission denied/)
  } finally { await db.exec('reset role') }
})
test('authenticated browser cannot bypass financial transaction APIs',async()=>{
  await db.exec('set role authenticated')
  try {
    await assert.rejects(query(`update public.orders set status='paid'`),/permission denied/)
    await assert.rejects(query(`select public.void_order(gen_random_uuid(),'reason',gen_random_uuid())`),/permission denied/)
  } finally { await db.exec('reset role') }
})
test('authoritative pricing rejects zero-price and foreign/duplicate modifiers; persists trusted modifiers',async()=>{
  await assert.rejects(create(waiter,payload({items:[{product_id:product,quantity:1,unit_price:0,tax_rate:5}]})),/price changed/)
  await assert.rejects(create(waiter,payload({items:[{product_id:product,quantity:1,unit_price:12,tax_rate:0,selected_modifiers:[{id:modifier}]}]})),/price changed/)
  await assert.rejects(create(waiter,payload({items:[{product_id:product,quantity:1,selected_modifiers:[{id:modifier},{id:modifier}]}]})),/duplicate modifier/)
  const order=await create(waiter,payload({items:[{product_id:product,quantity:2,unit_price:12,tax_rate:5,selected_modifiers:[{id:modifier,name:'Forged',price:0}]}]}))
  assert.equal(order.total,25.2)
  const mods=await scalar('select selected_modifiers from public.order_items where order_id=$1',[order.id])
  assert.deepEqual(mods,[{id:modifier,name:'Extra',price:2}])
})
test('edit ownership, allowed state, and rollback preserve original items',async()=>{
  const order=await create()
  await assert.rejects(rpc('save_order',[manager,JSON.stringify(payload()),order.id],['uuid','jsonb','uuid']),/Forbidden/)
  await assert.rejects(rpc('save_order',[waiter,JSON.stringify(payload({items:[{product_id:product,quantity:1,unit_price:0}]})),order.id],['uuid','jsonb','uuid']),/price changed/)
  assert.equal(await scalar('select count(*)::int from public.order_items where order_id=$1',[order.id]),1)
  await settle(order.id)
  await assert.rejects(rpc('save_order',[waiter,JSON.stringify(payload()),order.id],['uuid','jsonb','uuid']),/no longer editable/)
})
test('settlement rejects underpayment, manual discounts, and insufficient tender without partial writes',async()=>{
  const order=await create()
  await assert.rejects(settle(order.id,0.01),/equal the bill/)
  await assert.rejects(settle(order.id,0.5,{discount:10}),/discount code/)
  await assert.rejects(rpc('settle_order',[waiter,order.id,JSON.stringify([{method:'cash',amount:10.5,cash_tendered:1}])],['uuid','uuid','jsonb']),/Insufficient cash/)
  assert.equal(await scalar('select status from public.orders where id=$1',[order.id]),'active')
  assert.equal(await scalar('select count(*)::int from public.payments where order_id=$1',[order.id]),0)
})
test('payment, stock deduction and low-stock alert commit once; replay is rejected',async()=>{
  const order=await create()
  const before=Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient]))
  await settle(order.id)
  assert.equal(Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])),before-2)
  await assert.rejects(settle(order.id),/already closed/)
  assert.equal(await scalar('select count(*)::int from public.payments where order_id=$1',[order.id]),1)
  assert.ok(await scalar(`select count(*)::int from public.notifications where type='low_stock'`)>0)
})
test('discount minimum, subtotal basis, use cap and failed-payment rollback',async()=>{
  await db.exec(`insert into public.discounts(code,type,value,min_order_amount,max_uses) values('TEST10','percentage',10,10,1),('TESTMIN','flat',2,50,null)`)
  const a=await create(), b=await create()
  await assert.rejects(settle(a.id,8.5,{code:'TESTMIN'}),/minimum/)
  await assert.rejects(settle(a.id,0.01,{code:'TEST10'}),/equal the bill/)
  assert.equal(await scalar(`select times_used from public.discounts where code='TEST10'`),0)
  assert.equal((await settle(a.id,9.5,{code:'TEST10'})).total,9.5)
  await assert.rejects(settle(b.id,9.5,{code:'TEST10'}),/exhausted/)
})
test('zero-total bills can settle without a fictitious positive payment',async()=>{
  await db.exec(`insert into public.discounts(code,type,value) values('TESTFREE','flat',100)`)
  const o=await create()
  const result=await rpc('settle_order',[waiter,o.id,'[]','TESTFREE'],['uuid','uuid','jsonb','text'])
  assert.equal(result.total,0)
})
test('void restores recorded stock exactly once and does not manufacture stock on unpaid orders',async()=>{
  const unpaid=await create(manager)
  const before=Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient]))
  await rpc('void_order',[unpaid.id,'Test cancellation',manager],['uuid','text','uuid'])
  assert.equal(Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])),before)
  const paid=await create()
  await settle(paid.id)
  await assert.rejects(rpc('void_order',[paid.id,'No permission',waiter],['uuid','text','uuid']),/Permission denied/)
  await rpc('void_order',[paid.id,'Administrator cancellation',admin],['uuid','text','uuid'])
  assert.equal(Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])),before)
  await assert.rejects(rpc('void_order',[paid.id,'Duplicate cancellation',admin],['uuid','text','uuid']),/already closed/)
  await assert.rejects(settle(paid.id),/already closed/)
})
test('QR confirmation is single-use, validates current catalog and races rejection on one parent',async()=>{
  const token=await scalar('select qr_token from public.tables where id=1')
  const q=await rpc('submit_qr_order',[token,'Guest',JSON.stringify(payload().items)],['uuid','text','jsonb'])
  const o=await rpc('process_qr_order',[waiter,q.id,true],['uuid','uuid','boolean'])
  assert.equal(o.source,'qr')
  await assert.rejects(rpc('process_qr_order',[waiter,q.id,true],['uuid','uuid','boolean']),/already processed/)
  await assert.rejects(rpc('process_qr_order',[waiter,q.id,false],['uuid','uuid','boolean']),/already processed/)
  const q2=await rpc('submit_qr_order',[token,'Guest',JSON.stringify(payload().items)],['uuid','text','jsonb'])
  await db.query('update public.products set is_86d=true where id=$1',[product])
  await assert.rejects(rpc('process_qr_order',[waiter,q2.id,true],['uuid','uuid','boolean']),/unavailable/)
  assert.equal(await scalar('select status from public.qr_pending_orders where id=$1',[q2.id]),'pending')
  await db.query('update public.products set is_86d=false where id=$1',[product])
})
test('a table remains occupied while another open order uses it',async()=>{
  const a=await create(waiter,payload({order_type:'dine_in',table_id:2}))
  const b=await create(waiter,payload({order_type:'dine_in',table_id:2}))
  await settle(a.id)
  assert.equal(await scalar('select status from public.tables where id=2'),'occupied')
  await assert.rejects(rpc('mutate_table',[waiter,2,'free'],['uuid','integer','text']),/open order/)
  await settle(b.id)
  assert.equal(await scalar('select status from public.tables where id=2'),'free')
})
test('status and password updates revoke tokens and RLS denies inactive administrators',async()=>{
  const before=await scalar('select session_version from public.users where id=$1',[manager])
  await db.query(`update public.users set password_hash='replacement' where id=$1`,[manager])
  assert.equal(await scalar('select session_version from public.users where id=$1',[manager]),before+1)
  await db.query(`update public.users set status='suspended' where id=$1`,[manager])
  await assert.rejects(create(manager),/Permission denied/)
  const auth=await scalar('select auth_user_id from public.users where id=$1',[admin])
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[auth])
  assert.equal(await scalar('select public.is_admin()'),true)
  await db.query(`update public.users set status='suspended' where id=$1`,[admin])
  assert.equal(await scalar('select public.is_admin()'),false)
  await db.query(`update public.users set status='active' where id=$1`,[admin])
})
test('open-shift uniqueness prevents concurrent clock-in duplicates',async()=>{
  await db.query('insert into public.shifts(staff_id) values($1)',[waiter])
  await assert.rejects(db.query('insert into public.shifts(staff_id) values($1)',[waiter]),/unique constraint/)
})
test('durable quotas use independent submission and polling buckets',async()=>{
  assert.equal(await rpc('consume_rate_limit',['test-submit',1,600]),true)
  assert.equal(await rpc('consume_rate_limit',['test-submit',1,600]),false)
  for(let i=0;i<6;i++) assert.equal(await rpc('consume_rate_limit',['test-poll',100,60]),true)
})
test('products with variants cannot be purchased at a hidden base price',async()=>{
  const p=await scalar(`insert into public.products(name,base_price,tax_rate,price_variants) values('Sized meal',0,0,'[{"label":"Small","price":10},{"label":"Large","price":20}]') returning id`)
  for(const label of [null,'',undefined]) await assert.rejects(create(waiter,payload({items:[{product_id:p,quantity:1,variant_label:label,unit_price:0,tax_rate:0}]})),/Select a product variant/)
  assert.equal((await create(waiter,payload({items:[{product_id:p,quantity:1,variant_label:'Large',unit_price:20,tax_rate:0}]}))).total,20)
})
test('ambiguous historical deductions block voiding without partially refunding',async()=>{
  const o=await create()
  await db.query(`update public.orders set status='paid' where id=$1`,[o.id])
  await db.query(`insert into public.stock_transactions(ingredient_id,type,quantity,reference_id) values($1,'deduction',2,$2)`,[ingredient,o.id])
  await assert.rejects(rpc('void_order',[o.id,'Historical cancellation',admin],['uuid','text','uuid']),/require reconciliation/)
  assert.equal(await scalar('select status from public.orders where id=$1',[o.id]),'paid')
})
test('failed stock deduction rolls back payment and discount usage',async()=>{
  const o=await create()
  const available=await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])
  await db.query('update public.ingredients set quantity_available=0 where id=$1',[ingredient])
  await assert.rejects(settle(o.id),/Insufficient ingredient/)
  assert.equal(await scalar('select status from public.orders where id=$1',[o.id]),'active')
  assert.equal(await scalar('select count(*)::int from public.payments where order_id=$1',[o.id]),0)
  await db.query('update public.ingredients set quantity_available=$1 where id=$2',[available,ingredient])
})
test('logout revokes only the current token generation',async()=>{
  const version=await scalar('select session_version from public.users where id=$1',[waiter])
  await rpc('revoke_staff_sessions',[waiter,version],['uuid','integer'])
  await rpc('revoke_staff_sessions',[waiter,version],['uuid','integer'])
  assert.equal(await scalar('select session_version from public.users where id=$1',[waiter]),version+1)
})
test('database aggregates count history beyond the PostgREST row cap',async()=>{
  const id=await scalar(`insert into public.users(name,username,role_id) values('History','test_history',3) returning id`)
  await db.query(`insert into public.orders(staff_id,order_type,status,total) select $1,'takeaway','paid',1 from generate_series(1,1105)`,[id])
  const rows=await rpc('get_staff_performance',[])
  assert.equal(rows.find(row=>row.id===id).ordersProcessed,1105)
  assert.equal(rows.find(row=>row.id===id).totalRevenue,1105)
})
test('public QR projection returns restaurant name and excludes table capability',async()=>{
  const token=await scalar('select qr_token from public.tables where id=1')
  const menu=await rpc('get_qr_menu',[token],['uuid'])
  assert.equal(menu.settings.restaurant_name,'My Restaurant')
  assert.equal(Object.hasOwn(menu.table,'qr_token'),false)
})


// The new agent subsystem is tested only in this disposable database.
async function agentOrder(stock=1) {
  const p=await scalar("insert into public.products(name,base_price,tax_rate) values('Agent test burger',10,5) returning id")
  const ingredient=await scalar("insert into public.ingredients(name,unit,quantity_available,reorder_threshold) values('Agent test buns','pieces',$1,2) returning id",[stock])
  await query('insert into public.product_ingredients(product_id,ingredient_id,quantity_used) values($1,$2,1)',[p,ingredient])
  const order=await create(waiter,{order_type:'takeaway',items:[{product_id:p,quantity:2,unit_price:10,tax_rate:5}]})
  return {order,ingredient,product:p}
}
async function claimFor(orderId) {
  await query("update public.agent_jobs set available_at='2099-01-01' where status='pending' and order_id<>$1",[orderId])
  await query("update public.agent_jobs set available_at=now()-interval '1 second' where order_id=$1",[orderId])
  const job=await rpc('claim_agent_job',[])
  assert.equal(job?.context.order.id,orderId)
  return job
}
const finish=job=>rpc('complete_agent_job',[job.id,job.lease_token,job.generation,job.context_hash,JSON.stringify(evaluateOrder(job))],['uuid','uuid','integer','text','jsonb'])

test('agent subsystem starts paused and browser roles cannot claim, complete or configure work',async()=>{
  assert.equal(await scalar("select value from public.system_settings where key='agent_review_enabled'"),false)
  const fixture=await agentOrder()
  assert.equal(await scalar('select count(*)::int from public.agent_jobs where order_id=$1',[fixture.order.id]),0)
  assert.equal(await rpc('claim_agent_job',[]),null)
  await assert.rejects(rpc('set_agent_review_enabled',[waiter,true],['uuid','boolean']),/Admin required|Permission denied/)
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role)
    try{
      await assert.rejects(rpc('claim_agent_job',[]),/permission denied/)
      await assert.rejects(rpc('set_agent_review_enabled',[admin,true],['uuid','boolean']),/permission denied/)
      await assert.rejects(query("insert into public.agent_jobs(order_id) values($1)",[fixture.order.id]),/permission denied/)
      if(role==='anon')await assert.rejects(query('select * from public.agent_runs'),/permission denied/)
    }finally{await db.exec('reset role')}
  }
  await rpc('set_agent_review_enabled',[admin,true],['uuid','boolean'])
})

test('order/item transaction creates one coalesced job and its snapshot excludes customer PII',async()=>{
  const {order}=await agentOrder()
  assert.equal(await scalar('select count(*)::int from public.agent_jobs where order_id=$1',[order.id]),1)
  await query("update public.orders set customer_name='Sensitive name',customer_phone='+15551234567',notes='private request' where id=$1",[order.id])
  const job=await claimFor(order.id)
  assert.equal(JSON.stringify(job).includes('Sensitive name'),false)
  assert.equal(JSON.stringify(job).includes('+15551234567'),false)
  assert.equal(JSON.stringify(job).includes('private request'),false)
  assert.equal(job.context.ingredients[0].required,2)
  assert.equal(job.context.ingredients[0].open_demand,2)
  assert.ok(evaluateOrder(job).findings.some(f=>f.kind==='stock_pressure'))
  assert.equal(await finish(job),true)
  assert.equal(await finish(job),false)
  assert.equal(await scalar('select count(*)::int from public.agent_runs where job_id=$1',[job.id]),1)
  assert.equal(await scalar('select status from public.orders where id=$1',[order.id]),'active')
  assert.equal(Number(await scalar('select quantity_available from public.ingredients where id=$1',[job.context.ingredients[0].id])),1)
})

test('leased jobs cannot complete after a relevant stock change',async()=>{
  const {order,ingredient}=await agentOrder()
  const old=await claimFor(order.id)
  await query('update public.ingredients set quantity_available=3 where id=$1',[ingredient])
  assert.equal(await finish(old),false)
  const fresh=await claimFor(order.id)
  assert.ok(fresh.generation>old.generation)
  assert.notEqual(fresh.context_hash,old.context_hash)
  assert.equal(await finish(fresh),true)
})

test('expired leases are reclaimed and prior lease tokens cannot complete the replacement',async()=>{
  const {order}=await agentOrder()
  const first=await claimFor(order.id)
  await query("update public.agent_jobs set locked_until=now()-interval '1 second' where id=$1",[first.id])
  const replacement=await claimFor(order.id)
  assert.notEqual(first.lease_token,replacement.lease_token)
  assert.equal(await finish(first),false)
  assert.equal(await finish(replacement),true)
})

test('retry exhaustion becomes a visible dead job; administrator can explicitly requeue',async()=>{
  const {order}=await agentOrder()
  for(let i=0;i<5;i++){
    const job=await claimFor(order.id)
    assert.equal(await rpc('fail_agent_job',[job.id,job.lease_token,job.generation,'WORKER_FAILURE'],['uuid','uuid','integer','text']),true)
  }
  assert.equal(await scalar('select status from public.agent_jobs where order_id=$1',[order.id]),'dead')
  await rpc('queue_agent_reviews',[admin,order.id],['uuid','uuid'])
  assert.equal(await scalar('select attempts from public.agent_jobs where order_id=$1',[order.id]),0)
})

test('administrator review is idempotent, audited, and never changes stock or financial state',async()=>{
  const {order,ingredient}=await agentOrder()
  const job=await claimFor(order.id);await finish(job)
  const finding=await scalar('select id from public.agent_recommendations where order_id=$1 and status=\'open\' limit 1',[order.id])
  await assert.rejects(rpc('review_agent_recommendation',[waiter,finding,'acknowledged',''],['uuid','uuid','text','text']),/Admin required|Permission denied/)
  const result=await rpc('review_agent_recommendation',[admin,finding,'acknowledged','Checked with the kitchen'],['uuid','uuid','text','text'])
  assert.equal(result.status,'acknowledged')
  await assert.rejects(rpc('review_agent_recommendation',[admin,finding,'dismissed',''],['uuid','uuid','text','text']),/already reviewed/)
  assert.equal(Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])),1)
  assert.equal(await scalar('select status from public.orders where id=$1',[order.id]),'active')
  assert.equal(await scalar('select count(*)::int from public.activity_logs where action=\'AGENT_RECOMMENDATION_REVIEWED\' and entity_id=$1',[finding]),1)
})

test('expired evidence becomes stale when a review is attempted',async()=>{
  const {order}=await agentOrder()
  const job=await claimFor(order.id);await finish(job)
  const finding=await scalar('select id from public.agent_recommendations where order_id=$1 and status=\'open\' limit 1',[order.id])
  await query("update public.agent_recommendations set expires_at=now()-interval '1 second' where id=$1",[finding])
  const result=await rpc('review_agent_recommendation',[admin,finding,'acknowledged',''],['uuid','uuid','text','text'])
  assert.equal(result.status,'stale')
})

test('pausing prevents claims and source hash validation still catches a change while paused',async()=>{
  const {order,ingredient}=await agentOrder()
  const job=await claimFor(order.id);await finish(job)
  const finding=await scalar('select id from public.agent_recommendations where order_id=$1 and status=\'open\' limit 1',[order.id])
  await rpc('set_agent_review_enabled',[admin,false],['uuid','boolean'])
  assert.equal(await rpc('claim_agent_job',[]),null)
  await query('update public.ingredients set quantity_available=10 where id=$1',[ingredient])
  assert.equal((await rpc('review_agent_recommendation',[admin,finding,'acknowledged',''],['uuid','uuid','text','text'])).status,'stale')
  await rpc('set_agent_review_enabled',[admin,true],['uuid','boolean'])
})

test('rolled-back business transactions cannot leave durable agent jobs behind',async()=>{
  let id
  await db.exec('BEGIN')
  try{
    id=(await agentOrder()).order.id
    assert.equal(await scalar('select count(*)::int from public.agent_jobs where order_id=$1',[id]),1)
  }finally{await db.exec('ROLLBACK')}
  assert.equal(await scalar('select count(*)::int from public.agent_jobs where order_id=$1',[id]),0)
})
