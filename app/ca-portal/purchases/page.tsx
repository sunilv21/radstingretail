'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileBarChart } from 'lucide-react'
import { api } from '@/lib/api'

interface PoLite {
  _id: string
  poNumber: string
  createdAt: string
  status: string
  paymentStatus: string
  grandTotal: number
  totalTax: number
  supplierSnapshot?: { name: string; gstNumber?: string; stateCode?: string }
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CaPurchaseRegister() {
  const [rows, setRows] = useState<PoLite[]>([])
  useEffect(() => {
    api.get<PoLite[]>('/purchases?limit=500').then(setRows).catch(() => {})
  }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileBarChart className="w-6 h-6 text-blue-600" /> Purchase Register
      </h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p._id}>
                  <TableCell className="font-mono">{p.poNumber}</TableCell>
                  <TableCell className="text-xs">{new Date(p.createdAt).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{p.supplierSnapshot?.name}</TableCell>
                  <TableCell className="text-xs font-mono">{p.supplierSnapshot?.gstNumber || '—'}</TableCell>
                  <TableCell className="text-xs">{p.supplierSnapshot?.stateCode || '—'}</TableCell>
                  <TableCell className="text-right font-mono">{money(p.totalTax || 0)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(p.grandTotal)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{p.status}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{p.paymentStatus}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
