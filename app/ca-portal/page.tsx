'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CalendarRange, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface DayBookRow {
  _id: string
  createdAt: string
  entryType: 'debit' | 'credit'
  accountType: string
  amount: number
  referenceType: string
  narration: string
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CaDayBookPage() {
  const [rows, setRows] = useState<DayBookRow[]>([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      setRows(await api.get<DayBookRow[]>(`/accounting/day-book?${params.toString()}`))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [from, to])

  const totals = rows.reduce(
    (acc, r) => {
      if (r.entryType === 'debit') acc.dr += r.amount
      else acc.cr += r.amount
      return acc
    },
    { dr: 0, cr: 0 },
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarRange className="w-6 h-6 text-blue-600" /> Day Book
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Chronological ledger stream. Use this as your starting point — drill into
          specific account ledgers from Trial Balance.
        </p>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 border rounded px-2 bg-background text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 border rounded px-2 bg-background text-sm" />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Reload'}
          </Button>
          <div className="ml-auto text-sm flex gap-3">
            <div>Σ Dr: <b className="font-mono">{money(totals.dr)}</b></div>
            <div>Σ Cr: <b className="font-mono">{money(totals.cr)}</b></div>
            <div>Δ: <b className={`font-mono ${Math.abs(totals.dr - totals.cr) > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(Math.abs(totals.dr - totals.cr))}</b></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">{loading ? 'Loading…' : 'No entries in this period.'}</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString('en-IN')}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.entryType}</Badge></TableCell>
                  <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{r.accountType}</Badge></TableCell>
                  <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{r.referenceType}</Badge></TableCell>
                  <TableCell className="text-xs max-w-md truncate" title={r.narration}>{r.narration}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.entryType === 'debit' ? money(r.amount) : ''}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.entryType === 'credit' ? money(r.amount) : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
