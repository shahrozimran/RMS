'use client'

import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '@/lib/utils/currency'
import { previewCatalog } from '@/lib/preview/data'

export default function RevenueChart({ points }: { points: { day: string; sales: number; orders: number }[] }) {
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={points} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
      <defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#586630" stopOpacity={.2} /><stop offset="100%" stopColor="#586630" stopOpacity={0} /></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="#ebe7da" strokeDasharray="4 4" />
      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#626653', fontSize: 11 }} />
      <YAxis tickFormatter={n => `$${Number(n) / 1000}k`} axisLine={false} tickLine={false} tick={{ fill: '#626653', fontSize: 10 }} />
      <Tooltip formatter={value => formatCurrency(Number(value), previewCatalog.settings.currency)} contentStyle={{ borderRadius: 10, border: '1px solid #dfdbcd', fontSize: 12 }} />
      <Area type="monotone" dataKey="sales" name="Revenue" stroke="#435020" strokeWidth={2.5} fill="url(#salesFill)" />
    </AreaChart>
  </ResponsiveContainer>
}
