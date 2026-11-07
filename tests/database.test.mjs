import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { evaluateOrder } from '../lib/agents/engine.ts'
import { createOpenRouter } from '../lib/agents/openrouter.ts'
import { retrieveRoleKnowledge, runAiReview } from '../lib/agents/rag.ts'
import { operationsFactsSchema } from '../lib/agents/rag-contracts.ts'
import { answerQuestion, questionSource } from '../lib/agents/questions.ts'

let db, admin, waiter, manager, product, modifier, ingredient
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const scalar = async (sql, args = []) => Object.values((await query(sql,args))[0])[0]
const rpc = (name,args,casts) => scalar(`select public.${name}(${args.map((_,i)=>`$${i+1}${casts?.[i] ? '::'+casts[i] : ''}`).join(',')})`,args)
const payload = (extra = {}) => ({ order_type: 'takeaway', items: [{ product_id: product, quantity: 1, unit_price: 10, tax_rate: 5 }], ...extra })
const create = (actor = waiter, data = payload()) => rpc('save_order',[actor,JSON.stringify(data)],['uuid','jsonb'])
const settle = (id,amount=10.5,extra={}) => rpc('settle_order',[waiter,id,JSON.stringify([{method:'cash',amount,cash_tendered:amount}]),extra.code??null,extra.discount??0],['uuid','uuid','jsonb','text','numeric'])
const stockCount = async id => Number(await scalar('select quantity_available from public.ingredients where id=$1',[id]))

async function legacyOrder(productId = product, quantity = 1) {
  const orderId = await scalar("insert into public.orders(staff_id,order_type,status,subtotal,tax_amount,total) values($1,'takeaway','active',$2,$3,$4) returning id",
    [waiter,10*quantity,0.5*quantity,10.5*quantity])
  await query('insert into public.order_items(order_id,product_id,quantity,unit_price,tax_rate,tax_amount,subtotal) values($1,$2,$3,10,5,$4,$5)',
    [orderId,productId,quantity,0.5*quantity,10*quantity])
  return { id: orderId }
}

before(async () => {
  db = new PGlite({ extensions: { vector } })
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

test('direct browser grants hide staff verifiers, prevent account mutations and preserve administrator order joins',async()=>{
  const authId=await scalar('select auth_user_id from public.users where id=$1',[admin])
  const unlinked=await scalar('insert into auth.users values(gen_random_uuid()) returning id')
  const demotedIdentity=await scalar('insert into auth.users values(gen_random_uuid()) returning id')
  const demoted=await scalar("insert into public.users(name,username,role_id,auth_user_id) values('Former admin','test_demoted',3,$1) returning id",[demotedIdentity])
  const historic=await scalar("insert into public.orders(staff_id,order_type,status,total) values($1,'takeaway','paid',10) returning id",[demoted])
  await db.exec('set role authenticated')
  try{
    await query("select set_config('request.jwt.claim.sub',$1,false)",[unlinked])
    assert.equal(await scalar('select count(id)::int from public.products'),0)
    await assert.rejects(query('select code from public.discounts'),/permission denied/)
    await assert.rejects(query('select customer_name from public.qr_pending_orders'),/permission denied/)
    await query("select set_config('request.jwt.claim.sub',$1,false)",[demotedIdentity])
    assert.equal(await scalar('select count(*)::int from public.orders where id=$1',[historic]),0)
    await query("select set_config('request.jwt.claim.sub',$1,false)",[authId])
    assert.equal(await scalar('select count(*)::int from public.orders where id=$1',[historic]),1)
    assert.equal(await scalar('select name from public.products where id=$1',[product]),'Test meal')
    assert.equal(await scalar('select name from public.users where id=$1',[waiter]),'Waiter')
    await assert.rejects(query('select password_hash from public.users where id=$1',[waiter]),/permission denied/)
    await assert.rejects(query("update public.users set auth_user_id=$1 where id=$2",[unlinked,admin]),/permission denied/)
    await assert.rejects(query("update public.roles set permissions='{}'"),/permission denied/)
  }finally{await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)")}
})

test('password failures pause new attempts without invalidating existing staff sessions',async()=>{
  const staff=await scalar("insert into public.users(name,username,role_id,password_hash) values('Staff','security_lockout_fixture',3,'fixture-hash') returning id")
  const login=(ok)=>rpc('record_staff_login',[staff,ok,'fixture-hash'],['uuid','boolean','text'])
  assert.equal(await login(true),0)
  for(let i=0;i<5;i++) assert.equal(await login(false),null)
  const [row]=await query('select status,session_version,locked_until from public.users where id=$1',[staff])
  assert.equal(row.status,'active')
  assert.equal(row.session_version,0)
  assert.ok(row.locked_until)
  assert.equal(await login(true),null)
  await query("update public.users set locked_until=now()-interval '1 minute' where id=$1",[staff])
  assert.equal(await login(true),0)
  for(let i=0;i<5;i++) await login(false)
  await query("update public.users set password_hash='new-fixture-hash' where id=$1",[staff])
  assert.equal(await rpc('record_staff_login',[staff,true,'new-fixture-hash'],['uuid','boolean','text']),1)
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
test('confirmation deducts stock once and payment does not deduct again',async()=>{
  const before=await stockCount(ingredient)
  const requestId=await scalar('select gen_random_uuid()')
  const order=await create(waiter,payload({_request_id:requestId}))
  assert.equal(await stockCount(ingredient),before-2)
  assert.equal((await create(waiter,payload({_request_id:requestId}))).id,order.id)
  await assert.rejects(create(waiter,payload({_request_id:requestId,notes:'Different order'})),/already used/)
  await settle(order.id)
  assert.equal(await stockCount(ingredient),before-2)
  await assert.rejects(settle(order.id),/already closed/)
  assert.equal(await scalar('select count(*)::int from public.payments where order_id=$1',[order.id]),1)
  assert.equal(await scalar("select count(*)::int from public.stock_transactions where reference_id=$1 and type='deduction'",[order.id]),1)
  assert.ok(await scalar("select count(*)::int from public.team_alerts where recipient_id=$1 and kind='low_stock'",[admin])>0)
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
test('void restores confirmed stock exactly once, including unpaid tickets, and skips legacy undeducted tickets',async()=>{
  const before=await stockCount(ingredient)
  const unpaid=await create(manager)
  assert.equal(await stockCount(ingredient),before-2)
  await rpc('void_order',[unpaid.id,'Test cancellation',manager],['uuid','text','uuid'])
  assert.equal(await stockCount(ingredient),before)
  const legacy=await legacyOrder()
  await rpc('void_order',[legacy.id,'Legacy cancellation',admin],['uuid','text','uuid'])
  assert.equal(await stockCount(ingredient),before)
  const paid=await create()
  await settle(paid.id)
  await assert.rejects(rpc('void_order',[paid.id,'No permission',waiter],['uuid','text','uuid']),/Permission denied/)
  await rpc('void_order',[paid.id,'Administrator cancellation',admin],['uuid','text','uuid'])
  assert.equal(Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])),before)
  await assert.rejects(rpc('void_order',[paid.id,'Duplicate cancellation',admin],['uuid','text','uuid']),/already closed/)
  await assert.rejects(settle(paid.id),/already closed/)
})

test('manager void permission does not authorize refunding their own paid order',async()=>{
  const order=await create(manager)
  await rpc('settle_order',[manager,order.id,JSON.stringify([{method:'cash',amount:10.5,cash_tendered:10.5}])],['uuid','uuid','jsonb'])
  const before=await stockCount(ingredient)
  await assert.rejects(rpc('void_order',[order.id,'Manager refund attempt',manager],['uuid','text','uuid']),/Permission denied/)
  assert.equal(await scalar('select status from public.orders where id=$1',[order.id]),'paid')
  assert.equal(await scalar('select status from public.payments where order_id=$1',[order.id]),'completed')
  assert.equal(await stockCount(ingredient),before)
  // Historical mismatches must also protect the payment row itself.
  await query("update public.orders set status='active' where id=$1",[order.id])
  await assert.rejects(rpc('void_order',[order.id,'Manager refund attempt',manager],['uuid','text','uuid']),/Permission denied/)
  assert.equal(await scalar('select status from public.payments where order_id=$1',[order.id]),'completed')
  await rpc('void_order',[order.id,'Authorized admin refund',admin],['uuid','text','uuid'])
  assert.equal(await scalar('select status from public.payments where order_id=$1',[order.id]),'refunded')
})
test('QR confirmation is single-use, validates current catalog and races rejection on one parent',async()=>{
  const token=await scalar('select qr_token from public.tables where id=1')
  const before=await stockCount(ingredient)
  const q=await rpc('submit_qr_order',[token,'Guest',JSON.stringify(payload().items)],['uuid','text','jsonb'])
  assert.equal(await stockCount(ingredient),before)
  const o=await rpc('process_qr_order',[waiter,q.id,true],['uuid','uuid','boolean'])
  assert.equal(o.source,'qr')
  assert.equal(await stockCount(ingredient),before-2)
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
  const o=await legacyOrder()
  await db.query(`update public.orders set status='paid' where id=$1`,[o.id])
  await db.query(`insert into public.stock_transactions(ingredient_id,type,quantity,reference_id) values($1,'deduction',2,$2)`,[ingredient,o.id])
  await assert.rejects(rpc('void_order',[o.id,'Historical cancellation',admin],['uuid','text','uuid']),/require reconciliation/)
  assert.equal(await scalar('select status from public.orders where id=$1',[o.id]),'paid')
})
test('older open orders still deduct at payment, with atomic rollback if stock is short',async()=>{
  const o=await legacyOrder()
  const available=await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])
  await db.query('update public.ingredients set quantity_available=0 where id=$1',[ingredient])
  await assert.rejects(settle(o.id),/Insufficient ingredient/)
  assert.equal(await scalar('select status from public.orders where id=$1',[o.id]),'active')
  assert.equal(await scalar('select count(*)::int from public.payments where order_id=$1',[o.id]),0)
  await db.query('update public.ingredients set quantity_available=$1 where id=$2',[available,ingredient])
  await settle(o.id)
  assert.equal(await stockCount(ingredient),Number(available)-2)
})

test('admin recipes share fractional stock, yield estimates update, and order edits honor recorded recipes', async () => {
  const add = (actor,name,unit,count,threshold) => rpc('add_raw_ingredient',[actor,name,unit,count,threshold],['uuid','text','text','numeric','numeric'])
  const saveRecipe = (actor,item,lines,previous = {}) => rpc('save_ingredient_recipe',[actor,item,JSON.stringify(lines),JSON.stringify(previous)],['uuid','uuid','jsonb','jsonb'])
  const workspace = () => rpc('inventory_workspace',[admin],['uuid'])
  await assert.rejects(add(waiter,'Shared chicken','kg',1,0.2),/Permission denied|Administrator access/)
  await db.exec('set role authenticated')
  try { await assert.rejects(workspace(),/permission denied/) }
  finally { await db.exec('reset role') }
  await assert.rejects(add(admin,'Shared chicken','kg',1.0005,0.2),/valid stock/)
  const chicken = await add(admin,'Shared chicken','kg',1,0.2)
  const sauce = await add(admin,'Pizza sauce','L',1,0.1)
  await assert.rejects(add(admin,' shared chicken ','kg',2,0.2),/already exists/)
  const pizza = await scalar("insert into public.products(name,base_price,tax_rate) values('Test Chicken Pizza',10,5) returning id")
  const wrap = await scalar("insert into public.products(name,base_price,tax_rate) values('Test Chicken Wrap',10,5) returning id")
  const pizzaRecipe = { [chicken]: 0.2, [sauce]: 0.1 }
  await saveRecipe(admin,pizza,pizzaRecipe)
  await saveRecipe(admin,wrap,{ [chicken]: 0.1 })
  const opening = await workspace()
  assert.equal(opening.products.find(p=>p.id===pizza).makeable,5)
  assert.equal(opening.products.find(p=>p.id===wrap).makeable,10)
  const count = opening.ingredients.find(i=>i.id===chicken)
  const setCount = (quantity,at) => rpc('update_ingredient_stock',
    [admin,chicken,quantity,0.2,at,'Counted after delivery'],['uuid','uuid','numeric','numeric','timestamptz','text'])
  const items = (a,b) => [{product_id:pizza,quantity:a},{product_id:wrap,quantity:b}]
  const order = await create(waiter,payload({items:items(2,3)}))
  assert.equal(await stockCount(chicken),0.3)
  assert.equal(await stockCount(sauce),0.8)
  assert.equal((await workspace()).products.find(p=>p.id===pizza).makeable,1)
  await assert.rejects(setCount(0.9,count.updated_at),/stock changed/)

  const facts = await rpc('inventory_question_facts',[admin,'How many pizzas can we make?'],['uuid','text'])
  const pizzaFact = facts.find(f=>f.title==='Test Chicken Pizza')
  assert.match(pizzaFact.excerpt,/up to 1 of this dish/)
  const answer = await answerQuestion('How many pizzas can we make?',facts,null,AbortSignal.timeout(5000))
  assert.ok(answer.sources.some(f=>f.id===pizzaFact.id))
  assert.match(answer.answer,/Test Chicken Pizza/)

  await saveRecipe(admin,pizza,{[chicken]:0.5},pizzaRecipe)
  await assert.rejects(saveRecipe(admin,pizza,{[chicken]:0.6},pizzaRecipe),/recipe changed/)
  const edit = (a,b) => rpc('save_order',[waiter,JSON.stringify(payload({items:items(a,b)})),order.id],['uuid','jsonb','uuid'])
  await assert.rejects(edit(4,3),/Insufficient ingredient stock/)
  assert.equal(await stockCount(chicken),0.3)
  assert.equal(await stockCount(sauce),0.8)
  assert.equal(await scalar('select sum(quantity)::int from public.order_items where order_id=$1',[order.id]),5)
  await edit(1,3)
  await edit(1,3)
  assert.equal(await stockCount(chicken),0.5)
  assert.equal(await stockCount(sauce),0.9)
  await settle(order.id,42)
  assert.equal(await stockCount(chicken),0.5)
  await rpc('void_order',[order.id,'Return unused ingredients',admin],['uuid','text','uuid'])
  assert.equal(await stockCount(chicken),1)
  assert.equal(await stockCount(sauce),1)
  const after = await workspace()
  await setCount(1.25,after.ingredients.find(i=>i.id===chicken).updated_at)
  assert.equal(await stockCount(chicken),1.25)
  assert.ok((await workspace()).history.some(h=>h.name==='Shared chicken' && h.quantity===0.25 && h.notes==='Counted after delivery'))
})

test('a shortage leaves no POS order and leaves a QR order pending until stock is updated', async () => {
  const available=await stockCount(ingredient)
  const token=await scalar('select qr_token from public.tables where id=3')
  const pending=await rpc('submit_qr_order',[token,'Guest',JSON.stringify(payload().items)],['uuid','text','jsonb'])
  const countOrders=()=>scalar('select count(*)::int from public.orders')
  const before=await countOrders()
  await query('update public.ingredients set quantity_available=0 where id=$1',[ingredient])
  await assert.rejects(create(),/Insufficient ingredient stock/)
  await assert.rejects(rpc('process_qr_order',[waiter,pending.id,true],['uuid','uuid','boolean']),/Insufficient ingredient stock/)
  assert.equal(await countOrders(),before)
  assert.equal(await scalar('select status from public.qr_pending_orders where id=$1',[pending.id]),'pending')
  await query('update public.ingredients set quantity_available=$1 where id=$2',[available,ingredient])
  await rpc('process_qr_order',[waiter,pending.id,true],['uuid','uuid','boolean'])
  assert.equal(await stockCount(ingredient),available-2)
})

test('editing a legacy draft leaves its stock available until the order is settled', async () => {
  const draft=await legacyOrder()
  const before=await stockCount(ingredient)
  await query("update public.orders set status='draft' where id=$1",[draft.id])
  await rpc('save_order',[waiter,JSON.stringify(payload()),draft.id],['uuid','jsonb','uuid'])
  assert.equal(await stockCount(ingredient),before)
  await settle(draft.id)
  assert.equal(await stockCount(ingredient),before-2)
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
async function agentOrder(stock=3, legacy=false) {
  const p=await scalar("insert into public.products(name,base_price,tax_rate) values('Agent test burger',10,5) returning id")
  const ingredient=await scalar("insert into public.ingredients(name,unit,quantity_available,reorder_threshold) values('Agent test buns','pieces',$1,2) returning id",[stock])
  await query('insert into public.product_ingredients(product_id,ingredient_id,quantity_used) values($1,$2,1)',[p,ingredient])
  const order=legacy ? await legacyOrder(p,2) : await create(waiter,{order_type:'takeaway',items:[{product_id:p,quantity:2,unit_price:10,tax_rate:5}]})
  return {order,ingredient,product:p}
}
async function claimFor(orderId) {
  await rpc('refresh_ingredient_reviews',[])
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
  assert.equal(job.context.ingredients[0].open_demand,0)
  assert.equal(job.context.order.stock_confirmed,true)
  assert.equal(job.context.products[0].makeable,1)
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

const embedding = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0)
const knowledge = (actor, scope, digest, body) => rpc('import_agent_knowledge',
  [actor, 'Test policy', scope, digest.repeat(64), JSON.stringify([{ body, embedding }])], ['uuid','text','text','text','jsonb'])
const searchKnowledge = queries => rpc('search_agent_knowledge', [JSON.stringify(queries)], ['jsonb'])
const enableAi = enabled => rpc('set_agent_rag_enabled', [admin, enabled], ['uuid','boolean'])
const prepareAi = (job, key) => rpc('prepare_agent_ai_review', [job.id, job.lease_token, job.generation, key], ['uuid','uuid','integer','boolean'])
const completeAi = (job, revision, review) => rpc('complete_agent_ai_job',
  [job.id, job.lease_token, job.generation, job.context_hash, JSON.stringify(evaluateOrder(job)), revision, JSON.stringify(review)],
  ['uuid','uuid','integer','text','jsonb','integer','jsonb'])

test('private pgvector search respects role scope and excludes archived content', async () => {
  assert.equal(await scalar('select enabled from public.agent_rag_control'), false)
  await assert.rejects(enableAi(true), /Add a knowledge document/)
  await assert.rejects(knowledge(waiter, 'inventory', 'a', 'Check the physical stock count.'), /Admin required|Permission denied/)
  const document = await knowledge(admin, 'inventory', 'a', 'Check the physical stock count when buns run low.')
  await assert.rejects(knowledge(admin, 'inventory', 'a', 'Check the physical stock count when buns run low.'), /duplicate key/)
  const hits = await searchKnowledge([
    { role: 'inventory', terms: 'stock', embedding },
    { role: 'tables', terms: 'stock', embedding },
  ])
  assert.equal(hits.length, 1)
  assert.equal(hits[0].document_id, document)
  assert.equal(hits[0].role, 'inventory')
  await db.exec('set role authenticated')
  try {
    await assert.rejects(query('select body from public.agent_knowledge_chunks'), /permission denied/)
    await assert.rejects(searchKnowledge([{ role: 'inventory', terms: 'stock', embedding }]), /permission denied/)
  } finally { await db.exec('reset role') }
  assert.equal(await rpc('archive_agent_knowledge', [admin, document], ['uuid','uuid']), true)
  assert.deepEqual(await searchKnowledge([{ role: 'inventory', terms: 'stock', embedding }]), [])
})

test('one leased AI review retrieves cited policies and persists all seven validated handoffs', async () => {
  await knowledge(admin, 'all', 'b', 'Verify the physical stock count before promising an alternative dish.')
  await enableAi(true)
  const { order, ingredient } = await agentOrder()
  await query("update public.orders set customer_name='Private Customer',notes='Do not transmit this note' where id=$1", [order.id])
  const job = await claimFor(order.id)
  assert.equal((await prepareAi(job, false)).status, 'key_missing')
  assert.equal(await scalar('select used from public.agent_rag_control'), 0)
  const prepared = await prepareAi(job, true)
  assert.equal(prepared.status, 'ready')
  const facts = operationsFactsSchema.parse(prepared.facts)
  const handoffLengths = []
  const model = createOpenRouter('fixture-only-key', async (url, init) => {
    const request = JSON.parse(init.body)
    assert.equal(request.provider.data_collection, 'deny')
    assert.equal(request.provider.zdr, true)
    assert.doesNotMatch(init.body, /Private Customer|Do not transmit this note|fixture-only-key/)
    if (url.endsWith('/embeddings')) {
      assert.equal(request.dimensions, 768)
      return Response.json({ data: request.input.map((_, index) => ({ index, embedding })) })
    }
    const { tasks, handoff } = JSON.parse(request.messages[1].content)
    handoffLengths.push(handoff.length)
    assert.equal(request.response_format.type, 'json_schema')
    assert.equal('tools' in request, false)
    const results = tasks.map(task => ({ role: task.role, status: 'attention', observation: 'Check the captured facts.',
      suggestion: 'Have the duty lead verify the source.', sourceIds: task.sources.map(source => source.id) }))
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ results }) } }] })
  })
  const signal = AbortSignal.timeout(5000)
  const hits = await retrieveRoleKnowledge(job, model, searchKnowledge, signal)
  assert.equal(hits.length, 7)
  const ai = await runAiReview(job, facts, hits, model, signal)
  assert.deepEqual(handoffLengths, [0, 3, 6])
  assert.equal(new Set(ai.agents.map(agent => agent.role)).size, 7)
  assert.ok(ai.sources.some(source => source.kind === 'document' && source.chunk === 1))
  assert.equal(await completeAi(job, prepared.revision, ai), true)
  assert.equal(await completeAi(job, prepared.revision, ai), false)
  assert.equal((await scalar('select ai_review from public.agent_runs where job_id=$1',[job.id])).agents.length, 7)
  assert.equal(await scalar('select status from public.orders where id=$1',[order.id]), 'active')
  assert.equal(Number(await scalar('select quantity_available from public.ingredients where id=$1',[ingredient])), 1)

  const bogusModel = { ...model, complete: async request => ({ results: request.data.tasks.map(task => ({
    role: task.role, status: 'attention', observation: 'Unverified claim', suggestion: 'Invalid citation', sourceIds: ['invented'],
  })) }) }
  await assert.rejects(runAiReview(job, facts, hits, bogusModel, signal), /UNGROUNDED_AGENT_RESULT/)
})

test('AI budget and knowledge revision changes preserve rules without publishing obsolete AI results', async () => {
  const { order } = await agentOrder()
  const job = await claimFor(order.id)
  await query('update public.agent_rag_control set used=30')
  assert.equal((await prepareAi(job, true)).status, 'budget_reached')
  await query('update public.agent_rag_control set used=0')
  const prepared = await prepareAi(job, true)
  assert.equal(prepared.status, 'ready')
  await enableAi(false)
  const prior = await scalar("select ai_review from public.agent_runs where ai_review->>'status'='completed' limit 1")
  assert.equal(await completeAi(job, prepared.revision, prior), true)
  assert.deepEqual(await scalar('select ai_review from public.agent_runs where job_id=$1',[job.id]),
    { status: 'fallback', reason: 'knowledge_changed' })
})

test('a private staff alert is stored once and only its recipient can mark it read', async () => {
  const id = await scalar('select gen_random_uuid()')
  const send = (actor, recipient = waiter, message = 'Confirm the stock count.') => rpc('send_team_alert',
    [actor, id, recipient, 'Check stock', message, null], ['uuid','uuid','uuid','text','text','uuid'])
  await assert.rejects(send(waiter), /Administrator access required|Permission denied/)
  await assert.rejects(send(admin, admin), /active team member/)
  assert.equal(await send(admin), id)
  assert.equal(await send(admin), id)
  await assert.rejects(send(admin, waiter, 'A different message'), /already used/)
  assert.equal(await scalar('select count(*)::int from public.activity_logs where action=\'TEAM_ALERT_SENT\' and entity_id=$1', [id]), 1)
  const read = actor => rpc('read_team_alert', [actor, id], ['uuid','uuid'])
  const otherStaff = await scalar("insert into public.users(name,username,role_id,password_hash) values('Other staff','alert_test_staff',3,'test-hash') returning id")
  await assert.rejects(read(otherStaff), /Alert not found/)
  await assert.rejects(read(admin), /Alert not found/)
  const readAt = await read(waiter)
  assert.ok(readAt)
  assert.deepEqual(await read(waiter), readAt)
  assert.equal(await scalar('select recipient_id from public.team_alerts where id=$1',[id]), waiter)
  await db.exec('set role authenticated')
  try {
    await assert.rejects(query('select message from public.team_alerts'), /permission denied/)
    await assert.rejects(read(waiter), /permission denied/)
  } finally { await db.exec('reset role') }
})

test('urgent findings and exhausted checks create saved admin alerts', async () => {
  const { order } = await agentOrder(1,true)
  const job = await claimFor(order.id)
  assert.equal(await finish(job), true)
  const urgent = await scalar("select id from public.agent_recommendations where order_id=$1 and severity='high' limit 1", [order.id])
  assert.ok(urgent)
  assert.equal(await scalar("select count(*)::int from public.team_alerts where recipient_id=$1 and issue_id=$2 and kind='issue'", [admin, urgent]), 1)
  assert.equal(await scalar('select count(*)::int from public.team_alerts where recipient_id=$1 and issue_id=$2', [waiter, urgent]), 0)
  await query("update public.agent_jobs set status='dead' where id=$1", [job.id])
  await query("update public.agent_jobs set status='dead' where id=$1", [job.id])
  assert.equal(await scalar("select count(*)::int from public.team_alerts where recipient_id=$1 and system_ref=$2 and kind='check_failed'", [admin, `check:${job.id}:${job.generation}`]), 1)
})

test('question lookup finds live facts and saved policies, rejects forged citations and stores cited history', async () => {
  const policy = await knowledge(admin, 'all', 'c', 'If the espresso grinder jams, switch it off and ask the duty lead to check it.')
  const facts = (actor, question) => rpc('help_desk_question_facts', [actor, question], ['uuid','text'])
  await assert.rejects(facts(waiter, 'What if the grinder jams?'), /Administrator access required|Permission denied/)
  const question = 'What if the espresso grinder jams?'
  const sources = (await facts(admin, question)).map(source => questionSource.parse(source))
  const cited = sources.find(source => source.documentId === policy)
  assert.ok(cited)
  assert.ok((await facts(admin, 'How many orders are open?')).some(source => source.id === 'F-open-orders'))
  const signal = AbortSignal.timeout(5000)
  assert.equal((await answerQuestion(question, sources, null, signal)).status, 'answered')
  assert.equal((await answerQuestion('unmatched', [], null, signal)).status, 'no_evidence')
  await assert.rejects(answerQuestion(question, sources, { complete: async () => ({ status:'answered', answer:'Unsupported', sourceIds:['invented'] }) }, signal), /UNGROUNDED_ANSWER/)
  const result = await answerQuestion(question, sources, { complete: async () => ({ status:'answered', answer:'Switch it off and ask the duty lead to check it.', sourceIds:[cited.id] }) }, signal)
  const id = await scalar('insert into public.agent_questions(asked_by,question,status,answer,sources,model,finished_at) values($1,$2,$3,$4,$5::jsonb,$6,now()) returning id',
    [admin, question, result.status, result.answer, JSON.stringify(result.sources), result.model])
  const [stored] = await query('select question,answer,sources from public.agent_questions where id=$1 and asked_by=$2', [id, admin])
  assert.equal(stored.question, question)
  assert.equal(stored.answer, result.answer)
  assert.deepEqual(stored.sources, result.sources)
  await db.exec('set role authenticated')
  try { await assert.rejects(query('select question from public.agent_questions'), /permission denied/) }
  finally { await db.exec('reset role') }
  await rpc('archive_agent_knowledge', [admin, policy], ['uuid','uuid'])
  assert.ok(!(await facts(admin, question)).some(source => source.documentId === policy))
})
