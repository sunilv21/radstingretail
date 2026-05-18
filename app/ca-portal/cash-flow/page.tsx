'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Banknote } from 'lucide-react'
import { api } from '@/lib/api'

interface Bucket { label: string; amount: number }
interface CFResp { buckets: Bucket[]; netCashFlow: number }

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CaCashFlow() {
  const [data, setData] = useState<CFResp | null>(null)
  useEffect(() => {
    api.get<CFResp>('/accounting/cash-flow').then(setData).catch(() => {})
  }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="w-6 h-6 text-blue-600" /> Cash Flow</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {(data?.buckets || []).map((b) => (
                <TableRow key={b.label}>
                  <TableCell>{b.label}</TableCell>
                  <TableCell className={`text-right font-mono ${b.amount < 0 ? 'text-rose-600' : ''}`}>{money(b.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted">
                <TableCell className="font-semibold">Net cash flow</TableCell>
                <TableCell className={`text-right font-mono font-semibold ${(data?.netCashFlow ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(data?.netCashFlow || 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
