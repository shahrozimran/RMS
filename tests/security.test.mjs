import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import ts from 'typescript'
import jwt from 'jsonwebtoken'
import nextServer from 'next/server.js'
const { NextRequest } = nextServer

function load(file,mocks={}) {
  const absolute=path.resolve(file)
  const source=fs.readFileSync(absolute,'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const m=new Module(absolute)
  m.paths=Module._nodeModulePaths(path.dirname(absolute))
  const native=Module.createRequire(absolute)
  m.require=(name)=> {
    if(Object.hasOwn(mocks,name)) return mocks[name]
    if(name.startsWith('@/')) return load(name.slice(2)+'.ts',mocks)
    if(name.startsWith('.') && fs.existsSync(path.resolve(path.dirname(absolute),name)+'.ts')) return load(path.resolve(path.dirname(absolute),name)+'.ts',mocks)
    return native(name)
  }
  m._compile(code,absolute)
  return m.exports
}
const key='a-test-only-signing-key-with-more-than-32-bytes'
process.env.JWT_SECRET=key

test('agent APIs require a Supabase-backed administrator before privileged reads or writes',async()=>{
  const rbac=load('lib/auth/rbac.ts')
  for(const identity of [null,{id:'x',role:'Waiter',authType:'staff'},{id:'x',role:'Admin',authType:'staff'}]){
    let privilegedCalls=0
    const mocks={
      '@/lib/auth/rbac':rbac,
      '@/lib/auth/session':{getSession:async()=>identity},
      '@/lib/supabase/server':{createAdminClient:async()=>{privilegedCalls++;throw Error('Unexpected database access')}},
    }
    const route=load('app/api/agents/route.ts',mocks)
    const expected=identity?403:401
    assert.equal((await route.GET()).status,expected)
    assert.equal((await route.POST(new Request('https://rms.test/api/agents',{method:'POST',body:'{"action":"queue"}'}))).status,expected)
    const review=load('app/api/agents/recommendations/[id]/route.ts',mocks)
    assert.equal((await review.POST(new Request('https://rms.test/api/agents/recommendations/x',{method:'POST',body:'{}'}),{params:Promise.resolve({id:'x'})})).status,expected)
    assert.equal(privilegedCalls,0)
  }
})

test('agent command API rejects unsupported execution and additional privilege fields',async()=>{
  let privilegedCalls=0
  const route=load('app/api/agents/route.ts',{
    '@/lib/auth/session':{getSession:async()=>({id:'test-admin',role:'Admin',authType:'admin'})},
    '@/lib/supabase/server':{createAdminClient:async()=>{privilegedCalls++;throw Error('Unexpected database access')}},
  })
  for(const body of [{action:'execute',sql:'delete from orders'},{action:'configure',enabled:true,p_actor:'forged'},{action:'queue',order_id:'not-a-uuid'}]){
    const response=await route.POST(new Request('https://rms.test/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))
    assert.equal(response.status,400)
  }
  assert.equal(privilegedCalls,0)
})

test('development loopback origin normalization accepts local agent commands without trusting unrelated origins',async()=>{
  const originalMode=process.env.NODE_ENV,originalOrigin=process.env.APP_ORIGIN
  try{
    process.env.NODE_ENV='development';delete process.env.APP_ORIGIN
    const {proxy}=load('proxy.ts',{'@/lib/supabase/middleware':{updateSession:async()=>{throw Error('Unexpected browser authentication')}}})
    const local=await proxy(new NextRequest('http://localhost:3000/api/agents',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}}))
    assert.equal(local.status,200)
    const foreign=await proxy(new NextRequest('http://localhost:3000/api/agents',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'https://attacker.test'}}))
    assert.equal(foreign.status,403)
    process.env.APP_ORIGIN='https://rms.test'
    assert.equal((await proxy(new NextRequest('http://localhost:3000/api/agents',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}}))).status,403)
  }finally{
    if(originalMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalMode
    if(originalOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=originalOrigin
  }
})
const auth=load('lib/auth/staff-auth.ts',{'@/lib/supabase/server':{}})
const claims={userId:'00000000-0000-4000-8000-000000000001',sessionVersion:3,role:'Admin',permissions:{staff:{write:true}}}
const sign=(overrides={},options={})=>jwt.sign({...claims,...overrides},key,{algorithm:'HS256',issuer:'rms',audience:'rms-staff',expiresIn:'1h',...options})
const current={id:claims.userId,name:'Current name',username:'waiter',status:'active',session_version:3,auth_user_id:null,role:{name:'Waiter',permissions:{menu:{read:true},staff:{write:false}}}}
function session(user,token=sign(),identity=null) {
  return load('lib/auth/session.ts',{
    react:{cache:fn=>fn},'next/headers':{cookies:async()=>({get:()=>token?{value:token}:undefined})},
    '@/lib/auth/staff-auth':auth,
    '@/lib/supabase/server':{
      createAdminClient:async()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:user,error:null})})})})}),
      createServerSupabaseClient:async()=>({auth:{getUser:async()=>({data:{user:identity},error:null})}}),
    },
  }).getSession()
}
test('JWT requires expected signature algorithm, issuer, audience and version',async()=>{
  assert.equal((await auth.verifyStaffToken(sign())).sessionVersion,3)
  await assert.rejects(auth.verifyStaffToken(sign({}, {algorithm:'HS384'})))
  await assert.rejects(auth.verifyStaffToken(sign({}, {audience:'other'})))
  await assert.rejects(auth.verifyStaffToken(sign({sessionVersion:undefined})))
  await assert.rejects(auth.verifyStaffToken(sign({}, {expiresIn:-1})))
})
test('session derives current permissions rather than embedded token privileges',async()=>{
  const result=await session(current)
  assert.equal(result.name,'Current name')
  assert.equal(result.role,'Waiter')
  assert.equal(result.permissions.staff.write,false)
})
test('suspension, deletion, missing role and reset token generation fail closed',async()=>{
  for(const status of ['suspended','deleted','locked']) assert.equal(await session({...current,status}),null)
  assert.equal(await session({...current,session_version:4}),null)
  assert.equal(await session({...current,role:null}),null)
  assert.equal(await session(null),null)
})
test('Supabase authentication does not grant Admin to inactive or demoted identities',async()=>{
  const identity={id:'provider-id'}
  assert.equal(await session({...current,auth_user_id:'provider-id'},null,identity),null)
  assert.equal(await session({...current,status:'suspended',role:{name:'Admin',permissions:{}}},null,identity),null)
  assert.equal((await session({...current,role:{name:'Admin',permissions:{}}},null,identity)).role,'Admin')
})
test('order validation rejects lifecycle mass assignment and preserves legitimate full edits',()=>{
  const {createOrderSchema,updateStaffSchema,staffLoginSchema}=load('lib/utils/validation.ts')
  const data={order_type:'takeaway',items:[{product_id:claims.userId,quantity:1,unit_price:10,tax_rate:5}]}
  assert.equal(createOrderSchema.safeParse(data).success,true)
  assert.equal(createOrderSchema.safeParse({...data,status:'paid',total:0}).success,false)
  assert.equal(createOrderSchema.safeParse({...data,items:[{...data.items[0],quantity:100000}]}).success,false)
  assert.equal(createOrderSchema.safeParse({...data,order_type:'dine_in'}).success,false)
  assert.equal(updateStaffSchema.safeParse({email:null,phone:null,status:'suspended'}).success,true)
  assert.equal(staffLoginSchema.safeParse({username:'user',password:'é'.repeat(40)}).success,false)
})
test('partial product edits do not reset omitted defaults',()=>{
  const {productUpdateSchema}=load('lib/utils/validation.ts')
  assert.deepEqual(productUpdateSchema.parse({is_86d:true}),{is_86d:true})
})
test('API rejects cross-site mutations and marks protected responses no-store',async()=>{
  let refreshes=0
  const {proxy}=load('proxy.ts',{'@/lib/supabase/middleware':{updateSession:async()=>{refreshes++;throw Error('unexpected auth refresh')}}})
  const rejected=await proxy(new NextRequest('https://rms.test/api/orders',{method:'POST',headers:{origin:'https://attacker.test'}}))
  assert.equal(rejected.status,403)
  const polling=await proxy(new NextRequest('https://rms.test/api/qr/00000000-0000-4000-8000-000000000001/order'))
  assert.match(polling.headers.get('cache-control'),/no-store/)
  assert.equal(refreshes,0)
})
test('internal table and QR queue/history APIs deny anonymous requests before privileged queries',async()=>{
  for(const file of ['app/api/tables/route.ts','app/api/qr/pending/route.ts','app/api/qr/history/route.ts']) {
    const route=load(file,{'@/lib/auth/session':{getSession:async()=>null},'@/lib/supabase/server':{createAdminClient:()=>{throw Error('privileged query before authentication')}}})
    assert.equal((await route.GET(new NextRequest('https://rms.test/api/test'))).status,401)
  }
})
test('streamed bodies are bounded even without Content-Length',async()=>{
  const {readBody}=load('lib/api/body.ts')
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(20));c.close()}})
  await assert.rejects(readBody(new Request('https://rms.test',{method:'POST',body,duplex:'half'}),10),e=>e.status===413)
})
test('cent calculations match per-line PostgreSQL rounding',()=>{
  const {buildTaxSummary,calculateItemTax}=load('lib/utils/tax.ts')
  assert.equal(calculateItemTax({unit_price:10.05,quantity:1,tax_rate:10}),1.01)
  const total=buildTaxSummary([{unit_price:0.1,quantity:1,tax_rate:5},{unit_price:0.1,quantity:1,tax_rate:5}])
  assert.equal(total.total_tax,0.02)
})
test('editing an old order refreshes current catalog prices, tax and modifier snapshots',()=>{
  const {repriceCartLine}=load('lib/utils/cart.ts')
  const line={product_id:'meal',variant_label:null,unit_price:5,tax_rate:0,selected_modifiers:[{id:1,name:'Old',price:1}]}
  const catalog=[{id:'meal',name:'Meal',base_price:10,tax_rate:5,price_variants:[],modifiers:[{id:1,name:'Extra',price:2}]}]
  assert.deepEqual(repriceCartLine(line,catalog),{...line,product_name:'Meal',unit_price:12,tax_rate:5,selected_modifiers:[{id:1,name:'Extra',price:2}]})
  assert.throws(()=>repriceCartLine(line,[]),/no longer available/)
})
test('visible polling includes initial load in the non-overlapping schedule',async()=>{
  const original={document:globalThis.document,window:globalThis.window,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout}
  const events={},timers=[]
  globalThis.document={hidden:false,addEventListener:(name,fn)=>{events[name]=fn},removeEventListener:()=>{}}
  globalThis.window={addEventListener:(name,fn)=>{events[name]=fn},removeEventListener:()=>{}}
  globalThis.setTimeout=fn=>{timers.push(fn);return timers.length}
  globalThis.clearTimeout=()=>{}
  let calls=0,complete
  try {
    const {pollVisible}=load('lib/utils/poll.ts')
    const stop=pollVisible(()=>{calls++;return new Promise(resolve=>{complete=resolve})})
    assert.equal(calls,1)
    events.focus()
    assert.equal(calls,1)
    assert.equal(timers.length,0)
    complete(); await Promise.resolve(); await Promise.resolve()
    assert.equal(timers.length,1)
    globalThis.document.hidden=true
    timers[0]()
    assert.equal(calls,1)
    stop()
  } finally { Object.assign(globalThis,original) }
})
