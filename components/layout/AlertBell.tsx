'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { pollVisible } from '@/lib/utils/poll'

export default function AlertBell({ href, preview = false }: { href: string; preview?: boolean }) {
  const [count, setCount] = useState(preview ? 1 : 0)
  useEffect(() => {
    if (preview) return
    let active = true
    let running = false
    const update = async () => {
      if (running || document.hidden) return
      running = true
      try {
        const response = await fetch('/api/alerts?count=true', { cache: 'no-store' })
        if (response.ok) {
          const result = await response.json()
          if (active) setCount(result.count ?? 0)
        }
      } catch { /* Keep the last count during a network interruption. */ }
      finally { running = false }
    }
    const stop = pollVisible(update, 30000)
    window.addEventListener('rms-alerts-updated', update)
    return () => { active = false; stop(); window.removeEventListener('rms-alerts-updated', update) }
  }, [preview])
  return <Link href={href} className="alerts-bell btn btn-secondary btn-sm" aria-label={count ? `Alerts, ${count} unread` : 'Alerts'} title="Alerts">
    <Bell size={16}/><span className="alert-label">Alerts</span>{count > 0 && <span className="alert-count">{count > 99 ? '99+' : count}</span>}
  </Link>
}
