import { evaluateOrder } from './engine'
import type { AgentOverview } from './contracts'
import type { AiReview } from './rag-contracts'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const captured='2026-11-06T12:00:00Z'
const sampleAi: AiReview = {
  status: 'completed', model: 'Sample', observedAt: captured,
  sources: [
    { id: 'stock', kind: 'live', title: 'Mapped bun demand', excerpt: '6 buns on hand. This order needs 8 and open orders need 12.' },
    { id: 'order', kind: 'live', title: 'Active order', excerpt: 'Eight house burgers, active for 20 minutes.' },
    { id: 'floor', kind: 'live', title: 'Table and shift snapshot', excerpt: 'Table 03 occupied. Two staff on shift, four open orders.' },
    { id: 'sales', kind: 'live', title: 'Paid order history', excerpt: 'House burger is the most ordered item in this sample period.' },
    { id: 'policy', kind: 'document', title: 'Stock shortage handoff', chunk: 1, excerpt: 'Confirm the physical stock count and have the duty manager review any proposed substitute before speaking to the guest.' },
  ],
  agents: [
    { role: 'order', status: 'attention', observation: 'The burger order is still active after 20 minutes.', suggestion: 'Check the ticket and confirm progress with the kitchen.', sourceIds: ['order'] },
    { role: 'inventory', status: 'attention', observation: 'Mapped demand is 12 buns and the count shows six.', suggestion: 'Confirm the physical count and follow the shortage handoff.', sourceIds: ['stock', 'policy'] },
    { role: 'sales', status: 'clear', observation: 'The house burger leads the sample paid-item history.', suggestion: 'Review recurring bun shortages alongside recorded demand.', sourceIds: ['sales', 'stock'] },
    { role: 'kitchen', status: 'attention', observation: 'The active ticket may be affected by the bun shortage.', suggestion: 'Confirm the count before committing to a preparation sequence.', sourceIds: ['order', 'stock'] },
    { role: 'staff', status: 'clear', observation: 'Two staff are on shift across four open orders.', suggestion: 'Ask the duty lead to coordinate the guest update.', sourceIds: ['floor'] },
    { role: 'tables', status: 'insufficient_data', observation: 'Table 03 is occupied. The snapshot has no seating timestamp.', suggestion: 'Confirm the table status with front of house.', sourceIds: ['floor'] },
    { role: 'supervisor', status: 'attention', observation: 'The bun shortage is the first issue to verify for this active order.', suggestion: 'Count the buns and confirm the ticket with the kitchen. Have the duty lead check any substitute against the policy.', sourceIds: ['stock', 'policy', 'order'] },
  ],
}
const output=evaluateOrder({id:id(1),generation:1,lease_token:id(2),context_hash:'a'.repeat(32),captured_at:captured,
  context:{order:{id:id(3),status:'active',source:'qr',created_at:'2026-11-06T11:40:00Z',updated_at:'2026-11-06T11:40:00Z'},
    products:[{id:id(4),name:'House burger',quantity:8,available:true,has_variants:false,has_modifiers:false,has_recipe:true}],
    ingredients:[{id:id(5),name:'Burger buns',unit:'pieces',on_hand:6,threshold:4,required:8,open_demand:12}]}})
export const agentDemo:AgentOverview={enabled:true,setupRequired:false,
  jobs:[{id:id(1),order_id:id(3),status:'completed',attempts:1,last_error:null,updated_at:captured}],
  runs:[{id:id(6),order_id:id(3),summary:output.summary,messages:output.messages,policy_version:output.policy_version,created_at:captured,ai_review:sampleAi}],
  recommendations:output.findings.map((f,index)=>({...f,id:id(10+index),order_id:id(3),run_id:id(6),context_hash:'a'.repeat(32),status:'open',expires_at:'2026-11-06T12:15:00Z',created_at:captured,review_note:null}))}
