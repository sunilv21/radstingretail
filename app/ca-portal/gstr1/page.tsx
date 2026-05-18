'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Receipt, Download, AlertCircle, FileText } from 'lucide-react'
import { api, ApiError, API_BASE } from '@/lib/api'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────
// Real GSTR-1 response shape (from server/services/gst.service.js).
// Sections are NOT all the same shape: 4A_B2B/5A_B2CL/6A_Exports/6B_SEZ/
// 7_B2CS/9B_CDNR/9B_CDNUR/12_HSN have { rows, totals }, while
// 8_NilExempt has { nil, exempt, nonGst } and 13_Documents has
// { invoices: { from, to, total, cancelled } }.
// ─────────────────────────────────────────────────────────────────────

interface SectionTotals {
  count?: number
  taxableValue?: number
  cgst?: number
  sgst?: number
  igst?: number
  totalTax?: number
  invoiceValue?: number
}

interface RowsSection {
  rows: unknown[]
  totals?: SectionTotals
}

interface NilExemptSection {
  nil: number
  exempt: number
  nonGst: number
}

interface DocumentsSection {
  invoices: { from?: string; to?: string; total?: number; cancelled?: number }
}

type Gstr1Section = RowsSection | NilExemptSection | DocumentsSection

interface Gstr1Resp {
  period: string
  gstin?: string
  sections: Record<string, Gstr1Section>
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ROWS_SECTIONS = [
  '4A_B2B',
  '5A_B2CL',
  '6A_Exports',
  '6B_SEZ',
  '7_B2CS',
  '9B_CDNR',
  '9B_CDNUR',
  '12_HSN',
] as const

function isRowsSection(s: Gstr1Section): s is RowsSection {
  return !!s && Array.isArray((s as RowsSection).rows)
}

export default function CaGstr1() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Gstr1Resp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.get<Gstr1Resp>(`/gst/gstr1/${period}`))
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.code || 'ERROR'} · ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Could not load GSTR-1 for this period'
      setError(message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  // Compute top-level totals across all the rows-bearing sections. The
  // server does not return them pre-aggregated, so we add them up here.
  // Credit/debit-note buckets are tax reversals — subtract them from the
  // headline totals so the figures match what a CA expects to file.
  const totals = useMemo(() => {
    const acc = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, invoiceCount: 0 }
    if (!data) return acc
    for (const key of ROWS_SECTIONS) {
      const sec = data.sections?.[key]
      if (!sec || !isRowsSection(sec) || !sec.totals) continue
      if (key === '12_HSN') continue // HSN is a re-aggregation of the same supply
      const sign = key === '9B_CDNR' || key === '9B_CDNUR' ? -1 : 1
      acc.taxableValue += sign * (sec.totals.taxableValue || 0)
      acc.cgst += sign * (sec.totals.cgst || 0)
      acc.sgst += sign * (sec.totals.sgst || 0)
      acc.igst += sign * (sec.totals.igst || 0)
      acc.totalTax += sign * (sec.totals.totalTax || 0)
      acc.invoiceCount += sign * (sec.totals.count || 0)
    }
    return acc
  }, [data])

  const hasAnyData = !!data && totals.invoiceCount !== 0

  const exportJson = async () => {
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${API_BASE}/gst/export/gstr1/${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        toast.error(`Export failed (${res.status}): ${body.slice(0, 120)}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gstr1-${period}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-blue-600" /> GSTR-1
          </h1>
          {data?.gstin && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              GSTIN: {data.gstin}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-end">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-8 border rounded px-2 bg-background text-sm"
          />
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Reload'}
          </Button>
          <Button
            onClick={exportJson}
            disabled={loading || !hasAnyData}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Download className="w-4 h-4 mr-1" /> Export JSON
          </Button>
        </div>
      </div>

      {/* Loading state — shimmer */}
      {loading && !data && !error && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded border bg-muted/40 animate-pulse" />
            ))}
          </div>
          <div className="h-32 rounded border bg-muted/40 animate-pulse" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <Card className="border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-rose-900 dark:text-rose-200">
                Could not load GSTR-1
              </div>
              <div className="text-rose-800 dark:text-rose-300 mt-1 font-mono text-xs">
                {error}
              </div>
              <div className="text-rose-700 dark:text-rose-400 mt-2 text-[12px]">
                {error.toLowerCase().includes('store_not_found') ? (
                  <>
                    Your CA account&rsquo;s active branch is invalid. Use the branch
                    switcher in the sidebar to pick a different branch.
                  </>
                ) : error.toLowerCase().includes('forbidden') ||
                  error.toLowerCase().includes('not granted') ? (
                  <>
                    You don&rsquo;t have access to this branch. Ask your admin to grant
                    you the right branches under Org Admin → Users.
                  </>
                ) : (
                  <>
                    If this keeps happening, ask the tenant admin to check the server
                    logs for this request.
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Headline totals */}
      {data && !error && (
        <Card>
          <CardContent className="p-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Cell label="Taxable" value={money(totals.taxableValue)} />
            <Cell label="CGST" value={money(totals.cgst)} />
            <Cell label="SGST" value={money(totals.sgst)} />
            <Cell label="IGST" value={money(totals.igst)} />
            <Cell label="Total Tax" value={money(totals.totalTax)} highlight />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {data && !error && !hasAnyData && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <div className="font-semibold text-sm text-foreground">
              No outward supplies for {period}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              Nothing to file in GSTR-1 for the selected month on the active branch.
              Pick a different month, or switch branch from the sidebar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Section breakdown */}
      {data && !error && hasAnyData && (
        <Card>
          <CardContent className="p-3 text-sm space-y-2">
            <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Section breakdown
            </div>
            {Object.entries(data.sections || {}).map(([key, sec]) => {
              // Each section has its own shape — render accordingly.
              if (isRowsSection(sec)) {
                if (sec.rows.length === 0) return null
                return (
                  <div key={key} className="border rounded p-2">
                    <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      {key}
                    </div>
                    <div className="text-xs">
                      Rows: <b>{sec.rows.length}</b>
                      {sec.totals?.taxableValue !== undefined && (
                        <>
                          {' '}
                          · Taxable{' '}
                          <b className="font-mono">{money(sec.totals.taxableValue)}</b>
                        </>
                      )}
                      {sec.totals?.totalTax !== undefined && sec.totals.totalTax !== 0 && (
                        <>
                          {' '}
                          · Tax <b className="font-mono">{money(sec.totals.totalTax)}</b>
                        </>
                      )}
                    </div>
                  </div>
                )
              }
              if (key === '8_NilExempt') {
                const s = sec as NilExemptSection
                if (!s.nil && !s.exempt && !s.nonGst) return null
                return (
                  <div key={key} className="border rounded p-2">
                    <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      8 · Nil / Exempt / Non-GST
                    </div>
                    <div className="text-xs">
                      Nil <b className="font-mono">{money(s.nil)}</b> · Exempt{' '}
                      <b className="font-mono">{money(s.exempt)}</b> · Non-GST{' '}
                      <b className="font-mono">{money(s.nonGst)}</b>
                    </div>
                  </div>
                )
              }
              if (key === '13_Documents') {
                const s = sec as DocumentsSection
                if (!s.invoices?.total) return null
                return (
                  <div key={key} className="border rounded p-2">
                    <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      13 · Documents Issued
                    </div>
                    <div className="text-xs">
                      Invoices <b>{s.invoices.total}</b>
                      {s.invoices.from && (
                        <>
                          {' '}
                          ({s.invoices.from} – {s.invoices.to})
                        </>
                      )}
                      {!!s.invoices.cancelled && (
                        <>
                          {' '}
                          · Cancelled <b>{s.invoices.cancelled}</b>
                        </>
                      )}
                    </div>
                  </div>
                )
              }
              return null
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Cell({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded border p-2 ${highlight ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-900' : ''}`}
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono font-bold">{value}</div>
    </div>
  )
}
