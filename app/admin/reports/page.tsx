'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import Papa from 'papaparse'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

interface AnalyticsRow {
  day: string
  orders_count: number
  revenue: number
  tax_collected: number
  avg_order_val: number
}

interface TopItemRow {
  product_id: string
  product_name: string
  qty_sold: number
  revenue: number
}

interface PaymentSplitRow {
  method: string
  count: number
  total: number
}

export default function AdminReportsPage() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState<CurrencyConfig>({ code: 'USD', symbol: '$', locale: 'en-US' })

  // Data State
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([])
  const [topItems, setTopItems] = useState<TopItemRow[]>([])
  const [payments, setPayments] = useState<PaymentSplitRow[]>([])
  const [leaderboard, setLeaderboard] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => {
    fetchCurrency()
  }, [])

  useEffect(() => {
    fetchReportData()
  }, [fromDate, toDate])

  const fetchCurrency = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'currency').single()
    if (data?.value) setCurrency(data.value as any)
  }

  const fetchReportData = async () => {
    setLoading(true)
    const fromISO = new Date(fromDate).toISOString()
    const toISO = new Date(toDate + 'T23:59:59').toISOString()

    try {
      // 1. Fetch Order Analytics RPC
      const { data: analyticsRes, error: analyticError } = await supabase
        .rpc('get_order_analytics', { p_from_date: fromISO, p_to_date: toISO })
      if (analyticError) throw analyticError
      setAnalytics((analyticsRes || []) as AnalyticsRow[])

      // 2. Fetch Top Items RPC
      const { data: topRes, error: topError } = await supabase
        .rpc('get_top_items', { p_limit: 10, p_from_date: fromISO, p_to_date: toISO })
      if (topError) throw topError
      setTopItems((topRes || []) as TopItemRow[])

      // 3. Fetch Payment Methods RPC
      const { data: payRes, error: payError } = await supabase
        .rpc('get_payment_method_split', { p_from_date: fromISO, p_to_date: toISO })
      if (payError) throw payError
      setPayments((payRes || []) as PaymentSplitRow[])

      // 4. Fetch Staff Performance
      const { data: staffList } = await supabase
        .from('users')
        .select('id, name, username')
        .is('auth_user_id', null)

      if (staffList) {
        const perfData = await Promise.all(
          staffList.map(async (s) => {
            const { data: summary } = await supabase
              .rpc('get_staff_sales_summary', { p_staff_id: s.id, p_from_date: fromISO, p_to_date: toISO })
              .single() as { data: { orders_count: number; total_revenue: number; avg_order_value: number } | null; error: any }
            return {
              name: s.name,
              username: s.username,
              orders_count: (summary as any)?.orders_count || 0,
              total_revenue: (summary as any)?.total_revenue || 0,
              avg_order_value: (summary as any)?.avg_order_value || 0
            }
          })
        )
        setLeaderboard(perfData.sort((a,b) => b.total_revenue - a.total_revenue))
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    const csvData = analytics.map(row => ({
      Date: row.day,
      'Orders Completed': row.orders_count,
      'Revenue Generated': formatCurrency(row.revenue, currency),
      'Tax Collected': formatCurrency(row.tax_collected, currency),
      'Avg Order Value': formatCurrency(row.avg_order_val, currency)
    }))
    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `RMS_Sales_Report_${fromDate}_to_${toDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportPDF = async () => {
    const element = document.getElementById('report-analytics-section')
    if (!element) return

    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#FAF8F5' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgWidth = 210
    const pageHeight = 295
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }
    pdf.save(`RMS_Sales_Report_${fromDate}_to_${toDate}.pdf`)
  }

  const totalRevenue = analytics.reduce((s, a) => s + Number(a.revenue), 0)
  const totalTax = analytics.reduce((s, a) => s + Number(a.tax_collected), 0)
  const totalOrders = analytics.reduce((s, a) => s + Number(a.orders_count), 0)

  return (
    <div className="animate-in" id="report-analytics-section">
      {/* Header and filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Reports &amp; Analytics</h1>
          <p>System-wide sales, tax collections, payment modes, and performance leaderboards.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              id="report-from-date"
              type="date"
              className="input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ minHeight: '36px', padding: '6px 12px', width: '150px' }}
            />
            <span style={{ color: 'var(--charcoal-soft)', fontSize: '13px' }}>to</span>
            <input
              id="report-to-date"
              type="date"
              className="input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ minHeight: '36px', padding: '6px 12px', width: '150px' }}
            />
          </div>
          <button id="export-csv-btn" className="btn btn-secondary btn-sm" onClick={exportCSV}>CSV Export</button>
          <button id="export-pdf-btn" className="btn btn-primary btn-sm" onClick={exportPDF}>PDF Export</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px', fontSize: '16px', color: 'var(--charcoal-soft)' }}>
          Computing analytics data...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="kpi-card" id="rep-kpi-rev">
              <div style={{ width:40, height:40, borderRadius:10, background:'var(--accent-bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-dark)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--charcoal)', letterSpacing:'-0.03em' }}>{formatCurrency(totalRevenue, currency)}</div>
                <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>Total Sales (Paid)</div>
              </div>
            </div>
            <div className="kpi-card" id="rep-kpi-tax">
              <div style={{ width:40, height:40, borderRadius:10, background:'var(--info-bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--charcoal)', letterSpacing:'-0.03em' }}>{formatCurrency(totalTax, currency)}</div>
                <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>Tax Collected</div>
              </div>
            </div>
            <div className="kpi-card" id="rep-kpi-orders">
              <div style={{ width:40, height:40, borderRadius:10, background:'var(--success-bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--charcoal)', letterSpacing:'-0.03em' }}>{totalOrders}</div>
                <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>Total Orders Taken</div>
              </div>
            </div>
          </div>

          {/* Revenue chart */}
          <div className="surface-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px' }}>Daily Sales Trend</h3>
            {analytics.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--charcoal-soft)' }}>No sales transactions in this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={analytics} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--charcoal-soft)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--charcoal-soft)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--charcoal)', boxShadow: 'var(--shadow-md)', fontSize: 13 }}
                    cursor={{ stroke: 'var(--border-strong)' }}
                    formatter={(v: any) => [formatCurrency(v, currency), 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Grid: Top performance leaderboard vs Payment mode breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
            {/* Top performing staff leaderboard */}
            <div className="surface-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Top Performing Staff</h3>
              <div style={{ overflow: 'hidden' }}>
                <table className="data-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Orders</th>
                      <th>Total Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: 'var(--charcoal)' }}>
                          {idx + 1}. {item.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>@{item.username}</span>
                        </td>
                        <td>{item.orders_count}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(item.total_revenue, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment method split */}
            <div className="surface-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Payment Mode Summary</h3>
              <div style={{ overflow: 'hidden' }}>
                <table className="data-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Payment Method</th>
                      <th>Transactions</th>
                      <th>Total Captured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: 'var(--charcoal)', textTransform: 'capitalize' }}>
                          {p.method.replace('_', ' ')}
                        </td>
                        <td>{p.count}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(p.total, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
