import type { Metadata } from 'next'
import './globals.css'
import './workspace.css'
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
  themeColor: '#205e41',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <body><ServiceWorker />{children}</body>
    </html>
  )
}
