import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateOrder } from '../lib/agents/engine.ts'
import { jobSchema } from '../lib/agents/contracts.ts'

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function job(changes={}) {
  return {id:id(1),generation:1,lease_token:id(2),context_hash:'a'.repeat(32),captured_at:'2026-11-06T12:00:00Z',
    context:{order:{id:id(3),status:'active',created_at:'2026-11-06T11:55:00Z',updated_at:'2026-11-06T11:55:00Z',source:'qr'},
      products:[{id:id(4),name:'Burger',quantity:2,available:true,has_variants:false,has_modifiers:false,has_recipe:true}],
      ingredients:[{id:id(5),name:'Buns',unit:'pieces',on_hand:20,threshold:4,required:2,open_demand:5}],...changes}}
}
test('agent findings use outstanding mapped demand and retain timestamped evidence',()=>{
  const input=job()
  input.context.ingredients[0].on_hand=3
  const result=evaluateOrder(input)
  assert.equal(result.findings[0].kind,'stock_pressure')
  assert.equal(result.findings[0].severity,'high')
  assert.match(result.findings[0].evidence[0].value,/Older orders still need 5 pieces/)
  assert.equal(result.findings[0].evidence[0].observed_at,input.captured_at)
  assert.deepEqual(result.messages.map(m=>m.sender),['order','inventory','supervisor'])
  assert.match(result.summary,/No business records were changed/)
})
test('variant, modifier and absent recipe coverage are uncertain rather than a stock guarantee',()=>{
  for(const change of [{has_recipe:false},{has_variants:true},{has_modifiers:true}]){
    const input=job();Object.assign(input.context.products[0],change)
    const result=evaluateOrder(input)
    assert.ok(result.findings.some(f=>f.kind==='recipe_review'))
    assert.equal(result.messages[1].status,'insufficient_data')
  }
})
test('closed orders produce no operational findings, even if stock is low',()=>{
  for(const status of ['paid','void','refunded']){
    const input=job();input.context.order.status=status;input.context.ingredients[0].on_hand=0
    assert.equal(evaluateOrder(input).findings.length,0)
  }
})
test('order rules distinguish availability issues and age from preparation estimates',()=>{
  const input=job();input.context.order.created_at='2026-11-06T11:30:00Z'
  input.context.products[0].available=false
  const finding=evaluateOrder(input).findings.find(f=>f.kind==='order_review')
  assert.equal(finding.severity,'high')
  assert.match(finding.evidence.at(-1).value,/not a preparation-time estimate/)
})
test('valid context without issues does not imply approval',()=>{
  const result=evaluateOrder(job())
  assert.equal(result.findings.length,0)
  assert.match(result.summary,/not an order approval/)
})
test('an empty open order is flagged rather than interpreted as sufficient coverage',()=>{
  const input=job({products:[],ingredients:[]})
  const result=evaluateOrder(input)
  assert.equal(result.findings[0].kind,'order_review')
  assert.equal(result.findings[0].severity,'high')
  assert.match(result.findings[0].summary,/No readable product lines/)
})
test('invalid/unbounded context and unexpected fields fail before reasoning',()=>{
  for(const mutation of [input=>input.context.ingredients[0].on_hand=Infinity,input=>input.context.order.status='approved',input=>input.context.products[0].quantity=-1,input=>input.context.execute_sql='delete from orders']){
    const input=job();mutation(input)
    assert.equal(jobSchema.safeParse(input).success,false)
    assert.throws(()=>evaluateOrder(input))
  }
})
