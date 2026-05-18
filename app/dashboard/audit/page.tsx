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
import { ScrollText, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'

interface AuditRow {
  _id: string
  userEmail: string
  userRole: string
  method: string
  path: string
  resource: string
  action: string
  statusCode: number
  payload?: unknown
  ip?: string
  durationMs?: number
  createdAt: string
}

const actionTone: Record<string, 'secondary' | 'destructive' | 'outline'> = {
  read: 'outline',
  create: 'secondary',
  update: 'secondary',
  delete: 'destructive',
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [resource, setResource] = useState<string>('')
  const [action, setAction] = useState<string>('')

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (resource) params.set('resource', resource)
      if (action) params.set('action', action)
      setRows(await api.get<AuditRow[]>(`/audit?${params.toString()}`))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [resource, action])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-blue-600" />
            Audit log
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Append-only record of every write and every CA-portal read in your
            organisation. Use this to investigate "who voided that sale?" or "what did
            our CA pull last week?"
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 text-sm">
          <select
            value={resource}
            onChange={(e) => setResource(e.target.value)}
            className="h-8 border rounded px-2 bg-background text-xs"
          >
            <option value="">All resources</option>
            {['sales', 'products', 'inventory', 'purchases', 'customers', 'suppliers', 'accounting', 'gst', 'reports', 'payroll', 'store', 'transfers', 'users', 'audit', 'auth'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-8 border rounded px-2 bg-background text-xs"
          >
            <option value="">All actions</option>
            {['create', 'update', 'delete', 'read'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">{loading ? 'Loading…' : 'No audit entries.'}</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-xs font-mono truncate max-w-48">{r.userEmail}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.userRole}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{r.resource}</Badge></TableCell>
                  <TableCell><Badge variant={actionTone[r.action] || 'outline'} className="text-[10px]">{r.action}</Badge></TableCell>
                  <TableCell className="text-xs font-mono truncate max-w-md" title={r.path}>{r.method} {r.path}</TableCell>
                  <TableCell><Badge variant={r.statusCode >= 400 ? 'destructive' : 'outline'}>{r.statusCode}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
