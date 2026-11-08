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
    if(name.startsWith('@/')) return name.endsWith('.mjs') ? native(path.resolve(name.slice(2))) : load(name.slice(2)+'.ts',mocks)
    if(name.startsWith('.') && fs.existsSync(path.resolve(path.dirname(absolute),name)+'.ts')) return load(path.resolve(path.dirname(absolute),name)+'.ts',mocks)
    return native(name)
  }
  m._compile(code,absolute)
  return m.exports
}
const key='a-test-only-signing-key-with-more-than-32-bytes'
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co'

test('server-rendered POS catalog keeps fresh permission checks before service-role reads',async()=>{
  let reads=0
  const catalog={products:[],categories:[],tables:[],settings:{}}
  const identities=[null,{role:'Waiter',permissions:{}},{role:'Admin',permissions:{}}]
  for(const identity of identities){
    const {getPosCatalog}=load('lib/pos/catalog.ts',{
      react:{cache:fn=>fn},
      '@/lib/auth/session':{getSession:async()=>identity},
      '@/lib/supabase/server':{createAdminClient:async()=>({rpc:async name=>{
        assert.equal(name,'get_pos_catalog');reads++;return {data:catalog,error:null}
      }})},
    })
    if(!identity||identity.role!=='Admin') await assert.rejects(getPosCatalog(),error=>error.status===(identity?403:401))
    else assert.deepEqual(await getPosCatalog(),catalog)
  }
  assert.equal(reads,1)
})

test('QR badge returns a protected count without fetching customer/order payloads',async()=>{
  let queries=0
  const rbac=load('lib/auth/rbac.ts')
  for(const identity of [null,{role:'Waiter',permissions:{}},{role:'Waiter',permissions:{orders:{write:true}}}]){
    const route=load('app/api/qr/pending/route.ts',{
      '@/lib/auth/rbac':rbac,
      '@/lib/auth/session':{getSession:async()=>identity},
      '@/lib/supabase/server':{createAdminClient:async()=>({from:table=>{
        assert.equal(table,'qr_pending_orders');queries++
        return {select:(fields,options)=>{
          assert.equal(fields,'id');assert.deepEqual(options,{count:'exact',head:true})
          return {eq:async(column,value)=>{
            assert.equal(column,'status');assert.equal(value,'pending')
            return {count:278,data:null,error:null}
          }}
        }}
      }})},
    })
    const response=await route.GET(new NextRequest('https://rms.test/api/qr/pending?count=true'))
    assert.equal(response.status,!identity?401:identity.permissions.orders?200:403)
    if(response.ok) assert.deepEqual(await response.json(),{count:278})
  }
  assert.equal(queries,1)
})

test('proxy verifies claims and propagates refreshed cookies to both server and browser',async()=>{
  let verified=0
  const {updateSession}=load('lib/supabase/middleware.ts',{
    '@supabase/ssr':{createServerClient:(_url,_key,{cookies})=>({auth:{getClaims:async()=>{
      verified++
      cookies.setAll([{name:'sb-test-auth-token',value:'refreshed',options:{httpOnly:true,path:'/'}}])
      return {data:{claims:{sub:'identity'}},error:null}
    }}})},
  })
  const request=new NextRequest('https://rms.test/admin/pos')
  const response=await updateSession(request)
  assert.equal(verified,1)
  assert.equal(request.cookies.get('sb-test-auth-token').value,'refreshed')
  assert.equal(response.cookies.get('sb-test-auth-token').value,'refreshed')
  assert.equal(response.cookies.get('sb-test-auth-token').httpOnly,true)
})

test('public login and isolated design preview never call the authentication provider',async()=>{
  const {proxy}=load('proxy.ts',{'@/lib/supabase/middleware':{updateSession:async()=>{throw Error('Unexpected auth request')}}})
  for(const route of ['/login','/preview?view=pos']){
    assert.equal((await proxy(new NextRequest('https://rms.test'+route))).status,200)
  }
})

test('production pages use a fresh script nonce and Supabase accepts only a secure project origin',async()=>{
  const prior=process.env.NODE_ENV
  process.env.NODE_ENV='production'
  try{
    const {proxy}=load('proxy.ts')
    const request=()=>new NextRequest('https://rms.test/login',{headers:{'Content-Security-Policy':"script-src 'nonce-forged'"}})
    const first=await proxy(request()), second=await proxy(request())
    const policy=first.headers.get('Content-Security-Policy')
    assert.equal(first.headers.get('x-middleware-request-content-security-policy'),policy)
    assert.match(policy,/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic';/)
    assert.doesNotMatch(policy,/nonce-forged|unsafe-eval/)
    assert.notEqual(policy,second.headers.get('Content-Security-Policy'))
    assert.match(policy,/connect-src 'self' https:\/\/fixture\.supabase\.co wss:\/\/fixture\.supabase\.co/)
    const {supabaseUrl}=await import('../lib/supabase/connection.mjs')
    for(const url of ['http://fixture.supabase.co','http://localhost:54321','https://user:password@fixture.supabase.co','https://fixture.supabase.co/path']) {
      assert.throws(()=>supabaseUrl(url),/HTTPS project origin/)
    }
    assert.equal(supabaseUrl('https://fixture.supabase.co/'),'https://fixture.supabase.co')
    const {staffCookieName,authCookieOptions}=load('lib/auth/cookies.ts')
    assert.equal(staffCookieName,'__Host-rms_staff_token')
    assert.deepEqual(authCookieOptions,{secure:true,sameSite:'lax',path:'/'})
  }finally{if(prior===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prior}
})

test('untrusted production callers cannot reach login or QR queries, while development quotas are scoped',async()=>{
  const original={vercel:process.env.VERCEL,proxy:process.env.TRUST_PROXY_HEADERS,mode:process.env.NODE_ENV}
  delete process.env.VERCEL
  delete process.env.TRUST_PROXY_HEADERS
  process.env.NODE_ENV='development'
  const buckets=[]
  const token='00000000-0000-4000-8000-000000000001'
  const errors=load('lib/api/errors.ts')
  const mocks={
    '@/lib/api/errors':errors,
    './errors':errors,
    '@/lib/auth/staff-auth':{authenticateStaff:async()=>{throw Error('Invalid credentials')}},
    '@/lib/supabase/server':{createAdminClient:async()=>({rpc:async(name,args)=>{
      if(name==='get_qr_menu') return args.p_token===token ? {data:{products:[]}} : {error:{code:'P0002'}}
      assert.equal(name,'consume_rate_limit')
      buckets.push(args.p_key)
      return {data:true}
    }})},
  }
  try{
    const login=load('app/api/auth/login/route.ts',mocks)
    const request=(username)=>new NextRequest('https://rms.test/api/auth/login',{
      method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':'192.0.2.99'},
      body:JSON.stringify({username,password:'test'}),
    })
    for(const user of ['alice','bob','ALICE']) assert.equal((await login.POST(request(user))).status,401)
    assert.notEqual(buckets[0],buckets[1])
    assert.equal(buckets[0],buckets[2])
    const qr=load('app/api/qr/[tableToken]/route.ts',mocks)
    const menu=(tableToken)=>qr.GET(new NextRequest('https://rms.test/api/qr/'+tableToken),{params:Promise.resolve({tableToken})})
    assert.equal((await menu('00000000-0000-4000-8000-000000000002')).status,404)
    assert.equal(buckets.length,3)
    assert.equal((await menu(token)).status,200)
    assert.match(buckets.at(-1),/^qr-menu:table:/)
    process.env.NODE_ENV='production'
    const untouched=buckets.length
    assert.equal((await login.POST(request('alice'))).status,503)
    assert.equal((await menu(token)).status,503)
    assert.equal(buckets.length,untouched)
    process.env.VERCEL='1'
    const {trustedClientIp}=load('lib/api/rate-limit.ts',mocks)
    assert.equal(trustedClientIp(new Request('https://rms.test',{headers:{'x-vercel-forwarded-for':'192.0.2.11','x-forwarded-for':'192.0.2.99'}})),'192.0.2.11')
    assert.equal(trustedClientIp(new Request('https://rms.test',{headers:{'x-vercel-forwarded-for':'192.0.2.11, 192.0.2.99'}})),null)
  }finally{
    if(original.vercel===undefined) delete process.env.VERCEL
    else process.env.VERCEL=original.vercel
    if(original.proxy===undefined) delete process.env.TRUST_PROXY_HEADERS
    else process.env.TRUST_PROXY_HEADERS=original.proxy
    if(original.mode===undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV=original.mode
  }
})

test('reused currency formatters preserve currency, locale and invalid-setting fallbacks',()=>{
  const {formatCurrency,SUPPORTED_CURRENCIES}=load('lib/utils/currency.ts')
  for(let run=0;run<2;run++)for(const currency of SUPPORTED_CURRENCIES){
    for(const amount of [0,12.355,-45.6,'1234.5',null]){
      const expected=new Intl.NumberFormat(currency.locale,{style:'currency',currency:currency.code,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(amount))
      assert.equal(formatCurrency(amount,currency),expected)
    }
  }
  assert.equal(formatCurrency('invalid',{locale:'bad_locale',code:'BAD!',symbol:'X'}),'X0.00')
  assert.equal(formatCurrency(12.5,{locale:'bad_locale',code:'BAD!',symbol:'X'}),'X12.50')
})

test('food image optimization only accepts configured local and public Supabase images',()=>{
  const {canOptimizeFoodImage}=load('lib/utils/images.ts')
  assert.equal(canOptimizeFoodImage('/images/food.jpg'),true)
  assert.equal(canOptimizeFoodImage('https://project.supabase.co/storage/v1/object/public/menu/food.jpg'),true)
  for(const url of ['//other.test/food.jpg','https://other.test/food.jpg','https://project.supabase.co.evil.test/storage/v1/object/public/menu/food.jpg','http://project.supabase.co/storage/v1/object/public/menu/food.jpg','https://project.supabase.co/storage/v1/object/sign/menu/food.jpg','https://name:password@project.supabase.co/storage/v1/object/public/menu/food.jpg','data:image/png;base64,AAA']){
    assert.equal(canOptimizeFoodImage(url),false,url)
  }
})

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
    const knowledge=load('app/api/agents/knowledge/route.ts',mocks)
    assert.equal((await knowledge.GET()).status,expected)
    assert.equal((await knowledge.POST(new Request('https://rms.test/api/agents/knowledge',{method:'POST',body:'{"action":"import"}'}))).status,expected)
    const questions=load('app/api/agents/questions/route.ts',mocks)
    assert.equal((await questions.GET()).status,expected)
    assert.equal((await questions.POST(new Request('https://rms.test/api/agents/questions',{method:'POST',body:'{}'}))).status,expected)
    const alerts=load('app/api/alerts/route.ts',mocks)
    assert.equal((await alerts.POST(new Request('https://rms.test/api/alerts',{method:'POST',body:'{}'}))).status,expected)
    assert.equal(privilegedCalls,0)
  }
})

test('staff alert reads ignore requested recipients and use the authenticated staff ID',async()=>{
  const staffId='00000000-0000-4000-8000-000000000089'
  let scoped=false
  const {GET}=load('app/api/alerts/route.ts',{
    '@/lib/auth/session':{getSession:async()=>({id:staffId,role:'Waiter',authType:'staff'})},
    '@/lib/supabase/server':{createAdminClient:async()=>({from:table=>{
      assert.equal(table,'team_alerts')
      return {select:()=>({eq:(column,value)=>{
        assert.equal(column,'recipient_id');assert.equal(value,staffId);scoped=true
        return {order:()=>({limit:async()=>({data:[{id:'received'}],error:null})})}
      }})}
    }})},
  })
  const response=await GET(new NextRequest('https://rms.test/api/alerts?recipient=someone-else'))
  assert.equal(response.status,200)
  assert.deepEqual((await response.json()).data,{installed:true,inbox:[{id:'received'}],sent:[],team:[],issue:null})
  assert.equal(scoped,true)
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
