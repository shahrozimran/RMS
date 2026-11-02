'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const browserSnapshot = () => true
const serverSnapshot = () => false

/** Keep server and initial client markup identical before using browser local time. */
export default function LocalDateTime({
  value,
  mode = 'time',
}: {
  value?: string
  mode?: 'date' | 'time'
}) {
  const hydrated = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot)
  if (!hydrated && !value) return <time>Today</time>

  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.valueOf())) return <time>—</time>

  const options: Intl.DateTimeFormatOptions = mode === 'date'
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { hour: '2-digit', minute: '2-digit' }
  if (!hydrated) options.timeZone = 'UTC'

  const text = mode === 'date'
    ? date.toLocaleDateString('en-US', options)
    : date.toLocaleTimeString('en-US', options)

  return <time dateTime={value}>{text}{!hydrated && mode === 'time' ? ' UTC' : ''}</time>
}
