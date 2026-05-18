'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Scale, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface TBRow {
  accountId: string
  accountName: string
  groupName: string
  nature: string
  openingBalance: number
  debits: number
  credits: number
  closingBalance: number
}
interface TBResp {
  rows: TBRow[]
  totalDebits: number
  totalCredits: number
  balanced: boolean
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CaTrialBalancePage() {
  const [data, setData] = useState<TBResp | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setData(await api.get<TBResp>('/accounting/trial-balance'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="w-6 h-6 text-blue-600" /> Trial Balance
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Σ Dr must equal Σ Cr. If not, the books have an unbalanced voucher
            somewhere — investigate via Day Book before relying on the P&L.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Reload'}
        </Button>
      </div>

      {data && (
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-4 text-sm">
            <div>Total Debits: <b className="font-mono">{money(data.totalDebits)}</b></div>
            <div>Total Credits: <b className="font-mono">{money(data.totalCredits)}</b></div>
            <Badge variant={data.balanced ? 'secondary' : 'destructive'} className="ml-auto">
              {data.balanced ? 'Books are balanced ✓' : 'OUT OF BALANCE'}
            </Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Debits</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows || []).map((r) => (
                <TableRow key={r.accountId}>
                  <TableCell className="font-medium">{r.accountName}</TableCell>
                  <TableCell className="text-xs">{r.groupName}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.openingBalance)}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.debits)}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.credits)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(r.closingBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
