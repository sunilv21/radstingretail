'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, Plus, RefreshCcw, Warehouse } from 'lucide-react'
import PlanUsageBadge from '@/components/PlanUsageBadge'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { can, getCurrentUser } from '@/lib/rbac'
import type { AuthUser } from '@/lib/types'

interface Branch {
  _id: string
  name: string
  /** 'store' = retail POS location (has its own invoice counter,
   *  bills customers directly). 'warehouse' = bulk stock holding,
   *  no POS, fed by GRNs and inter-store transfers. */
  type?: 'store' | 'warehouse'
  code?: string
  gstNumber?: string
  gstRegistered?: boolean
  stateCode?: string
  phone?: string
  email?: string
  invoicePrefix?: string
  isActive?: boolean
  address?: { line1?: string; city?: string; state?: string; pincode?: string }
}

export default function BranchesPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [rows, setRows] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  // Filter the list by location kind. Warehouses sit on the same /stores
  // collection — they differ only in `type` and how the plan-limit counters
  // bucket them.
  const [typeFilter, setTypeFilter] = useState<'all' | 'store' | 'warehouse'>('all')

  useEffect(() => setUser(getCurrentUser()), [])

  const load = async () => {
    setLoading(true)
    try {
      setRows(await api.get<Branch[]>('/stores'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const canCreate = can(user, 'store', 'create')

  // Group registered branches above unregistered ones, alphabetised within
  // each group. Treat undefined gstRegistered as registered (legacy default).
  const sortedRows = [...rows]
    .filter((r) => {
      if (typeFilter === 'all') return true
      const t = r.type || 'store'
      return t === typeFilter
    })
    .sort((a, b) => {
      const ra = a.gstRegistered === false ? 1 : 0
      const rb = b.gstRegistered === false ? 1 : 0
      if (ra !== rb) return ra - rb
      return (a.name || '').localeCompare(b.name || '')
    })
  const registeredCount = rows.filter((r) => r.gstRegistered !== false).length
  const unregisteredCount = rows.length - registeredCount
  const storeCount = rows.filter((r) => (r.type || 'store') === 'store').length
  const warehouseCount = rows.filter((r) => r.type === 'warehouse').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
            <Building2 className="w-6 h-6 text-blue-600" />
            Branches
            <PlanUsageBadge resource="stores" />
            <PlanUsageBadge resource="warehouses" />
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every physical location — retail stores and warehouses — that holds stock
            for this organisation. Stores bill customers and carry their own invoice
            counter; warehouses just hold stock and are fed by GRNs or inter-branch
            transfers. Both roll up into the same books.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Refresh'}
          </Button>
          {canCreate && (
            <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-1" /> New branch
            </Button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{registeredCount}</span> registered
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-foreground">{unregisteredCount}</span> unregistered
            </span>
          </div>
          {/* Type filter pills — narrow the table to stores or warehouses
              only. Counts stay live so users can see how their locations
              are split without applying a filter. */}
          <div className="flex items-center gap-1 flex-wrap text-[11px]">
            {(
              [
                { key: 'all', label: 'All', tone: 'bg-slate-600', count: rows.length },
                { key: 'store', label: 'Stores', tone: 'bg-blue-600', count: storeCount },
                { key: 'warehouse', label: 'Warehouses', tone: 'bg-violet-600', count: warehouseCount },
              ] as const
            ).map((p) => {
              const active = typeFilter === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setTypeFilter(p.key)}
                  className={`px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                    active
                      ? `${p.tone} text-white border-transparent`
                      : 'bg-card hover:bg-muted text-muted-foreground border-border'
                  }`}
                >
                  <span>{p.label}</span>
                  <span
                    className={`text-[10px] px-1.5 rounded-full ${
                      active ? 'bg-white/25' : 'bg-muted-foreground/15'
                    }`}
                  >
                    {p.count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic">
                    {loading
                      ? 'Loading…'
                      : typeFilter === 'warehouse'
                        ? 'No warehouses yet. Click “New branch” and pick Warehouse to add one.'
                        : typeFilter === 'store'
                          ? 'No stores yet. Click “New branch” to add one.'
                          : 'No branches yet. Click “New branch” to add one.'}
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((b) => {
                  const registered = b.gstRegistered !== false
                  const isWarehouse = b.type === 'warehouse'
                  return (
                    <TableRow key={b._id}>
                      <TableCell className="font-mono">{b.code || '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            isWarehouse
                              ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                          }
                        >
                          {isWarehouse ? (
                            <Warehouse className="w-3 h-3 mr-1" />
                          ) : (
                            <Building2 className="w-3 h-3 mr-1" />
                          )}
                          {isWarehouse ? 'Warehouse' : 'Store'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={registered ? 'secondary' : 'outline'}
                          className={
                            registered
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                          }
                        >
                          {registered ? 'Registered' : 'Unregistered'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.gstNumber || '—'}</TableCell>
                      <TableCell>{b.stateCode || '—'}</TableCell>
                      <TableCell>{b.phone || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={b.isActive === false ? 'destructive' : 'secondary'}>
                          {b.isActive === false ? 'Inactive' : 'Active'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {open && (
        <NewBranchDialog
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function NewBranchDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<{
    name: string
    type: 'store' | 'warehouse'
    code: string
    gstRegistered: boolean
    gstNumber: string
    stateCode: string
    phone: string
    email: string
    invoicePrefix: string
    address: { line1: string; city: string; state: string; pincode: string }
  }>({
    name: '',
    type: 'store',
    code: '',
    gstRegistered: true,
    gstNumber: '',
    stateCode: '07',
    phone: '',
    email: '',
    invoicePrefix: 'INV',
    address: { line1: '', city: '', state: '', pincode: '' },
  })
  const [submitting, setSubmitting] = useState(false)
  const isWarehouse = form.type === 'warehouse'

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Branch name is required')
      return
    }
    if (form.gstRegistered && !form.gstNumber.trim()) {
      toast.error('GSTIN is required for registered branches')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<{ store: Branch; token?: string; user?: AuthUser }>(
        '/stores',
        form,
      )
      // Server now returns a fresh JWT that includes the newly-created branch
      // in storeIds, so the StoreSwitcher in the sidebar picks it up without
      // requiring a re-login.
      if (res?.token && res?.user) {
        window.localStorage.setItem('token', res.token)
        window.localStorage.setItem('user', JSON.stringify(res.user))
      }
      toast.success(`${form.type === 'warehouse' ? 'Warehouse' : 'Branch'} "${form.name}" created`)
      onCreated()
      // Full reload so the sidebar's StoreSwitcher remounts and reads the
      // updated user/token from localStorage — same pattern the switcher
      // itself uses after a switch.
      if (res?.token) window.location.reload()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not create branch')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a branch</DialogTitle>
          <DialogDescription>
            Pick the location kind first. <strong>Stores</strong> bill customers and
            carry their own invoice counter; <strong>warehouses</strong> just hold
            stock and are fed by GRNs or inter-branch transfers. Both count
            against their own plan cap.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Location-kind toggle — drives both the UI hints below and the
              backend's plan-limit bucket. Locked once the branch is
              created (PUT /stores/:id doesn't accept a `type` change). */}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Location kind</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, type: 'store' })}
                className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  !isWarehouse
                    ? 'bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-200'
                    : 'bg-background border-input text-muted-foreground hover:bg-accent'
                }`}
              >
                <Building2 className="w-4 h-4" /> Store
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, type: 'warehouse', invoicePrefix: '' })
                }
                className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  isWarehouse
                    ? 'bg-violet-100 border-violet-400 text-violet-900 dark:bg-violet-950/40 dark:border-violet-700 dark:text-violet-200'
                    : 'bg-background border-input text-muted-foreground hover:bg-accent'
                }`}
              >
                <Warehouse className="w-4 h-4" /> Warehouse
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isWarehouse
                ? 'Warehouse — bulk stock holding only. No POS, no customer invoices. Receives stock via GRN and inter-branch transfers.'
                : 'Store — retail POS location with its own invoice counter and customer billing.'}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{isWarehouse ? 'Warehouse name *' : 'Branch name *'}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={
                isWarehouse ? 'Central Warehouse — Bhiwandi' : 'HQ — Connaught Place'
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="DEL-002" maxLength={16} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">GST registration</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, gstRegistered: true })}
                className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                  form.gstRegistered
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200'
                    : 'bg-background border-input text-muted-foreground hover:bg-accent'
                }`}
              >
                Registered
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, gstRegistered: false, gstNumber: '' })}
                className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                  !form.gstRegistered
                    ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200'
                    : 'bg-background border-input text-muted-foreground hover:bg-accent'
                }`}
              >
                Unregistered
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {form.gstRegistered
                ? 'Branch has a GSTIN — invoices will charge GST and feed into GSTR filings.'
                : 'Branch has no GSTIN — sales are issued as bills of supply, no tax components.'}
            </p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">
              GSTIN {form.gstRegistered ? '*' : '(disabled — branch is unregistered)'}
            </Label>
            <Input
              value={form.gstNumber}
              onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
              maxLength={15}
              disabled={!form.gstRegistered}
              placeholder={form.gstRegistered ? '07AABCU9603R1Z2' : ''}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">State code (2-digit)</Label>
            <Input value={form.stateCode} onChange={(e) => setForm({ ...form, stateCode: e.target.value.replace(/\D/g, '').slice(0, 2) })} maxLength={2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {!isWarehouse && (
            <div className="space-y-1">
              <Label className="text-xs">Invoice prefix</Label>
              <Input value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })} placeholder="INV" />
            </div>
          )}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Address line 1</Label>
            <Input value={form.address.line1} onChange={(e) => setForm({ ...form, address: { ...form.address, line1: e.target.value } })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">City</Label>
            <Input value={form.address.city} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">State</Label>
            <Input value={form.address.state} onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value } })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pincode</Label>
            <Input value={form.address.pincode} onChange={(e) => setForm({ ...form, address: { ...form.address, pincode: e.target.value } })} maxLength={6} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            {submitting ? 'Creating…' : 'Create branch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
