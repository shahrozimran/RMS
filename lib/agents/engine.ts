import { jobSchema, outputSchema } from './contracts.ts'
import type { AgentOutput, Evidence, Finding } from './contracts.ts'

// Pure, deterministic engine. It has no database, network or mutation capability.
// Missing recipe mappings produce uncertainty rather than an availability claim.
export function evaluateOrder(input: unknown): AgentOutput {
  const job = jobSchema.parse(input)
  const context = job.context
  const observed = job.captured_at
  const evidence = (source: Evidence['source'], entity_id: string, label: string, value: string): Evidence =>
    ({ source, entity_id, label, value, observed_at: observed })
  const findings: Finding[] = []
  const inventoryEvidence: Evidence[] = []
  const orderEvidence: Evidence[] = []
  const unmapped = context.products.filter(p => !p.has_recipe || p.has_variants || p.has_modifiers)
  const closed = !['active','billed'].includes(context.order.status)
  if (!closed) {
    const risks = context.ingredients.filter(i => Math.round((i.on_hand-i.open_demand)*1000)/1000 <= i.threshold)
    if (risks.length) {
      const shortage = risks.some(i => i.on_hand < i.open_demand)
      inventoryEvidence.push(...risks.slice(0,16).map(i => evidence('ingredients',i.id,`${i.name.slice(0,220)} · Stock check`,
        `On hand ${i.on_hand} ${i.unit}. Older orders still need ${i.open_demand} ${i.unit}. This order ${context.order.stock_confirmed ? 'used' : 'needs'} ${i.required} ${i.unit}. Low stock level ${i.threshold} ${i.unit}.`)))
      findings.push({ kind:'stock_pressure', severity:shortage?'high':'medium',
        title:shortage?'Mapped ingredient demand exceeds stock':'Mapped ingredients are near their reorder threshold',
        summary:`${risks.length} ingredient(s) need a stock review. On-hand counts already reflect confirmed deductions. Outstanding demand covers older tickets still due to deduct. Verify the physical count before acting.`, evidence:[...inventoryEvidence] })
    }
    inventoryEvidence.push(...context.products.filter(p => p.makeable != null).slice(0, 16 - inventoryEvidence.length)
      .map(p => evidence('product_ingredients',p.id || 'deleted-item',p.name.slice(0,250),
        `Remaining stock can make up to ${p.makeable} using the current base recipe for this dish alone. Other dishes may use the same ingredients.`)))
    if (unmapped.length) {
      findings.push({ kind:'recipe_review', severity:'medium', title:'Recipe coverage needs a human check',
        summary:`${unmapped.length} item(s) have no ingredient mapping or use variants/modifiers without separate recipe definitions. Ingredient checks cover the stored base recipe only; complete availability cannot be established.`,
        evidence:unmapped.slice(0,16).map(p => evidence('product_ingredients',p.id||'deleted-item',p.name,
          `Recipe mapped: ${p.has_recipe}; variants: ${p.has_variants}; modifiers on order: ${p.has_modifiers}.`)) })
    }
    const unavailable = context.products.filter(p => !p.available)
    const empty = context.products.length===0
    const age = Math.max(0,(Date.parse(observed)-Date.parse(context.order.created_at))/60000)
    if(empty)orderEvidence.push(evidence('orders',context.order.id,'Order lines','No readable product lines were found. Verify this order before relying on ingredient coverage.'))
    if (unavailable.length) orderEvidence.push(...unavailable.slice(0,15).map(p => evidence('products',p.id||'deleted-item',p.name,'Item is currently unavailable in the menu.')))
    if (age >= 15) orderEvidence.push(evidence('orders',context.order.id,'Order age',`${Math.floor(age)} minutes since creation. This is not a preparation-time estimate.`))
    if (orderEvidence.length) findings.push({ kind:'order_review', severity:unavailable.length||empty?'high':'low', title:empty?'Order items need verification':unavailable.length?'An open order contains unavailable items':'Check progress on this open order',
      summary:empty?'No readable product lines were found for this open order. Verify its contents; no stock coverage or approval can be established.':unavailable.length?'Check the accepted order with your team before offering a verified alternative. The agent has not rejected or changed the order.':'This order is at least 15 minutes old. Check service progress; kitchen preparation and ready/served timestamps are not yet available.', evidence:[...orderEvidence] })
  }
  const summary = closed ? 'This order is closed. No operational recommendation was created.'
    : findings.length ? `${findings.length} finding(s) for administrator review. Stock and menu evidence were combined under rules.v1. No business records were changed.`
    : 'No issue found in the available mapped stock and menu facts. This is not an order approval or a preparation-time guarantee.'
  return outputSchema.parse({ schema_version:1, policy_version:'rules.v1', summary, findings,
    messages:[
      {task_id:job.id,sender:'order',recipient:'supervisor',objective:'Review current menu availability and open-order age.',status:orderEvidence.length?'attention':'clear',evidence:orderEvidence,
        constraints:['Advisory only; staff confirm or reject orders.','No kitchen ETA is inferred from order creation time.']},
      {task_id:job.id,sender:'inventory',recipient:'supervisor',objective:'Check ingredient stock and how many more servings the base recipes can make.',status:unmapped.length?'insufficient_data':findings.some(f => f.kind === 'stock_pressure')?'attention':'clear',evidence:inventoryEvidence,
        constraints:['Yield is a one-dish estimate from current stock.','Confirmed deductions are already reflected in stock.','Sizes and extras use the base recipe.']},
      {task_id:job.id,sender:'supervisor',recipient:'administrator',objective:'Combine evidence and request human review where needed.',status:findings.length?'attention':'clear',
        evidence:findings.flatMap(f=>f.evidence).slice(0,16),constraints:['Acknowledgement records a review, not execution.','Recheck source freshness before accepting a review.']},
    ] })
}
