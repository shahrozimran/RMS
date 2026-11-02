'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, type CurrencyConfig } from '@/lib/utils/currency'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import Papa from 'papaparse'
import jsPDF from 'jspdf'

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
  const [isExporting, setIsExporting] = useState(false)

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
      const [a,t,p,l] = await Promise.all([
        supabase.rpc('get_order_analytics', { p_from_date: fromISO, p_to_date: toISO }),
        supabase.rpc('get_top_items', { p_limit: 10, p_from_date: fromISO, p_to_date: toISO }),
        supabase.rpc('get_payment_method_split', { p_from_date: fromISO, p_to_date: toISO }),
        supabase.rpc('get_staff_leaderboard', { p_from_date: fromISO, p_to_date: toISO }),
      ])
      for (const response of [a,t,p,l]) if (response.error) throw response.error
      setAnalytics(a.data || [])
      setTopItems(t.data || [])
      setPayments(p.data || [])
      setLeaderboard(l.data || [])
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
    setIsExporting(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = 210
      const pageH = 297
      const margin = 15
      const contentW = pageW - margin * 2
      let y = margin

      // ── Palette ──────────────────────────────────────────────
      const ACCENT  = [79,  70,  229] as [number, number, number]  // indigo
      const BLUE    = [59,  130, 246] as [number, number, number]
      const GREEN   = [16,  185, 129] as [number, number, number]
      const DARK    = [15,  23,  42]  as [number, number, number]
      const MID     = [71,  85,  105] as [number, number, number]
      const SUBTLE  = [148, 163, 184] as [number, number, number]
      const BG      = [248, 250, 252] as [number, number, number]
      const WHITE   = [255, 255, 255] as [number, number, number]

      // ── Helpers ───────────────────────────────────────────────
      const checkPage = (needed: number) => {
        if (y + needed > pageH - 15) {
          pdf.addPage()
          y = margin
        }
      }

      // Draw a full-width section table.
      // Returns nothing; mutates the closure `y`.
      const drawTable = (
        title: string,
        headers: string[],
        rows: string[][],
        colWidths: number[]
      ) => {
        const rowH    = 7
        const headerH = 7
        checkPage(headerH + Math.min(rows.length, 4) * rowH + 16)

        // Section title
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(...DARK)
        pdf.text(title, margin, y)
        y += 6

        // Header bar
        pdf.setFillColor(...ACCENT)
        pdf.rect(margin, y, contentW, headerH, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(...WHITE)
        let hx = margin + 3
        headers.forEach((h, i) => {
          pdf.text(h, hx, y + 4.8)
          hx += colWidths[i]
        })
        y += headerH

        // Data rows
        rows.forEach((row, ri) => {
          checkPage(rowH + 2)
          if (ri % 2 === 0) {
            pdf.setFillColor(...BG)
            pdf.rect(margin, y, contentW, rowH, 'F')
          }
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8)
          pdf.setTextColor(...DARK)
          let cx = margin + 3
          row.forEach((cell, i) => {
            pdf.text(String(cell), cx, y + 4.8)
            cx += colWidths[i]
          })
          y += rowH
        })

        // Bottom rule
        pdf.setDrawColor(...SUBTLE)
        pdf.setLineWidth(0.2)
        pdf.line(margin, y, margin + contentW, y)
        y += 10
      }

      // ── Header ────────────────────────────────────────────────
      // Tri-colour accent bar
      pdf.setFillColor(...GREEN)
      pdf.rect(0, 0, contentW / 3, 2.5, 'F')
      pdf.setFillColor(...BLUE)
      pdf.rect(contentW / 3, 0, contentW / 3, 2.5, 'F')
      pdf.setFillColor(...ACCENT)
      pdf.rect((contentW / 3) * 2, 0, pageW, 2.5, 'F')

      y = 10
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(15)
      pdf.setTextColor(...DARK)
      pdf.text('RESTAURANT MANAGEMENT SYSTEM', margin, y)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(...MID)
      pdf.text('ANALYTICS & SALES PERFORMANCE REPORT', margin, y + 5)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(...MID)
      pdf.text(`Report Period: ${fromDate}  –  ${toDate}`, pageW - margin, y, { align: 'right' })
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin, y + 5, { align: 'right' })

      y += 11
      pdf.setDrawColor(...SUBTLE)
      pdf.setLineWidth(0.3)
      pdf.line(margin, y, pageW - margin, y)
      y += 8

      // ── KPI Cards ─────────────────────────────────────────────
      const cardW = (contentW - 8) / 3
      const cardH = 22
      const kpis = [
        { label: 'Total Sales (Paid)',  value: formatCurrency(totalRevenue, currency), color: GREEN  },
        { label: 'Tax Collected',       value: formatCurrency(totalTax, currency),     color: BLUE   },
        { label: 'Total Orders Taken',  value: String(totalOrders),                   color: ACCENT },
      ]
      kpis.forEach((kpi, i) => {
        const cx = margin + i * (cardW + 4)
        pdf.setFillColor(...BG)
        pdf.roundedRect(cx, y, cardW, cardH, 2, 2, 'F')
        pdf.setFillColor(...kpi.color)
        pdf.rect(cx, y, 2.5, cardH, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(13)
        pdf.setTextColor(...DARK)
        pdf.text(kpi.value, cx + 6, y + 9)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(...MID)
        pdf.text(kpi.label, cx + 6, y + 17)
      })
      y += cardH + 12

      // ── Daily Sales Chart ─────────────────────────────────────
      if (analytics.length > 0) {
        checkPage(65)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(...DARK)
        pdf.text('Daily Sales Trend', margin, y)
        y += 6

        const chartX = margin + 14
        const chartW = contentW - 14
        const chartH = 42
        const chartY = y

        pdf.setFillColor(...BG)
        pdf.rect(chartX, chartY, chartW, chartH, 'F')

        const maxRev = Math.max(...analytics.map(a => Number(a.revenue)), 1)
        const N_GRID = 4

        for (let gi = 0; gi <= N_GRID; gi++) {
          const gy = chartY + chartH - (gi / N_GRID) * chartH
          pdf.setDrawColor(...SUBTLE)
          pdf.setLineWidth(0.15)
          pdf.line(chartX, gy, chartX + chartW, gy)
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(5.5)
          pdf.setTextColor(...SUBTLE)
          pdf.text(
            currency.symbol + (maxRev * gi / N_GRID).toFixed(0),
            chartX - 1, gy + 1, { align: 'right' }
          )
        }

        const ptStep = analytics.length > 1 ? chartW / (analytics.length - 1) : chartW
        const points = analytics.map((a, i) => ({
          x: chartX + i * ptStep,
          y: chartY + chartH - Math.max((Number(a.revenue) / maxRev) * chartH, 0)
        }))

        // Fill under line as a series of triangles
        for (let fi = 0; fi < points.length - 1; fi++) {
          const x1 = points[fi].x, y1 = points[fi].y
          const x2 = points[fi + 1].x, y2 = points[fi + 1].y
          const base = chartY + chartH
          pdf.setFillColor(235, 239, 255)
          pdf.triangle(x1, y1, x2, y2, x2, base, 'F')
          pdf.triangle(x1, y1, x1, base, x2, base, 'F')
        }

        // Line
        pdf.setDrawColor(...BLUE)
        pdf.setLineWidth(0.9)
        for (let li = 1; li < points.length; li++) {
          pdf.line(points[li - 1].x, points[li - 1].y, points[li].x, points[li].y)
        }

        // Dots
        pdf.setFillColor(...BLUE)
        points.forEach(p => pdf.circle(p.x, p.y, 1.2, 'F'))

        // X-axis labels
        const maxL = Math.floor(chartW / 16)
        const every = Math.max(1, Math.ceil(analytics.length / maxL))
        analytics.forEach((a, i) => {
          if (i % every === 0 || i === analytics.length - 1) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(5.5)
            pdf.setTextColor(...MID)
            pdf.text(a.day.slice(5), chartX + i * ptStep, chartY + chartH + 4, { align: 'center' })
          }
        })

        y = chartY + chartH + 10
      }

      // ── Tables ────────────────────────────────────────────────
      if (leaderboard.length > 0) {
        drawTable(
          'Top Performing Staff',
          ['#  Name', 'Username', 'Orders', 'Total Sales', 'Avg. Order'],
          leaderboard.map((s, i) => [
            `${i + 1}. ${s.name}`,
            `@${s.username}`,
            String(s.orders_count),
            formatCurrency(s.total_revenue, currency),
            formatCurrency(s.avg_order_value, currency),
          ]),
          [52, 38, 22, 38, 30]
        )
      }

      if (payments.length > 0) {
        drawTable(
          'Payment Mode Summary',
          ['Payment Method', 'Transactions', 'Total Captured'],
          payments.map(p => [
            p.method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            String(p.count),
            formatCurrency(p.total, currency),
          ]),
          [80, 50, 50]
        )
      }

      if (topItems.length > 0) {
        drawTable(
          'Top Menu Items',
          ['Item Name', 'Qty Sold', 'Revenue'],
          topItems.map((it, i) => [
            `${i + 1}. ${it.product_name}`,
            String(it.qty_sold),
            formatCurrency(it.revenue, currency),
          ]),
          [110, 30, 40]
        )
      }

      if (analytics.length > 0) {
        drawTable(
          'Daily Sales Breakdown',
          ['Date', 'Orders', 'Revenue', 'Tax Collected', 'Avg. Order'],
          analytics.map(a => [
            a.day,
            String(a.orders_count),
            formatCurrency(a.revenue, currency),
            formatCurrency(a.tax_collected, currency),
            formatCurrency(a.avg_order_val, currency),
          ]),
          [42, 22, 42, 42, 32]
        )
      }

      // ── Footer on every page ──────────────────────────────────
      const totalPages = pdf.getNumberOfPages()
      for (let pi = 1; pi <= totalPages; pi++) {
        pdf.setPage(pi)
        const fy = pageH - 8
        pdf.setDrawColor(...SUBTLE)
        pdf.setLineWidth(0.2)
        pdf.line(margin, fy - 3, pageW - margin, fy - 3)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.setTextColor(...SUBTLE)
        pdf.text(`Restaurant Management System © ${new Date().getFullYear()}`, margin, fy)
        pdf.text('Confidential · System Generated Report', pageW - margin, fy, { align: 'right' })
        pdf.text(`Page ${pi} of ${totalPages}`, pageW / 2, fy, { align: 'center' })
      }

      pdf.save(`RMS_Sales_Report_${fromDate}_to_${toDate}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const totalRevenue = analytics.reduce((s, a) => s + Number(a.revenue), 0)
  const totalTax = analytics.reduce((s, a) => s + Number(a.tax_collected), 0)
  const totalOrders = analytics.reduce((s, a) => s + Number(a.orders_count), 0)

  return (
    <div className="animate-in">
      {/* Header and filters */}
      {(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
          <div className="page-header" style={{ marginBottom: 0 }}>
            <span className="eyebrow">A clearer picture of your business</span><h1>Good decisions start here.</h1>
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
            <button id="export-pdf-btn" className="btn btn-primary btn-sm" onClick={exportPDF} disabled={isExporting}>
                {isExporting ? 'Generating PDF…' : 'PDF Export'}
              </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px', fontSize: '16px', color: 'var(--charcoal-soft)' }}>
          Computing analytics data...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} id="report-analytics-section">
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="kpi-card" id="rep-kpi-rev">
              <div style={{ width:40, height:40, borderRadius:10, background: 'var(--accent-bg)', border: '1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-dark)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--charcoal)', letterSpacing:'-0.03em' }}>{formatCurrency(totalRevenue, currency)}</div>
                <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>Total Sales (Paid)</div>
              </div>
            </div>
            <div className="kpi-card" id="rep-kpi-tax">
              <div style={{ width:40, height:40, borderRadius:10, background: 'var(--info-bg)', border: '1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--charcoal)', letterSpacing:'-0.03em' }}>{formatCurrency(totalTax, currency)}</div>
                <div style={{ fontSize: '13px', color: 'var(--charcoal-soft)', marginTop: '2px' }}>Tax Collected</div>
              </div>
            </div>
            <div className="kpi-card" id="rep-kpi-orders">
              <div style={{ width:40, height:40, borderRadius:10, background: 'var(--success-bg)', border: '1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
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
                  <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={3} dot={{ fill: 'var(--accent)', r: 5 }} />
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
