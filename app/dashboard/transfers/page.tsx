'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeftRight, Plus, RefreshCcw, Send, CheckCheck, X, Trash2, Warehouse, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { can, getCurrentUser, isActiveWarehouse } from '@/lib/rbac'
import type { AuthUser, Product } from '@/lib/types'

interface Branch {
  _id: string
  name: string
  code?: string
  type?: 'store' | 'warehouse'
  isActive?: boolean
}
interface TransferLine {
  productId: string
  productSnapshot: { name: string; sku: string; barcode: string; hsnCode: string }
  requestedQty: number
  dispatchedQty: number
  receivedQty: number
}
interface Transfer {
  _id: string
  transferNumber: string
  fromStoreId: string
  toStoreId: string
  status: 'requested' | 'in_transit' | 'received' | 'cancelled'
  items: TransferLine[]
  createdAt: string
  notes?: string
}

const STATUS_TONE: Record<Transfer['status'], 'outline' | 'secondary' | 'destructive'> = {
  requested: 'outline',
  in_transit: 'secondary',
  received: 'secondary',
  cancelled: 'destructive',
}

export default function TransfersPage() {
  const [me, setMe] = useState<AuthUser | null>(null)
  const [rows, setRows] = useState<Transfer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => setMe(getCurrentUser()), [])

  // When standing in a warehouse, the source is fixed to that warehouse and
  // the transfer must go to a retail store. The dialog reflects this.
  const warehouseMode = isActiveWarehouse(me)

  const load = async () => {
    setLoading(true)
    try {
      const [t, b] = await Promise.all([
        api.get<Transfer[]>('/transfers'),
        api.get<Branch[]>('/stores'),
      ])
      setRows(t)
      setBranches(b)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const branchName = (id: string) => {
    const b = branches.find((x) => x._id === id)
    return b ? (b.code ? `${b.code} · ${b.name}` : b.name) : '—'
  }

  const canCreate = can(me, 'transfers', 'create')
  const canAct = can(me, 'transfers', 'update')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className={`w-6 h-6 ${warehouseMode ? 'text-violet-600' : 'text-blue-600'}`} />
            {warehouseMode ? 'Send stock to a store' : 'Inter-store transfers'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {warehouseMode
              ? 'Push stock from this warehouse to one of your retail branches. The warehouse deducts on dispatch; the destination store adds on receipt.'
              : 'Move stock between branches. Source deducts on dispatch; destination adds on receive. Both sides post a stock movement, so the audit trail is symmetrical.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Refresh'}
          </Button>
          {canCreate && branches.length >= 2 && (
            <Button
              onClick={() => setOpen(true)}
              className={warehouseMode ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'}
            >
              <Plus className="w-4 h-4 mr-1" /> {warehouseMode ? 'Send to store' : 'New transfer'}
            </Button>
          )}
        </div>
      </div>

      {branches.length < 2 && (
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <CardContent className="p-3 text-sm text-amber-900 dark:text-amber-200">
            You need at least two branches to transfer between. Add another branch
            from <b>Branches</b>.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TRF #</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">{loading ? 'Loading…' : 'No transfers yet.'}</TableCell></TableRow>
              ) : rows.map((t) => (
                <TableRow key={t._id}>
                  <TableCell className="font-mono">{t.transferNumber}</TableCell>
                  <TableCell className="text-xs">{branchName(t.fromStoreId)}</TableCell>
                  <TableCell className="text-xs">{branchName(t.toStoreId)}</TableCell>
                  <TableCell className="text-right">{t.items.length}</TableCell>
                  <TableCell><Badge variant={STATUS_TONE[t.status]} className="text-[10px] uppercase">{t.status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(t.createdAt).toLocaleString('en-IN')}</TableCell>
                  <TableCell>
                    {canAct && t.status === 'requested' && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await api.post(`/transfers/${t._id}/dispatch`)
                              toast.success('Dispatched — stock moved out')
                              load()
                            } catch (err) {
                              if (err instanceof ApiError) toast.error(err.message)
                            }
                          }}
                        >
                          <Send className="w-3.5 h-3.5 mr-1" /> Dispatch
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Cancel"
                          onClick={async () => {
                            const reason = prompt('Cancel reason?')
                            if (!reason) return
                            try {
                              await api.post(`/transfers/${t._id}/cancel`, { reason })
                              toast.success('Cancelled')
                              load()
                            } catch (err) {
                              if (err instanceof ApiError) toast.error(err.message)
                            }
                          }}
                        >
                          <X className="w-4 h-4 text-rose-500" />
                        </Button>
                      </div>
                    )}
                    {canAct && t.status === 'in_transit' && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={async () => {
                          try {
                            await api.post(`/transfers/${t._id}/receive`)
                            toast.success('Received — stock added at destination')
                            load()
                          } catch (err) {
                            if (err instanceof ApiError) toast.error(err.message)
                          }
                        }}
                      >
                        <CheckCheck className="w-3.5 h-3.5 mr-1" /> Receive
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {open && (
        <NewTransferDialog
          branches={branches}
          activeStoreId={me?.storeId || ''}
          warehouseMode={warehouseMode}
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

function NewTransferDialog({
  branches, activeStoreId, warehouseMode, onClose, onCreated,
}: {
  branches: Branch[]
  activeStoreId: string
  warehouseMode: boolean
  onClose: () => void
  onCreated: () => void
}) {
  // In warehouse mode, the source is hardwired to the active warehouse and
  // the destination must be a non-warehouse branch (a retail store). In
  // normal mode, any pair of distinct branches is allowed.
  const defaultFrom = warehouseMode
    ? activeStoreId
    : branches[0]?._id || ''
  const defaultTo = warehouseMode
    ? branches.find((b) => b._id !== activeStoreId && b.type !== 'warehouse')?._id ||
      branches.find((b) => b._id !== activeStoreId)?._id ||
      ''
    : branches[1]?._id || ''

  const [fromStoreId, setFromStoreId] = useState(defaultFrom)
  const [toStoreId, setToStoreId] = useState(defaultTo)
  const fromOptions = warehouseMode
    ? branches.filter((b) => b._id === activeStoreId)
    : branches
  const toOptions = warehouseMode
    ? branches.filter((b) => b._id !== activeStoreId && b.type !== 'warehouse')
    : branches
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<{ productId: string; requestedQty: number }[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Note: products listing is store-scoped via JWT, so we only see source-store
  // products by default. We'd need a server-side filter to fetch by storeId
  // if it differs from current; for now we show only products at the user's
  // active store, and the server enforces the source-store match.
  useEffect(() => {
    api.get<Product[]>('/products?limit=500')
      .then((r) => setProducts(r.filter((p) => p.isActive !== false && p.stock > 0)))
      .catch(() => setProducts([]))
  }, [])

  const addProduct = (p: Product) => {
    if (items.find((it) => it.productId === p._id)) return
    setItems((prev) => [...prev, { productId: p._id, requestedQty: 1 }])
  }
  const updateQty = (id: string, qty: number) =>
    setItems((prev) => prev.map((it) => (it.productId === id ? { ...it, requestedQty: qty } : it)))
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((it) => it.productId !== id))

  const submit = async () => {
    if (!fromStoreId || !toStoreId) return toast.error('Pick both stores')
    if (fromStoreId === toStoreId) return toast.error('Source and destination must differ')
    if (items.length === 0) return toast.error('Add at least one item')
    setSubmitting(true)
    try {
      await api.post('/transfers', { fromStoreId, toStoreId, items, notes })
      toast.success('Transfer requested')
      onCreated()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not create transfer')
    } finally {
      setSubmitting(false)
    }
  }

  const labelFor = (b: Branch) => {
    const base = b.code ? `${b.code} · ${b.name}` : b.name
    return b.type === 'warehouse' ? `🏬 ${base} (Warehouse)` : `🏪 ${base}`
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {warehouseMode ? 'Send stock to a store' : 'New transfer'}
          </DialogTitle>
          <DialogDescription>
            Two-step flow: <b>Request</b> → <b>Dispatch</b> (source deducts) → <b>Receive</b>
            (destination adds). The destination branch picks up the goods physically and
            confirms receipt.
            {warehouseMode && (
              <span className="block mt-1 text-violet-700 dark:text-violet-300">
                Source is locked to this warehouse. Pick the retail store that should
                receive the stock.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From branch</Label>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full text-sm disabled:opacity-70"
              value={fromStoreId}
              disabled={warehouseMode}
              onChange={(e) => setFromStoreId(e.target.value)}
            >
              {fromOptions.map((b) => (
                <option key={b._id} value={b._id}>{labelFor(b)}</option>
              ))}
            </select>
            {warehouseMode && (
              <p className="text-[11px] text-violet-700 dark:text-violet-300 flex items-center gap-1">
                <Warehouse className="w-3 h-3" /> Locked to active warehouse
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {warehouseMode ? 'Destination store' : 'To branch'}
            </Label>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full text-sm"
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
            >
              {toOptions.length === 0 ? (
                <option value="">No eligible destination</option>
              ) : (
                toOptions.map((b) => (
                  <option key={b._id} value={b._id}>{labelFor(b)}</option>
                ))
              )}
            </select>
            {warehouseMode && toOptions.length === 0 && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Add a retail store from Branches before
                you can transfer.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Add items</Label>
          <select
            className="h-9 border rounded-md px-2 bg-background w-full text-sm"
            value=""
            onChange={(e) => {
              const p = products.find((x) => x._id === e.target.value)
              if (p) addProduct(p)
            }}
          >
            <option value="">Pick a product…</option>
            {products
              .filter((p) => !items.find((it) => it.productId === p._id))
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.sku}) — {p.stock} in stock
                </option>
              ))}
          </select>
          <div className="border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right w-32">Qty</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground italic py-3">No items added.</TableCell></TableRow>
                ) : items.map((it) => {
                  const p = products.find((x) => x._id === it.productId)
                  return (
                    <TableRow key={it.productId}>
                      <TableCell className="text-sm">
                        <div>{p?.name}</div>
                        <div className="text-[11px] text-muted-foreground">{p?.sku} · stock {p?.stock}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={p?.stock || 1}
                          value={it.requestedQty}
                          onChange={(e) => updateQty(it.productId, Number(e.target.value) || 1)}
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeItem(it.productId)}>
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Reason for transfer" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            {submitting ? 'Creating…' : 'Request transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
