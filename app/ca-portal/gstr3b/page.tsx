'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Receipt, AlertCircle, FileText } from 'lucide-react'
import { api, ApiError } from '@/lib/api'

// ─────────────────────────────────────────────────────────────────────
// Real GSTR-3B response shape (from server/services/gst.service.js).
// Six portal sections — 3.1, 3.2, 4, 5, 5.1, 6.1.
// ─────────────────────────────────────────────────────────────────────

interface TaxBreak {
  taxableValue?: number
  cgst?: number
  sgst?: number
  igst?: number
}

interface Gstr3bResp {
  period: string
  gstin?: string
  sections: {
    '3.1_OutwardSupplies'?: {
      taxableSupplies?: TaxBreak
      zeroRated?: { taxableValue?: number; igst?: number }
      nilRated?: { taxableValue?: number }
      exempt?: { taxableValue?: number }
      nonGst?: { taxableValue?: number }
      inwardReverseCharge?: TaxBreak
    }
    '3.2_InterStateUnregistered'?: {
      totalTaxableValueToUnregistered?: number
    }
    '4_ITC'?: {
      eligible?: { cgst?: number; sgst?: number; igst?: number; total?: number }
      reverseCharge?: { cgst?: number; sgst?: number; igst?: number; total?: number }
      ineligible?: { cgst?: number; sgst?: number; igst?: number }
      netITC?: number
    }
    '5_InwardSupplies'?: { fromComposition?: number; nilRated?: number; nonGst?: number }
    '5.1_InterestLateFee'?: { interest?: number; lateFee?: number }
    '6.1_PaymentOfTax'?: {
      outputTax?: number
      itcUtilised?: number
      netPayable?: number
    }
  }
}

const money = (n: number | undefined) =>
  '₹' +
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export default function CaGstr3b() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Gstr3bResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.get<Gstr3bResp>(`/gst/gstr3b/${period}`))
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.code || 'ERROR'} · ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Could not load GSTR-3B for this period'
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

  const outward = data?.sections?.['3.1_OutwardSupplies']?.taxableSupplies
  const itc = data?.sections?.['4_ITC']?.eligible
  const rcmItc = data?.sections?.['4_ITC']?.reverseCharge
  const payment = data?.sections?.['6.1_PaymentOfTax']
  const interStateUnreg =
    data?.sections?.['3.2_InterStateUnregistered']?.totalTaxableValueToUnregistered
  const rcmOutward = data?.sections?.['3.1_OutwardSupplies']?.inwardReverseCharge

  const hasAnyData =
    !!data &&
    ((outward?.taxableValue || 0) > 0 ||
      (itc?.total || 0) > 0 ||
      (payment?.outputTax || 0) > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-blue-600" /> GSTR-3B
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
        </div>
      </div>

      {/* Loading shimmer */}
      {loading && !data && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded border bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <Card className="border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-rose-900 dark:text-rose-200">
                Could not load GSTR-3B
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
                ) : (
                  <>
                    If this keeps happening, ask the tenant admin to check the server
                    logs.
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {data && !error && !hasAnyData && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <div className="font-semibold text-sm text-foreground">
              No GSTR-3B activity for {period}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              No sales, purchases or ITC entries on the active branch in the selected
              month. Try a different month or switch branch from the sidebar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Three-column summary */}
      {data && !error && hasAnyData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-3 space-y-1 text-sm">
                <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  3.1 · Outward Supplies
                </div>
                <Row label="Taxable" v={outward?.taxableValue} />
                <Row label="CGST" v={outward?.cgst} />
                <Row label="SGST" v={outward?.sgst} />
                <Row label="IGST" v={outward?.igst} />
                <Row
                  label="Total Tax"
                  v={(outward?.cgst || 0) + (outward?.sgst || 0) + (outward?.igst || 0)}
                  bold
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 space-y-1 text-sm">
                <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  4 · ITC Available
                </div>
                <Row label="CGST" v={itc?.cgst} />
                <Row label="SGST" v={itc?.sgst} />
                <Row label="IGST" v={itc?.igst} />
                <Row label="Total ITC" v={itc?.total} bold />
                {!!rcmItc?.total && (
                  <Row label="(incl. RCM)" v={rcmItc.total} muted />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 space-y-1 text-sm">
                <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  6.1 · Net Payable
                </div>
                <Row label="Output tax" v={payment?.outputTax} />
                <Row label="ITC utilised" v={payment?.itcUtilised} />
                <Row label="Net payable" v={payment?.netPayable} bold accent />
              </CardContent>
            </Card>
          </div>

          {/* Extras */}
          {(!!interStateUnreg || !!rcmOutward?.taxableValue) && (
            <Card>
              <CardContent className="p-3 text-sm space-y-1">
                <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Other portal lines
                </div>
                {!!interStateUnreg && (
                  <Row
                    label="3.2 · Inter-state supplies to unregistered (taxable value)"
                    v={interStateUnreg}
                  />
                )}
                {!!rcmOutward?.taxableValue && (
                  <Row
                    label="3.1(d) · Inward supplies liable to reverse charge"
                    v={rcmOutward.taxableValue}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Row({
  label,
  v,
  bold,
  accent,
  muted,
}: {
  label: string
  v?: number
  bold?: boolean
  accent?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={`flex justify-between ${bold ? 'font-semibold' : ''} ${accent ? 'text-blue-700' : ''} ${muted ? 'text-muted-foreground text-xs' : ''}`}
    >
      <span>{label}</span>
      <span className="font-mono">{money(v)}</span>
    </div>
  )
}
