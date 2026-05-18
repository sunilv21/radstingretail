'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileBarChart } from 'lucide-react'
import { api } from '@/lib/api'
import type { Sale } from '@/lib/types'

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CaSalesRegister() {
  const [rows, setRows] = useState<Sale[]>([])
  useEffect(() => {
    api.get<Sale[]>('/sales?limit=500').then(setRows).catch(() => {})
  }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileBarChart className="w-6 h-6 text-blue-600" /> Sales Register
      </h1>
      <p className="text-xs text-muted-foreground">Customer phone / email / address are redacted.</p>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s._id}>
                  <TableCell className="font-mono">{s.invoiceNumber}</TableCell>
                  <TableCell className="text-xs">{new Date(s.createdAt).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{s.customerSnapshot?.name || 'Walk-in'}</TableCell>
                  <TableCell className="text-xs font-mono">{s.customerSnapshot?.gstNumber || '—'}</TableCell>
                  <TableCell className="text-xs">{s.customerSnapshot?.stateCode || '—'}</TableCell>
                  <TableCell className="text-right font-mono">{money(s.subtotal)}</TableCell>
                  <TableCell className="text-right font-mono">{money(s.totalTax)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(s.grandTotal)}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'returned' ? 'destructive' : 'outline'} className="text-[10px] uppercase">
                      {s.status || 'completed'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
