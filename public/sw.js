// Network-only worker. Retire legacy caches containing authenticated API data.
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const legacy = /^(rms-|workbox-precache|start-url$|next-data$|others$)/
    await Promise.all((await caches.keys()).filter(key => legacy.test(key)).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})
