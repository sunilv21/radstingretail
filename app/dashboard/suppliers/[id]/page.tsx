'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Truck,
  ChevronLeft,
  Phone,
  Mail,
  MapPin,
  RefreshCcw,
  BookText,
  Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface Supplier {
  _id: string
  name: string
  phone?: string
  email?: string
  gstNumber?: string
  stateCode?: string
  address?: string
  outstandingBalance?: number
}
interface LedgerEntry {
  _id: string
  createdAt: string
  entryType: 'debit' | 'credit'
  amount: number
  referenceType?: string
  narration?: string
  runningBalance: number
}
interface LedgerResp {
  supplier: Supplier
  entries: LedgerEntry[]
  currentBalance: number
}
interface PurchaseRow {
  _id: string
  poNumber: string
  status: string
  grandTotal: number
  amountPaid?: number
  paymentStatus?: string
  createdAt: string
}

const money = (n: number | undefined) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-700',
  ordered: 'bg-blue-50 text-blue-700',
  partial: 'bg-amber-50 text-amber-700',
  received: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-violet-50 text-violet-700',
  cancelled: 'bg-rose-50 text-rose-700',
}

export default function SupplierDetailPage() {
  const params = useParams()
  const id = String(params?.id || '')

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [ledger, setLedger] = useState<LedgerResp | null>(null)
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [led, pur] = await Promise.all([
        api.get<LedgerResp>(`/suppliers/${id}/ledger`),
        api.get<{ data: PurchaseRow[] }>(`/purchases?supplierId=${id}&limit=100`),
      ])
      setLedger(led)
      setSupplier(led.supplier)
      setPurchases(Array.isArray(pur?.data) ? pur.data : [])
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code} · ${err.message}` : 'Could not load supplier')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const purchaseTotals = useMemo(() => {
    const active = purchases.filter((p) => p.status !== 'cancelled')
    const totalValue = active.reduce((s, p) => s + (p.grandTotal || 0), 0)
    const totalPaid = active.reduce((s, p) => s + (p.amountPaid || 0), 0)
    return { count: active.length, totalValue, totalPaid }
  }, [purchases])

  if (loading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border bg-muted/40 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-xl border bg-muted/40 animate-pulse" />
      </div>
    )
  }

  if (error || !supplier) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="border-rose-300 bg-rose-50 dark:bg-rose-950/20">
          <CardContent className="p-6 text-sm text-rose-800 dark:text-rose-300">
            {error || 'Supplier not found.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BackLink />
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xl shrink-0">
              {supplier.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                {supplier.name}
              </h1>
              <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {supplier.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> {supplier.phone}
                  </span>
                )}
                {supplier.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> {supplier.email}
                  </span>
                )}
                {supplier.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> {supplier.address}
                  </span>
                )}
              </div>
              {supplier.gstNumber && (
                <div className="mt-2 text-xs">
                  <span className="text-muted-foreground">GSTIN </span>
                  <span className="font-mono font-medium">{supplier.gstNumber}</span>
                  {supplier.stateCode && (
                    <span className="text-muted-foreground"> · State {supplier.stateCode}</span>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Outstanding payable
              </div>
              <div
                className={`text-2xl font-bold font-mono ${(ledger?.currentBalance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
              >
                {money(ledger?.currentBalance ?? supplier.outstandingBalance)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Active POs" value={String(purchaseTotals.count)} />
        <StatTile label="Total purchased" value={money(purchaseTotals.totalValue)} />
        <StatTile label="Total paid" value={money(purchaseTotals.totalPaid)} tone="emerald" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger" className="gap-1.5">
            <BookText className="w-4 h-4" /> Ledger
          </TabsTrigger>
          <TabsTrigger value="purchases" className="gap-1.5">
            <Package className="w-4 h-4" /> Purchase history
          </TabsTrigger>
        </TabsList>

        {/* Ledger */}
        <TabsContent value="ledger" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {!ledger || ledger.entries.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No ledger entries yet. GRNs and payments for this supplier appear here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Narration</th>
                        <th className="px-4 py-2.5 text-right">Debit</th>
                        <th className="px-4 py-2.5 text-right">Credit</th>
                        <th className="px-4 py-2.5 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.entries.map((e) => (
                        <tr key={e._id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                          <td className="px-4 py-2.5">
                            <div>{e.narration || '—'}</div>
                            {e.referenceType && (
                              <Badge variant="secondary" className="mt-0.5 text-[10px]">
                                {e.referenceType}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-rose-600">
                            {e.entryType === 'debit' ? money(e.amount) : ''}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600">
                            {e.entryType === 'credit' ? money(e.amount) : ''}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold">
                            {money(e.runningBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40 font-semibold">
                        <td colSpan={4} className="px-4 py-2.5 text-right">
                          Closing balance
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {money(ledger.currentBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase history */}
        <TabsContent value="purchases" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {purchases.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No purchase orders for this supplier yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">PO number</th>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Payment</th>
                        <th className="px-4 py-2.5 text-right">Value</th>
                        <th className="px-4 py-2.5 text-right">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p) => (
                        <tr key={p._id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/dashboard/purchases?po=${p._id}`}
                              className="font-mono font-medium text-blue-600 hover:underline"
                            >
                              {p.poNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_TONE[p.status] || 'bg-stone-100 text-stone-700'}`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {p.paymentStatus || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{money(p.grandTotal)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600">
                            {money(p.amountPaid)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/dashboard/suppliers"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="w-4 h-4" /> All suppliers
    </Link>
  )
}

function StatTile({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: string
  tone?: 'slate' | 'emerald'
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </div>
        <div className={`text-xl font-bold font-mono mt-1 ${tone === 'emerald' ? 'text-emerald-600' : ''}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}
