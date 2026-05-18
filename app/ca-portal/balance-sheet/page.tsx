'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { BookOpen, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface Line { accountId: string; name: string; amount: number }
interface BSResp {
  assets: Line[]
  liabilities: Line[]
  retainedEarnings: number
  totalAssets: number
  totalLiabilities: number
  totalEquityAndLiab: number
  balanced: boolean
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CaBalanceSheetPage() {
  const [data, setData] = useState<BSResp | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    try {
      setData(await api.get<BSResp>('/accounting/balance-sheet'))
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
            <BookOpen className="w-6 h-6 text-blue-600" /> Balance Sheet
          </h1>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Reload'}
        </Button>
      </div>

      {data && (
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-3 items-center text-sm">
            <span>Total Assets: <b className="font-mono">{money(data.totalAssets)}</b></span>
            <span>Total Liab + Equity: <b className="font-mono">{money(data.totalEquityAndLiab)}</b></span>
            <Badge variant={data.balanced ? 'secondary' : 'destructive'} className="ml-auto">
              {data.balanced ? 'Balanced ✓' : 'Out of balance'}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-0">
            <div className="px-3 py-2 border-b font-semibold">Assets</div>
            <Table>
              <TableBody>
                {(data?.assets || []).map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                  <TableCell className="font-semibold">Total Assets</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(data?.totalAssets || 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="px-3 py-2 border-b font-semibold">Liabilities &amp; Equity</div>
            <Table>
              <TableBody>
                {(data?.liabilities || []).map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>Retained Earnings (P&amp;L net)</TableCell>
                  <TableCell className="text-right font-mono">{money(data?.retainedEarnings || 0)}</TableCell>
                </TableRow>
                <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                  <TableCell className="font-semibold">Total Liab + Equity</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(data?.totalEquityAndLiab || 0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
