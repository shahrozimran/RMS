/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // PWA will be enabled by wrapping with next-pwa in production
  turbopack: {},
}

// Wrap with next-pwa in production only (avoids dev mode SW conflicts)
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https?.*\/api\/products.*/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'rms-products-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      urlPattern: /^https?.*\/api\/categories.*/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'rms-categories-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      urlPattern: /^https?.*\/api\/settings.*/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'rms-settings-cache',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      urlPattern: /^https?.*\/api\/tables.*/,
      handler: 'NetworkFirst',
      options: { cacheName: 'rms-tables-cache' },
    },
    {
      urlPattern: /\/_next\/static\/.*/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    {
      urlPattern: /^https?.*fonts\.googleapis\.com.*/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'google-fonts' },
    },
  ],
})

module.exports = withPWA(nextConfig)
