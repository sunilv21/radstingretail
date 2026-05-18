'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Eye,
  PackageCheck,
  X,
  Trash2,
  RefreshCcw,
  Wallet,
  CreditCard,
  Ban,
  FileWarning,
  UserPlus,
  Undo2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';

interface Supplier {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  stateCode?: string;
  outstandingBalance?: number;
}

interface PoItem {
  productId: string;
  productSnapshot?: { name: string; sku: string; hsnCode: string };
  orderedQty: number;
  receivedQty: number;
  purchasePrice: number;
  gstRate: number;
  unit: string;
  taxableAmount: number;
  totalTax: number;
  totalAmount: number;
}

interface PurchaseOrder {
  _id: string;
  poNumber: string;
  supplierId: string;
  supplierSnapshot: { name: string; phone?: string; gstNumber?: string };
  status: 'draft' | 'ordered' | 'partial' | 'received' | 'closed' | 'cancelled' | 'returned';
  items: PoItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  amountPaid: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  dueDate?: string | null;
  expectedDate?: string | null;
  notes?: string;
  receiptRefs: { grnNumber: string; total: number; receivedAt: string }[];
  createdAt: string;
}

const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Today in `YYYY-MM-DD` — for `<input type="date" min>` and quick-picks. */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO date `N` days in the future, in local time. */
function isoFromOffset(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Render an ISO date as `dd MMM yyyy` in `en-IN`. Forces midnight-local
 * parse so a `YYYY-MM-DD` string doesn't roll back a day in IST due to
 * implicit UTC interpretation by Date.parse.
 */
function fmtIsoDate(iso?: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Is `expectedDate` strictly before today AND the PO is still open?
 * Closed / cancelled / received POs are never "overdue" — they're done.
 */
function isOverdue(expectedDate: string | null | undefined, status?: string): boolean {
  if (!expectedDate) return false;
  if (status === 'received' || status === 'closed' || status === 'cancelled' || status === 'returned') return false;
  const due = new Date(expectedDate.length === 10 ? `${expectedDate}T00:00:00` : expectedDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

const statusColor: Record<string, string> = {
  draft: 'bg-slate-500 hover:bg-slate-500',
  ordered: 'bg-blue-600 hover:bg-blue-600',
  partial: 'bg-orange-500 hover:bg-orange-500',
  received: 'bg-green-600 hover:bg-green-600',
  closed: 'bg-purple-600 hover:bg-purple-600',
  cancelled: 'bg-red-600 hover:bg-red-600',
};

interface NewLine {
  productId: string;
  productName: string;
  unit: string;
  orderedQty: number;
  purchasePrice: number;
  gstRate: number;
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  // List filters — status pills + supplier dropdown + free-text
  // search across PO number / supplier name / GSTIN.
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'draft' | 'ordered' | 'partial' | 'received' | 'closed' | 'cancelled' | 'unpaid'
  >('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [grnPo, setGrnPo] = useState<PurchaseOrder | null>(null);
  const [payPo, setPayPo] = useState<PurchaseOrder | null>(null);
  const [viewPo, setViewPo] = useState<PurchaseOrder | null>(null);
  const [returnPo, setReturnPo] = useState<PurchaseOrder | null>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [po, sup, prod] = await Promise.all([
        api.get<PurchaseOrder[]>('/purchases?limit=100'),
        api.get<Supplier[]>('/suppliers'),
        api.get<Product[]>('/products?limit=200'),
      ]);
      setPurchases(po);
      setSuppliers(sup);
      setProducts(prod);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // If the merchant arrived from the OCR scan page, auto-open the New PO
  // dialog with the extracted draft pre-loaded. The draft was stashed in
  // sessionStorage by the scan page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).get('from')) return;
    const raw = sessionStorage.getItem('ocr-bill-draft');
    if (!raw) return;
    sessionStorage.removeItem('ocr-bill-draft');
    setCreateOpen(true);
    toast.info('OCR draft loaded — review and add line items before submitting.');
  }, []);

  // Status / supplier / text filters applied in order: cheapest first.
  const filtered = purchases.filter((p) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'unpaid') {
        if (p.paymentStatus === 'paid' || p.status === 'cancelled') return false;
      } else if (p.status !== statusFilter) {
        return false;
      }
    }
    if (supplierFilter !== 'all' && String(p.supplierId) !== supplierFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const hay =
        (p.poNumber || '').toLowerCase() +
        ' ' +
        (p.supplierSnapshot?.name || '').toLowerCase() +
        ' ' +
        (p.supplierSnapshot?.gstNumber || '').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Per-status counts for the filter pill badges.
  const statusCounts = {
    all: purchases.length,
    draft: purchases.filter((p) => p.status === 'draft').length,
    ordered: purchases.filter((p) => p.status === 'ordered').length,
    partial: purchases.filter((p) => p.status === 'partial').length,
    received: purchases.filter((p) => p.status === 'received').length,
    closed: purchases.filter((p) => p.status === 'closed').length,
    cancelled: purchases.filter((p) => p.status === 'cancelled').length,
    unpaid: purchases.filter(
      (p) => p.paymentStatus !== 'paid' && p.status !== 'cancelled',
    ).length,
  };

  const outstandingValue = purchases
    .filter((p) => ['ordered', 'partial'].includes(p.status))
    .reduce((s, p) => {
      const rem = p.items.reduce(
        (t, i) => t + Math.max(0, i.orderedQty - i.receivedQty) * i.purchasePrice,
        0,
      );
      return s + rem;
    }, 0);

  const payableValue = purchases.reduce(
    (s, p) => s + Math.max(0, (p.grandTotal || 0) - (p.amountPaid || 0)),
    0,
  );

  const cancelPo = async (po: PurchaseOrder) => {
    const reason = window.prompt('Cancel reason:');
    if (reason === null) return;
    try {
      await api.post(`/purchases/${po._id}/cancel`, { reason });
      toast.success(`${po.poNumber} cancelled`);
      load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  const preClosePo = async (po: PurchaseOrder) => {
    const reason = window.prompt('Pre-close reason (pending qty forgiven):');
    if (reason === null) return;
    try {
      await api.post(`/purchases/${po._id}/pre-close`, { reason });
      toast.success(`${po.poNumber} pre-closed`);
      load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Purchases</h1>
          <p className="text-muted-foreground mt-1">
            Raise POs, receive goods (GRN), track supplier payables
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={load}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setSupplierDialogOpen(true)}
          >
            <UserPlus className="w-4 h-4 mr-1" /> Add Supplier
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={products.length === 0 || suppliers.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
            title={
              suppliers.length === 0
                ? 'Add at least one supplier first'
                : products.length === 0
                  ? 'Add at least one product first'
                  : undefined
            }
          >
            <Plus className="w-4 h-4 mr-1" /> New Purchase Order
          </Button>
        </div>
      </div>
      {suppliers.length === 0 && (
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <CardContent className="p-3 text-sm flex items-center gap-2 text-amber-900 dark:text-amber-300">
            <UserPlus className="w-4 h-4" />
            No suppliers yet. Add your first supplier to start raising purchase orders.
            <Button
              size="sm"
              className="ml-auto bg-amber-600 hover:bg-amber-700"
              onClick={() => setSupplierDialogOpen(true)}
            >
              Add Supplier
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Stat label="Total POs" value={String(purchases.length)} />
        <Stat
          label="Outstanding value"
          value={money(outstandingValue)}
          hint="Ordered but not yet received"
        />
        <Stat
          label="Payable to suppliers"
          value={money(payableValue)}
          hint="Received but unpaid"
          tone={payableValue > 0 ? 'warning' : undefined}
        />
        <Stat label="Suppliers" value={String(suppliers.length)} />
      </div>

      {/* Filters bar — search box, status pills, supplier dropdown.
          All client-side; rerun is cheap because purchases is in
          memory. */}
      <Card className="py-0 gap-0">
        <CardContent className="p-2 space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search PO number, supplier name or GSTIN…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="h-9 px-2 rounded-md border bg-background text-sm min-w-[180px]"
            >
              <option value="all">All suppliers ({suppliers.length})</option>
              {suppliers
                .slice()
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-center gap-1 flex-wrap text-[11px]">
            {(
              [
                { key: 'all', label: 'All', tone: 'bg-slate-600' },
                { key: 'draft', label: 'Draft', tone: 'bg-slate-500' },
                { key: 'ordered', label: 'Ordered', tone: 'bg-blue-600' },
                { key: 'partial', label: 'Partial', tone: 'bg-amber-600' },
                { key: 'received', label: 'Received', tone: 'bg-emerald-600' },
                { key: 'closed', label: 'Closed', tone: 'bg-slate-600' },
                { key: 'cancelled', label: 'Cancelled', tone: 'bg-rose-600' },
                { key: 'unpaid', label: 'Unpaid', tone: 'bg-orange-600' },
              ] as const
            ).map((p) => {
              const active = statusFilter === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setStatusFilter(p.key)}
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
                    {statusCounts[p.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="py-0 gap-0">
        <CardHeader className="py-2">
          <CardTitle className="text-base">
            Purchase Orders
            {(statusFilter !== 'all' || supplierFilter !== 'all' || searchTerm) && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                showing {filtered.length} of {purchases.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {loading ? (
            <div className="text-center py-4 text-sm text-muted-foreground">Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No POs yet. Click “New Purchase Order” to create one.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No POs match the current filters.{' '}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setSupplierFilter('all');
                  setSearchTerm('');
                }}
                className="text-blue-600 underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="[&_th]:h-7 [&_th]:py-0 [&_th]:px-2 [&_th]:text-[11px] [&_td]:py-0 [&_td]:px-2 [&_td]:text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((po) => (
                    <TableRow key={po._id}>
                      <TableCell className="font-medium">{po.poNumber}</TableCell>
                      <TableCell>{po.supplierSnapshot?.name}</TableCell>
                      <TableCell>
                        <Badge className={statusColor[po.status] || ''}>{po.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{po.items.length}</TableCell>
                      <TableCell className="text-right">{money(po.grandTotal)}</TableCell>
                      <TableCell className="text-right">{money(po.amountPaid)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={po.paymentStatus === 'paid' ? 'secondary' : 'destructive'}
                          className={po.paymentStatus === 'partial' ? 'bg-orange-500 hover:bg-orange-500' : ''}
                        >
                          {po.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(po.createdAt).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {po.expectedDate ? (
                          <span
                            className={
                              isOverdue(po.expectedDate, po.status)
                                ? 'text-red-600 font-semibold'
                                : ''
                            }
                            title={
                              isOverdue(po.expectedDate, po.status)
                                ? 'Overdue — expected delivery has passed'
                                : 'Expected delivery'
                            }
                          >
                            {fmtIsoDate(po.expectedDate)}
                            {isOverdue(po.expectedDate, po.status) && (
                              <span className="ml-1 text-[10px]">!</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" title="View" onClick={() => setViewPo(po)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {(po.status === 'ordered' || po.status === 'partial') && (
                            <>
                              <Button size="icon" variant="ghost" title="Receive (GRN)" onClick={() => setGrnPo(po)}>
                                <PackageCheck className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Pre-close" onClick={() => preClosePo(po)}>
                                <FileWarning className="w-4 h-4 text-purple-600" />
                              </Button>
                            </>
                          )}
                          {po.status === 'ordered' && po.items.every((i) => i.receivedQty === 0) && (
                            <Button size="icon" variant="ghost" title="Cancel" onClick={() => cancelPo(po)}>
                              <Ban className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                          {po.paymentStatus !== 'paid' && po.status !== 'cancelled' && (
                            <Button size="icon" variant="ghost" title="Record payment" onClick={() => setPayPo(po)}>
                              <Wallet className="w-4 h-4 text-blue-600" />
                            </Button>
                          )}
                          {(po.status === 'received' || po.status === 'partial' || po.status === 'closed') && po.items.some((i) => i.receivedQty > 0) && (
                            <Button size="icon" variant="ghost" title="Issue debit note (return)" onClick={() => setReturnPo(po)}>
                              <Undo2 className="w-4 h-4 text-amber-600" />
                            </Button>
                          )}
                          {po.status === 'returned' && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-amber-50 text-amber-700 border-amber-300">
                              Debit Note
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreatePoDialog
          suppliers={suppliers}
          products={products}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {grnPo && (
        <GrnDialog
          po={grnPo}
          onClose={() => setGrnPo(null)}
          onDone={() => {
            setGrnPo(null);
            load();
          }}
        />
      )}

      {payPo && (
        <PayDialog
          po={payPo}
          onClose={() => setPayPo(null)}
          onDone={() => {
            setPayPo(null);
            load();
          }}
        />
      )}

      {viewPo && <ViewPoDialog po={viewPo} onClose={() => setViewPo(null)} />}

      {returnPo && (
        <ReturnPoDialog
          po={returnPo}
          onClose={() => setReturnPo(null)}
          onDone={() => { setReturnPo(null); load(); }}
        />
      )}

      {supplierDialogOpen && (
        <NewSupplierDialog
          onClose={() => setSupplierDialogOpen(false)}
          onSaved={() => {
            setSupplierDialogOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewSupplierDialog({
  onClose,
  onSaved,
  initialName = '',
}: {
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
  initialName?: string;
}) {
  const [form, setForm] = useState({
    name: initialName,
    phone: '',
    email: '',
    gstNumber: '',
    stateCode: '',
    address: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<Supplier>('/suppliers', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        gstNumber: form.gstNumber.trim(),
        stateCode: form.stateCode.trim(),
        address: form.address.trim(),
      });
      toast.success(`Supplier "${created.name}" added`);
      onSaved(created);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            Add Supplier
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Supplier name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Acme Wholesale Ltd"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="10-digit or with country code"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="orders@supplier.in"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">GSTIN</Label>
            <Input
              value={form.gstNumber}
              onChange={(e) =>
                setForm({ ...form, gstNumber: e.target.value.toUpperCase() })
              }
              placeholder="27AAAAA0000A1Z5"
              maxLength={15}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">State code</Label>
            <Input
              value={form.stateCode}
              onChange={(e) =>
                setForm({ ...form, stateCode: e.target.value.replace(/\D/g, '') })
              }
              placeholder="07 = Delhi, 27 = Maharashtra…"
              maxLength={2}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Street, City, Pincode"
            />
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground">
          GSTIN + state code determine whether purchases are intra-state (CGST+SGST)
          or inter-state (IGST) for input tax credit.
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? 'Saving…' : 'Save Supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewProductDialog({
  onClose,
  onSaved,
  initialName = '',
}: {
  onClose: () => void;
  onSaved: (product: Product) => void;
  initialName?: string;
}) {
  const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'dozen'];
  const GST_OPTIONS = [0, 5, 12, 18, 28];
  const [form, setForm] = useState({
    name: initialName,
    sku: '',
    barcode: '',
    hsnCode: '',
    category: 'General',
    brand: '',
    unit: 'pcs',
    gstRate: '18',
    purchasePrice: '',
    sellingPrice: '',
    mrp: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim() || !form.sku.trim() || !form.hsnCode.trim() || !form.sellingPrice) {
      toast.error('Name, SKU, HSN code and selling price are required');
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<Product>('/products', {
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || undefined,
        hsnCode: form.hsnCode.trim(),
        category: form.category.trim(),
        brand: form.brand.trim(),
        unit: form.unit,
        gstRate: Number(form.gstRate),
        purchasePrice: Number(form.purchasePrice || 0),
        sellingPrice: Number(form.sellingPrice),
        mrp: Number(form.mrp || form.sellingPrice),
      });
      toast.success(`Product "${created.name}" added`);
      onSaved(created);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            New product
          </DialogTitle>
          <div className="text-xs text-muted-foreground">
            Quick-add a master record so it can go on this PO. You can refine
            pricing / stock rules later in Inventory.
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-x-4 gap-y-3 py-2 overflow-y-auto pr-1">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Philips LED Bulb 9W"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SKU / Part No *</Label>
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="Unique code"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Barcode</Label>
            <Input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              placeholder="Scan, type, or leave blank"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">HSN code *</Label>
            <Input
              value={form.hsnCode}
              onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
              placeholder="e.g. 8539"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Brand</Label>
            <Input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">GST rate %</Label>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full"
              value={form.gstRate}
              onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
            >
              {GST_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Purchase price (₹)</Label>
            <Input
              type="number"
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Selling price (₹) *</Label>
            <Input
              type="number"
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">MRP (₹)</Label>
            <Input
              type="number"
              value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              placeholder="defaults to selling price"
            />
          </div>

          <div className="col-span-3 text-[11px] text-muted-foreground bg-muted/40 rounded px-3 py-2">
            Stock starts at 0 — adding this product to the PO and receiving it
            (GRN) will bring stock in with a ledgered Input GST Credit entry.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? 'Saving…' : 'Create & add to PO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warning';
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-3 flex items-center justify-between gap-3 leading-tight">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground truncate">{label}</div>
          {hint ? (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{hint}</div>
          ) : null}
        </div>
        <div className={`text-2xl font-bold tabular-nums shrink-0 ${tone === 'warning' ? 'text-orange-600' : ''}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function CreatePoDialog({
  suppliers,
  products,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
}) {
  // Local mirror of supplier + product lists — these grow when the user adds one
  // inline (via "+ New") without closing the dialog. The parent reloads the full
  // lists from the server on Create, which hydrates the saved state.
  const [localSuppliers, setLocalSuppliers] = useState<Supplier[]>(suppliers);
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  const [supplierId, setSupplierId] = useState(suppliers[0]?._id || '');
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [lines, setLines] = useState<NewLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [reverseCharge, setReverseCharge] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filteredProducts = localProducts.filter((p) =>
    productSearch
      ? p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.barcode || '').includes(productSearch)
      : true,
  );

  const addProduct = (p: Product) => {
    if (lines.some((l) => l.productId === p._id)) {
      toast.error(`${p.name} already on this PO`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: p._id,
        productName: p.name,
        unit: p.unit,
        orderedQty: 1,
        purchasePrice: p.purchasePrice || 0,
        gstRate: p.gstRate,
      },
    ]);
    setProductSearch('');
  };

  const updateLine = (pid: string, patch: Partial<NewLine>) => {
    setLines((prev) => prev.map((l) => (l.productId === pid ? { ...l, ...patch } : l)));
  };

  const removeLine = (pid: string) => setLines((prev) => prev.filter((l) => l.productId !== pid));

  const subtotal = lines.reduce((s, l) => s + l.orderedQty * l.purchasePrice, 0);
  const tax = lines.reduce(
    (s, l) => s + l.orderedQty * l.purchasePrice * (l.gstRate / 100),
    0,
  );

  const save = async (status: 'draft' | 'ordered') => {
    if (!supplierId) {
      toast.error('Pick a supplier');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/purchases', {
        supplierId,
        status,
        items: lines.map((l) => ({
          productId: l.productId,
          orderedQty: l.orderedQty,
          purchasePrice: l.purchasePrice,
          gstRate: l.gstRate,
          unit: l.unit,
        })),
        notes,
        expectedDate: expectedDate || null,
        reverseCharge,
      });
      toast.success(status === 'draft' ? 'Draft PO saved' : 'PO submitted to supplier');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Purchase Order</DialogTitle>
        </DialogHeader>

        {/* Header fields — stacked, never cramped. Putting Supplier (which has its
            own "+ New" button) and Expected-delivery (which has quick-pick chips)
            side-by-side caused the "+ New" button to bleed into the date input
            on narrower viewports. One row each, full width. */}
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Supplier</Label>
            <div className="flex gap-2">
              <select
                className="h-9 flex-1 min-w-0 border rounded-md px-2 bg-background"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                {localSuppliers.length === 0 && <option value="">No suppliers yet</option>}
                {localSuppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddSupplierOpen(true)}
                title="Add a new supplier without leaving this dialog"
                className="shrink-0"
              >
                <UserPlus className="w-4 h-4 mr-1" /> New
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Expected delivery date</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={expectedDate}
                min={todayIso()}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="max-w-56"
              />
              {expectedDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Clear"
                  onClick={() => setExpectedDate('')}
                  className="h-9 w-9 shrink-0"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
              {expectedDate && (
                <span className="text-[11px] text-muted-foreground">
                  {fmtIsoDate(expectedDate)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {([
                { label: 'Today', days: 0 },
                { label: '+3 days', days: 3 },
                { label: '+1 week', days: 7 },
                { label: '+2 weeks', days: 14 },
                { label: '+1 month', days: 30 },
              ] as const).map((opt) => {
                const iso = isoFromOffset(opt.days);
                const active = expectedDate === iso;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setExpectedDate(iso)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              When you expect the supplier to deliver. Used to flag overdue POs in the list.
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
            <input
              type="checkbox"
              checked={reverseCharge}
              onChange={(e) => setReverseCharge(e.target.checked)}
              className="mt-1"
            />
            <div className="text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-300">
                Reverse Charge Mechanism (RCM) — we pay the GST, not the supplier
              </div>
              <div className="text-[11px] text-amber-800 dark:text-amber-400">
                Tick this for purchases from unregistered suppliers, GTA freight, lawyer/director fees,
                or imports. RCM amounts go into GSTR-3B section 3.1(d) as outward liability AND into
                section 4 as ITC.
              </div>
            </div>
          </label>
        </div>

        {addSupplierOpen && (
          <NewSupplierDialog
            onClose={() => setAddSupplierOpen(false)}
            onSaved={(s) => {
              setLocalSuppliers((prev) => [...prev, s]);
              setSupplierId(s._id);
              setAddSupplierOpen(false);
            }}
          />
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Add items</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddProductOpen(true)}
              title="Create a product master for something you've never stocked before — useful on first shipment from a new supplier."
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> New product
            </Button>
          </div>
          <Input
            placeholder="Search product by name, SKU or barcode…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          {productSearch && filteredProducts.length > 0 && (
            <div className="border rounded max-h-40 overflow-y-auto divide-y">
              {filteredProducts.slice(0, 10).map((p) => (
                <button
                  key={p._id}
                  onClick={() => addProduct(p)}
                  className="w-full text-left flex items-center justify-between p-2 hover:bg-muted text-sm"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.sku} · HSN {p.hsnCode} · Current stock {p.stock}
                    </div>
                  </div>
                  <div className="text-xs">₹{p.purchasePrice.toFixed(2)}</div>
                </button>
              ))}
            </div>
          )}
          {productSearch.trim() && filteredProducts.length === 0 && (
            <div className="border border-dashed rounded p-3 text-sm flex items-center justify-between gap-2 bg-muted/30">
              <div className="text-muted-foreground">
                No product matches &ldquo;{productSearch}&rdquo;.
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setAddProductOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Create &ldquo;{productSearch}&rdquo;
              </Button>
            </div>
          )}
        </div>

        {addProductOpen && (
          <NewProductDialog
            initialName={productSearch}
            onClose={() => setAddProductOpen(false)}
            onSaved={(p) => {
              setLocalProducts((prev) => [...prev, p]);
              addProduct(p);
              setAddProductOpen(false);
            }}
          />
        )}

        {lines.length > 0 && (
          <div className="border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Purchase price</TableHead>
                  <TableHead className="text-right">GST %</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const base = l.orderedQty * l.purchasePrice;
                  const t = base * (l.gstRate / 100);
                  return (
                    <TableRow key={l.productId}>
                      <TableCell>{l.productName}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          value={l.orderedQty}
                          onChange={(e) =>
                            updateLine(l.productId, { orderedQty: Number(e.target.value) || 0 })
                          }
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.purchasePrice}
                          onChange={(e) =>
                            updateLine(l.productId, { purchasePrice: Number(e.target.value) || 0 })
                          }
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <select
                          value={l.gstRate}
                          onChange={(e) => updateLine(l.productId, { gstRate: Number(e.target.value) })}
                          className="h-8 border rounded px-1 bg-background w-16 text-right"
                        >
                          {[0, 5, 12, 18, 28].map((r) => (
                            <option key={r} value={r}>
                              {r}%
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="text-right">{money(base + t)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeLine(l.productId)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="text-sm space-y-1 bg-muted p-3 rounded">
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Tax" value={money(tax)} />
            <Row label="Total" value={money(subtotal + tax)} strong />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save('draft')} disabled={submitting}>
            Save as draft
          </Button>
          <Button onClick={() => save('ordered')} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            {submitting ? 'Submitting…' : 'Submit to supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ancillary expense type → default landed-cost flag.
 *
 * Freight/octroi/insurance/customs/transport are genuinely part of the
 * goods' delivered cost so they roll into product purchase price.
 * Labour/loading/unloading/packaging are operating costs that hit the P&L
 * directly. Defaults guide the user, but every row is individually
 * toggleable in the UI.
 */
const ANCILLARY_TYPES: { key: AncillaryType; label: string; landedDefault: boolean }[] = [
  { key: 'freight', label: 'Freight', landedDefault: true },
  { key: 'transport', label: 'Transport', landedDefault: true },
  { key: 'octroi', label: 'Octroi / Entry tax', landedDefault: true },
  { key: 'insurance', label: 'Goods insurance', landedDefault: true },
  { key: 'customs', label: 'Customs duty', landedDefault: true },
  { key: 'labour', label: 'Labour', landedDefault: false },
  { key: 'loading', label: 'Loading', landedDefault: false },
  { key: 'unloading', label: 'Unloading', landedDefault: false },
  { key: 'packaging', label: 'Packaging', landedDefault: false },
  { key: 'other', label: 'Other', landedDefault: false },
];

type AncillaryType =
  | 'labour' | 'packaging' | 'freight' | 'octroi' | 'loading'
  | 'unloading' | 'transport' | 'insurance' | 'customs' | 'other';

interface AncillaryLine {
  type: AncillaryType;
  description: string;
  amount: string; // kept as string in form for free-typing
  includeInLandedCost: boolean;
  paidVia: 'cash' | 'bank' | 'upi' | 'card' | 'cheque' | 'supplier';
}

function GrnDialog({
  po,
  onClose,
  onDone,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const outstandingItems = po.items.filter((i) => i.orderedQty - i.receivedQty > 0);
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const it of outstandingItems) init[it.productId] = it.orderedQty - it.receivedQty;
    return init;
  });
  const [batch, setBatch] = useState<Record<string, string>>({});
  const [ancillary, setAncillary] = useState<AncillaryLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addAncillary = () => {
    setAncillary((prev) => [
      ...prev,
      {
        type: 'freight',
        description: '',
        amount: '',
        includeInLandedCost: true,
        paidVia: 'cash',
      },
    ]);
  };
  const updateAncillary = (idx: number, patch: Partial<AncillaryLine>) => {
    setAncillary((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };
  const removeAncillary = (idx: number) => {
    setAncillary((prev) => prev.filter((_, i) => i !== idx));
  };

  // Split totals so the user sees what hits stock vs P&L before submitting.
  const ancillaryNumeric = ancillary
    .map((a) => ({ ...a, amountNum: Number(a.amount) || 0 }))
    .filter((a) => a.amountNum > 0);
  const landedTotal = ancillaryNumeric
    .filter((a) => a.includeInLandedCost)
    .reduce((s, a) => s + a.amountNum, 0);
  const operatingTotal = ancillaryNumeric
    .filter((a) => !a.includeInLandedCost)
    .reduce((s, a) => s + a.amountNum, 0);

  const submit = async () => {
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([productId, quantity]) => ({
        productId,
        quantity,
        batchNumber: batch[productId] || '',
      }));
    if (items.length === 0) {
      toast.error('Nothing to receive');
      return;
    }
    // Strip invalid/empty ancillary rows; server validates again.
    const ancillaryExpenses = ancillaryNumeric.map((a) => ({
      type: a.type,
      description: a.description,
      amount: a.amountNum,
      includeInLandedCost: a.includeInLandedCost,
      paidVia: a.paidVia,
    }));
    setSubmitting(true);
    try {
      await api.post(`/purchases/${po._id}/grn`, {
        items,
        ancillaryExpenses,
      });
      toast.success('Goods received and stock updated');
      onDone();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Goods Receipt — {po.poNumber} ({po.supplierSnapshot.name})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Adjust the received quantity for each line. Default is the full outstanding qty.
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Already received</TableHead>
                <TableHead className="text-right">Receiving now</TableHead>
                <TableHead>Batch #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstandingItems.map((it) => {
                const outstanding = it.orderedQty - it.receivedQty;
                return (
                  <TableRow key={it.productId}>
                    <TableCell>{it.productSnapshot?.name}</TableCell>
                    <TableCell className="text-right">{it.orderedQty}</TableCell>
                    <TableCell className="text-right">{it.receivedQty}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={outstanding}
                        value={qty[it.productId] ?? 0}
                        onChange={(e) =>
                          setQty({
                            ...qty,
                            [it.productId]: Math.min(outstanding, Math.max(0, Number(e.target.value) || 0)),
                          })
                        }
                        className="h-8 w-20 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={batch[it.productId] || ''}
                        onChange={(e) => setBatch({ ...batch, [it.productId]: e.target.value })}
                        placeholder="optional"
                        className="h-8"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {po.items.length - outstandingItems.length > 0 && (
            <div className="text-xs text-muted-foreground">
              ({po.items.length - outstandingItems.length} already-received line(s) hidden)
            </div>
          )}

          {/* Ancillary expenses block — labour, packaging, freight, etc.
              Toggle "Include in landed cost" decides whether the cost is
              distributed across the GRN lines (bumping product cost) or
              posted as a P&L expense in its own ledger account. */}
          <div className="border-t pt-3 mt-2">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div>
                <div className="font-semibold text-sm">Ancillary expenses (optional)</div>
                <div className="text-[11px] text-muted-foreground">
                  Labour, packaging, freight, loading — extra costs at receiving.
                  Toggle <i>landed cost</i> to roll the cost into product price; leave
                  off to post it as a P&amp;L expense.
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addAncillary}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add line
              </Button>
            </div>
            {ancillary.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount (₹)</TableHead>
                    <TableHead className="text-center">Landed cost?</TableHead>
                    <TableHead>Paid via</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ancillary.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <select
                          className="h-8 border rounded px-2 bg-background text-xs w-full"
                          value={row.type}
                          onChange={(e) => {
                            const next = e.target.value as AncillaryType;
                            const def = ANCILLARY_TYPES.find((t) => t.key === next)?.landedDefault ?? false;
                            updateAncillary(idx, { type: next, includeInLandedCost: def });
                          }}
                        >
                          {ANCILLARY_TYPES.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.description}
                          onChange={(e) => updateAncillary(idx, { description: e.target.value })}
                          placeholder="Vendor, vehicle no, etc."
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => updateAncillary(idx, { amount: e.target.value })}
                          className="h-8 w-24 text-right"
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={row.includeInLandedCost}
                          onChange={(e) =>
                            updateAncillary(idx, { includeInLandedCost: e.target.checked })
                          }
                          title={
                            row.includeInLandedCost
                              ? 'Cost will be distributed across line items and bumped into product purchase price'
                              : 'Cost will be posted as a P&L operating expense, not added to product cost'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-8 border rounded px-2 bg-background text-xs w-full"
                          value={row.paidVia}
                          onChange={(e) =>
                            updateAncillary(idx, { paidVia: e.target.value as AncillaryLine['paidVia'] })
                          }
                        >
                          <option value="cash">Cash</option>
                          <option value="bank">Bank</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="cheque">Cheque</option>
                          <option value="supplier">Supplier (added to PO bill)</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeAncillary(idx)}
                          title="Remove line"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {(landedTotal > 0 || operatingTotal > 0) && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Adds to product cost
                  </div>
                  <div className="font-semibold text-blue-800 dark:text-blue-200">
                    ₹{landedTotal.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Distributed across {Object.values(qty).filter((q) => q > 0).length} GRN line(s)
                    proportionally to value.
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    P&amp;L direct expense
                  </div>
                  <div className="font-semibold text-amber-800 dark:text-amber-200">
                    ₹{operatingTotal.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Posts to Direct Expenses ledger; does not change product cost.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-green-600 hover:bg-green-700">
            <PackageCheck className="w-4 h-4 mr-1" />
            {submitting ? 'Receiving…' : 'Receive goods'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  po,
  onClose,
  onDone,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const outstanding = Math.max(0, po.grandTotal - po.amountPaid);
  const [amount, setAmount] = useState(String(outstanding.toFixed(2)));
  const [mode, setMode] = useState<'cash' | 'bank' | 'upi'>('bank');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) {
      toast.error('Amount must be > 0');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/purchases/${po._id}/pay`, { amount: amt, mode, reference });
      toast.success('Payment recorded');
      onDone();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Record payment — {po.poNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted p-3 rounded text-sm space-y-1">
            <Row label="PO total" value={money(po.grandTotal)} />
            <Row label="Paid so far" value={money(po.amountPaid)} />
            <Row label="Outstanding" value={money(outstanding)} strong />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'bank', 'upi'] as const).map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? 'default' : 'outline'}
                  onClick={() => setMode(m)}
                  size="sm"
                  className="capitalize"
                >
                  {m === 'cash' ? <Wallet className="w-3 h-3 mr-1" /> : <CreditCard className="w-3 h-3 mr-1" />}
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference (UTR / cheque #)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
            {submitting ? 'Saving…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewPoDialog({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {po.poNumber}
            <Badge className={statusColor[po.status] || ''}>{po.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Supplier</div>
              <div className="font-medium">{po.supplierSnapshot?.name}</div>
              {po.supplierSnapshot?.gstNumber && (
                <div className="text-xs">GSTIN {po.supplierSnapshot.gstNumber}</div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Expected delivery</div>
              {po.expectedDate ? (
                <div
                  className={`font-medium ${
                    isOverdue(po.expectedDate, po.status) ? 'text-red-600' : ''
                  }`}
                >
                  {fmtIsoDate(po.expectedDate)}
                  {isOverdue(po.expectedDate, po.status) && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                      Overdue
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground italic text-xs">Not set</div>
              )}
              <div className="text-[11px] text-muted-foreground">
                Created {fmtIsoDate(po.createdAt)}
              </div>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((it) => (
                <TableRow key={it.productId}>
                  <TableCell>{it.productSnapshot?.name}</TableCell>
                  <TableCell className="text-right">{it.orderedQty}</TableCell>
                  <TableCell className="text-right">{it.receivedQty}</TableCell>
                  <TableCell className="text-right">{money(it.purchasePrice)}</TableCell>
                  <TableCell className="text-right">{it.gstRate}%</TableCell>
                  <TableCell className="text-right">{money(it.totalAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="bg-muted p-3 rounded text-sm space-y-1">
            <Row label="Subtotal" value={money(po.subtotal)} />
            <Row label="Tax" value={money(po.totalTax)} />
            <Row label="Grand total" value={money(po.grandTotal)} strong />
            <Row label="Paid" value={money(po.amountPaid)} />
            <Row
              label="Outstanding"
              value={money(Math.max(0, po.grandTotal - po.amountPaid))}
              strong
            />
          </div>
          {po.receiptRefs.length > 0 && (
            <div>
              <div className="font-medium mb-1">Receipt history</div>
              <div className="border rounded divide-y">
                {po.receiptRefs.map((r, i) => (
                  <div key={i} className="p-2 flex justify-between text-xs">
                    <span>
                      {r.grnNumber} · {new Date(r.receivedAt).toLocaleString('en-IN')}
                    </span>
                    <span>{money(r.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-bold' : ''}>{value}</span>
    </div>
  );
}

function ReturnPoDialog({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: () => void }) {
  const receivable = po.items.filter((i) => i.receivedQty > 0);
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(receivable.map((it) => [it.productId, it.receivedQty])),
  );
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalReturning = receivable.reduce((s, it) => {
    const q = Number(qtys[it.productId] || 0);
    if (!(q > 0) || q > it.receivedQty) return s;
    const ratio = q / it.receivedQty;
    return s + Number(it.totalAmount || 0) * ratio;
  }, 0);

  const submit = async () => {
    const items = receivable
      .filter((it) => Number(qtys[it.productId] || 0) > 0)
      .map((it) => ({ productId: it.productId, quantity: Number(qtys[it.productId]) }));
    if (items.length === 0) {
      toast.error('Pick at least one item to return');
      return;
    }
    setSubmitting(true);
    try {
      const dn = await api.post<PurchaseOrder>(`/purchases/${po._id}/return`, { items, reason });
      toast.success(`Debit note ${dn.poNumber} issued`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-amber-600" />
            Issue Debit Note — {po.poNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-y-auto">
          <div className="text-xs text-muted-foreground">
            Posts a new <b>DN-…</b> document linked to this PO. Stock goes back out, Input GST credit is reversed,
            supplier payable reduces, and the original PO stays with received quantities decremented.
          </div>
          <div className="border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right w-32">Return qty</TableHead>
                  <TableHead className="text-right">Line value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivable.map((it) => {
                  const q = Number(qtys[it.productId] || 0);
                  return (
                    <TableRow key={it.productId}>
                      <TableCell className="text-sm">{it.productSnapshot?.name}</TableCell>
                      <TableCell className="text-right">{it.receivedQty}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={it.receivedQty}
                          value={q}
                          onChange={(e) => setQtys({ ...qtys, [it.productId]: Number(e.target.value) || 0 })}
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ₹{Number(it.totalAmount || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged on receipt, wrong item" />
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded p-2 text-sm flex justify-between">
            <span>Total return value</span>
            <span className="font-mono font-bold">₹{totalReturning.toFixed(2)}</span>
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || totalReturning <= 0}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {submitting ? 'Posting…' : 'Issue Debit Note'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
