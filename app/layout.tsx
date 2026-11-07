import type { Metadata } from 'next'
import { connection } from 'next/server'
import './globals.css'
import './workspace.css'
import './theme.css'
import ServiceWorker from '@/components/ServiceWorker'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-jakarta' })

export const metadata: Metadata = {
  title: {
    default: 'Restaurant Management System',
    template: '%s | RMS',
  },
  description: 'A full-stack restaurant management system for orders, billing, and analytics.',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#171913',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The browser policy nonce is unique to this request.
  await connection()
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <body><ServiceWorker />{children}</body>
    </html>
  )
}
