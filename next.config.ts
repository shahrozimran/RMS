const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none';
`.replace(/\s{2,}/g, ' ').trim()

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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
    ]
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
