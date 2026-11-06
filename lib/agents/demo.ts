import { evaluateOrder } from './engine'
import type { AgentOverview } from './contracts'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const captured='2026-11-06T12:00:00Z'
const output=evaluateOrder({id:id(1),generation:1,lease_token:id(2),context_hash:'a'.repeat(32),captured_at:captured,
  context:{order:{id:id(3),status:'active',source:'qr',created_at:'2026-11-06T11:40:00Z',updated_at:'2026-11-06T11:40:00Z'},
    products:[{id:id(4),name:'House burger',quantity:8,available:true,has_variants:false,has_modifiers:false,has_recipe:true}],
    ingredients:[{id:id(5),name:'Burger buns',unit:'pieces',on_hand:6,threshold:4,required:8,open_demand:12}]}})
export const agentDemo:AgentOverview={enabled:true,setupRequired:false,
  jobs:[{id:id(1),order_id:id(3),status:'completed',attempts:1,last_error:null,updated_at:captured}],
  runs:[{id:id(6),order_id:id(3),summary:output.summary,messages:output.messages,policy_version:output.policy_version,created_at:captured}],
  recommendations:output.findings.map((f,index)=>({...f,id:id(10+index),order_id:id(3),run_id:id(6),context_hash:'a'.repeat(32),status:'open',expires_at:'2026-11-06T12:15:00Z',created_at:captured,review_note:null}))}
