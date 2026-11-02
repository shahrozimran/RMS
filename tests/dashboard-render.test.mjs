import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

function load(file) {
  const absolute = path.resolve(file)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const mod = new Module(absolute)
  mod.paths = Module._nodeModulePaths(path.dirname(absolute))
  const native = Module.createRequire(absolute)
  mod.require = name => {
    if (name.startsWith('@/')) {
      const base = path.resolve(name.slice(2))
      return load(fs.existsSync(base + '.tsx') ? base + '.tsx' : base + '.ts')
    }
    return native(name)
  }
  mod._compile(code, absolute)
  return mod.exports
}

test('dashboard initial markup survives different server/browser zones and null table relations', () => {
  const Dashboard = load('app/admin/dashboard/DashboardClient.tsx').default
  const props = {
    todayRevenue: 0, todayOrderCount: 0, activeOrderCount: 0, staffOnlineCount: 2,
    topItems: [], activeOrders: [], preview: true,
    currency: { code: 'USD', symbol: '$', locale: 'en-US' },
    recentOrders: [{
      id: '00000000-0000-4000-8000-000000000001', status: 'void', order_type: 'takeaway',
      total: 10, created_at: '2026-11-02T23:55:00Z', staff: { name: 'Test' },
      table: { table_number: null },
    }],
  }
  const originalZone = process.env.TZ
  try {
    process.env.TZ = 'UTC'
    const server = renderToStaticMarkup(React.createElement(Dashboard, props))
    process.env.TZ = 'Asia/Karachi'
    const initialClient = renderToStaticMarkup(React.createElement(Dashboard, props))
    assert.equal(initialClient, server)
    assert.match(server, /11:55 PM UTC/)
    assert.match(server, /Walk-in guest/)
    assert.doesNotMatch(server, /Table null/)
  } finally {
    if (originalZone === undefined) delete process.env.TZ
    else process.env.TZ = originalZone
  }
})
