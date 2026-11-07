// Read-only diagnostics. Never prints credentials, customer data or query results.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'
import { formatCurrency } from '../lib/utils/currency.ts'

const formatStart = performance.now()
for (let i = 0; i < 10000; i++) formatCurrency(i / 100)
console.log(JSON.stringify({ currencyFormats: 10000, elapsedMs: Math.round(performance.now() - formatStart) }))

const routes = ['admin/pos', 'admin/reports', 'admin/orders/[id]', 'staff/orders/[id]/receipt', 'preview']
for (const route of routes) {
  const file = path.join('.next/server/app', route, 'page_client-reference-manifest.js')
  if (!fs.existsSync(file)) continue
  const context = {}
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context)
  const manifest = Object.values(context.__RSC_MANIFEST)[0]
  const chunks = new Set(Object.values(manifest.clientModules).flatMap(entry => entry.chunks).filter(chunk => chunk.endsWith('.js')))
  let bytes = 0, gzipBytes = 0
  for (const chunk of chunks) {
    const content = fs.readFileSync(path.join('.next', chunk.replace(/^\/_next\//, '')))
    bytes += content.length
    gzipBytes += gzipSync(content).length
  }
  console.log(JSON.stringify({ route: `/${route}`, routeClientJsBytes: bytes, routeClientJsGzipBytes: gzipBytes, chunks: chunks.size }))
}

if (process.argv.includes('--database')) {
  const { createClient } = await import('@supabase/supabase-js')
  const { supabaseUrl } = await import('../lib/supabase/connection.mjs')
  const db = createClient(supabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL), process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const probes = {
    catalog: () => db.rpc('get_pos_catalog'),
    dashboard: () => db.rpc('get_admin_dashboard', { p_from_date: new Date().toISOString().slice(0, 10) }),
    pendingList: () => db.from('qr_pending_orders').select('id,table_id,customer_name,items,status,confirmed_order_id,created_at,table:tables(id,table_number,section,status)').eq('status', 'pending').order('created_at').limit(200),
    pendingCount: () => db.from('qr_pending_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  }
  for (const [probe, read] of Object.entries(probes)) {
    const timings = [], sizes = []
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      const { data, error } = await read()
      if (error) throw new Error(`${probe}: ${error.code || 'database error'}`)
      timings.push(Math.round(performance.now() - start))
      sizes.push(data ? Buffer.byteLength(JSON.stringify(data)) : 0)
    }
    console.log(JSON.stringify({ probe, timingsMs: timings, responseBytes: sizes }))
  }
}
