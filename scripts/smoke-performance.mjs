// Run against a built/started server, or pass the deployed public origin.
// Uses anonymous reads and an invalid-origin, invalid-body request only.
import assert from 'node:assert/strict'

const origin = new URL(process.argv[2] || 'http://127.0.0.1:3001')
assert.ok(['http:', 'https:'].includes(origin.protocol))
const probes = [
  ['/login', 200], ['/preview', 404], ['/admin/pos', 307],
  ['/api/catalog', 401], ['/api/qr/pending?count=true', 401],
]
for (const [route, status] of probes) {
  const response = await fetch(new URL(route, origin), { redirect: 'manual' })
  assert.equal(response.status, status, `${route} HTTP status`)
  if (route.startsWith('/api/')) assert.match(response.headers.get('cache-control') || '', /private.*no-store/)
  if (route === '/login') {
    const html = await response.text()
    assert.ok(!html.includes('fonts.googleapis.com'), 'Font stylesheet must be self-hosted')
    assert.ok(html.includes('/_next/static/media/'), 'Built font assets should be present')
  }
  console.log(`${response.status} ${route}`)
}
const rejected = await fetch(new URL('/api/orders', origin), {
  method: 'POST', headers: { Origin: 'https://invalid-origin.example', 'Content-Type': 'application/json' }, body: '{}',
})
assert.equal(rejected.status, 403, 'Cross-origin mutation must be rejected')
console.log('403 cross-origin mutation; production smoke checks passed')
