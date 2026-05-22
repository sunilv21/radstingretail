'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Truck,
  Plus,
  Search,
  RefreshCcw,
  Phone,
  ChevronRight,
  Pencil,
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
  /** Per-supplier rollup added by GET /suppliers (see supplier.routes.js). */
  poCount?: number
  purchasedValue?: number
  paidValue?: number
}

const money = (n: number | undefined) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setSuppliers(await api.get<Supplier[]>('/suppliers'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.gstNumber || '').toLowerCase().includes(q),
    )
  }, [search, suppliers])

  const rollup = useMemo(() => {
    // Aggregate across the whole supplier base. Outstanding can go negative
    // when a supplier holds an advance — we sum the signed values so the
    // headline reflects the net position (positive = we owe, negative = they
    // owe us).
    let purchased = 0;
    let paid = 0;
    let outstanding = 0;
    let withDues = 0;
    for (const s of suppliers) {
      purchased += s.purchasedValue || 0;
      paid += s.paidValue || 0;
      outstanding += s.outstandingBalance || 0;
      if ((s.outstandingBalance || 0) > 0) withDues += 1;
    }
    return { purchased, paid, outstanding, withDues };
  }, [suppliers])

  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (s: Supplier) => {
    setEditing(s)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-600" />
            Suppliers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every vendor you buy from — contact details, GST, outstanding payable, ledger
            and purchase history.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1" /> Add supplier
          </Button>
        </div>
      </div>

      {/* Summary tiles — Purchased | Paid | Outstanding | With dues so the
          three accounting figures the owner asks for are side-by-side.
          Outstanding goes negative when the net position is in credit (we
          paid more than we received) — shown in emerald with "Credit"
          label so it doesn't read as a phantom debt. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Purchased
            </div>
            <div className="text-2xl font-bold mt-1 font-mono">{money(rollup.purchased)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {suppliers.reduce((s, x) => s + (x.poCount || 0), 0)} PO{suppliers.reduce((s, x) => s + (x.poCount || 0), 0) === 1 ? '' : 's'} across {suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Paid
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-600 font-mono">{money(rollup.paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              {rollup.outstanding < 0 ? 'Net credit' : 'Outstanding'}
            </div>
            <div
              className={`text-2xl font-bold mt-1 font-mono ${
                rollup.outstanding > 0
                  ? 'text-rose-600'
                  : rollup.outstanding < 0
                    ? 'text-emerald-600'
                    : ''
              }`}
            >
              {money(Math.abs(rollup.outstanding))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              With dues
            </div>
            <div className="text-2xl font-bold mt-1">
              {rollup.withDues}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or GSTIN…"
          className="pl-9"
        />
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading && suppliers.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {suppliers.length === 0
                ? 'No suppliers yet. Add your first vendor to start tracking purchases and payables.'
                : `No suppliers match "${search}".`}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((s) => (
                <div
                  key={s._id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <Link
                    href={`/dashboard/suppliers/${s._id}`}
                    className="flex-1 min-w-0 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center justify-center font-semibold text-sm shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                        {s.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {s.phone}
                          </span>
                        )}
                        {s.gstNumber && (
                          <span className="font-mono">{s.gstNumber}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                  {/* Per-supplier rollup. Hidden on narrow screens to keep
                      the row legible — the per-supplier detail page has the
                      same breakdown for small-screen users. */}
                  <div className="hidden md:grid grid-cols-3 gap-4 shrink-0 text-right text-xs">
                    <RollupCell
                      label="POs"
                      value={String(s.poCount ?? 0)}
                      sub={s.poCount ? `${money(s.purchasedValue)} ordered` : '—'}
                    />
                    <RollupCell
                      label="Paid"
                      value={money(s.paidValue)}
                      tone="emerald"
                    />
                    <RollupCell
                      label={(s.outstandingBalance || 0) < 0 ? 'Credit' : 'Outstanding'}
                      value={money(Math.abs(s.outstandingBalance || 0))}
                      tone={
                        (s.outstandingBalance || 0) > 0
                          ? 'rose'
                          : (s.outstandingBalance || 0) < 0
                            ? 'emerald'
                            : 'muted'
                      }
                      bold
                    />
                  </div>
                  {/* Mobile-only outstanding chip — keeps a meaningful number
                      visible on narrow screens where the 3-column rollup is
                      hidden. */}
                  <div className="md:hidden text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {(s.outstandingBalance || 0) < 0 ? 'Credit' : 'Outstanding'}
                    </div>
                    <div
                      className={`font-mono font-semibold text-sm ${
                        (s.outstandingBalance || 0) > 0
                          ? 'text-rose-600'
                          : (s.outstandingBalance || 0) < 0
                            ? 'text-emerald-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {money(Math.abs(s.outstandingBalance || 0))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(s)}
                    title="Edit supplier"
                    className="shrink-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Link href={`/dashboard/suppliers/${s._id}`}>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <SupplierDialog
          supplier={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function SupplierDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!supplier
  const [form, setForm] = useState({
    name: supplier?.name || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    gstNumber: supplier?.gstNumber || '',
    stateCode: supplier?.stateCode || '',
    address: supplier?.address || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await api.put(`/suppliers/${supplier!._id}`, form)
        toast.success('Supplier updated')
      } else {
        await api.post('/suppliers', form)
        toast.success('Supplier added')
      }
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not save supplier')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this vendor’s contact and GST details.'
              : 'Create a new vendor you purchase from.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ABC Distributors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^0-9+\-\s]/g, '') })}
                placeholder="9876543210"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="vendor@example.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">GSTIN</Label>
              <Input
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                placeholder="27AAAAA0000A1Z5"
                maxLength={15}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">State code</Label>
              <Input
                value={form.stateCode}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder="27"
                maxLength={2}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Street, city, pincode"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Tiny stacked label/value cell used in the per-supplier rollup row. */
function RollupCell({
  label,
  value,
  sub,
  tone = 'muted',
  bold,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'muted' | 'rose' | 'emerald'
  bold?: boolean
}) {
  const valueColor =
    tone === 'rose'
      ? 'text-rose-600'
      : tone === 'emerald'
        ? 'text-emerald-600'
        : 'text-foreground'
  return (
    <div className="min-w-16">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono ${bold ? 'font-semibold text-sm' : 'text-xs'} ${valueColor}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  )
}
