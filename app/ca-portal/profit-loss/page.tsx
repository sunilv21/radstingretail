'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TrendingUp, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface PnLLine { accountId: string; name: string; amount: number }
interface PnLResp {
  income: PnLLine[]
  expense: PnLLine[]
  totalIncome: number
  totalExpense: number
  netProfit: number
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CaPnLPage() {
  const [data, setData] = useState<PnLResp | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    try {
      setData(await api.get<PnLResp>('/accounting/profit-loss'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" /> Profit &amp; Loss
          </h1>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Reload'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-0">
            <div className="px-3 py-2 border-b font-semibold text-sm">Income</div>
            <Table>
              <TableBody>
                {(data?.income || []).map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-emerald-50 dark:bg-emerald-950/20">
                  <TableCell className="font-semibold">Total Income</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(data?.totalIncome || 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="px-3 py-2 border-b font-semibold text-sm">Expense</div>
            <Table>
              <TableBody>
                {(data?.expense || []).map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-rose-50 dark:bg-rose-950/20">
                  <TableCell className="font-semibold">Total Expense</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(data?.totalExpense || 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3 flex justify-between items-center">
          <span className="font-semibold">Net Profit</span>
          <span className={`font-mono font-bold text-lg ${(data?.netProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {money(data?.netProfit || 0)}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
