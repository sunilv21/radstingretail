'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Barcode from 'react-barcode';
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
  Search,
  AlertTriangle,
  Pencil,
  Printer,
  RefreshCcw,
  Barcode as BarcodeIcon,
  QrCode as QrCodeIcon,
  Package,
  ListPlus,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { Product, ProductUnit } from '@/lib/types';
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner';
import { printLabels as printLabelsInIframe } from '@/lib/print-labels';
import HsnAutocomplete from '@/components/HsnAutocomplete';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldX,
} from 'lucide-react';

// Shape returned by GET /api/v1/hsn/audit/products — one row per product.
type HsnStatus = 'verified' | 'rate_mismatch' | 'unknown_hsn' | 'invalid_format' | 'missing';
interface HsnAuditRow {
  productId: string;
  status: HsnStatus;
  prescribedRates: number[];
  masterDescription: string | null;
  kind: 'hsn' | 'sac' | null;
  reason: string | null;
  digits: number;
}

/** Visual treatment for each verification status — used in the inline pill. */
const HSN_PILL: Record<HsnStatus, { label: string; tone: string; Icon: React.ComponentType<{ className?: string }> }> = {
  verified: {
    label: 'OK',
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    Icon: ShieldCheck,
  },
  rate_mismatch: {
    label: 'Mismatch',
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    Icon: ShieldAlert,
  },
  unknown_hsn: {
    label: 'Unknown',
    tone: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
    Icon: ShieldQuestion,
  },
  invalid_format: {
    label: 'Invalid',
    tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    Icon: ShieldX,
  },
  missing: {
    label: 'Missing',
    tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    Icon: ShieldX,
  },
};

const GST_OPTIONS = [0, 5, 12, 18, 28];
const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'dozen'];

interface FormState {
  _id?: string;
  name: string;
  sku: string;
  barcode: string;
  qrCode: string;
  isSerialised: boolean;
  priceIncludesGst: boolean;
  category: string;
  brand: string;
  unit: string;
  purchasePrice: string;
  sellingPrice: string;
  mrp: string;
  gstRate: string;
  hsnCode: string;
  stock: string;
  minStock: string;
  reorderQty: string;
  warrantyMonths: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  barcode: '',
  qrCode: '',
  isSerialised: false,
  priceIncludesGst: false,
  category: 'General',
  brand: '',
  unit: 'pcs',
  purchasePrice: '',
  sellingPrice: '',
  mrp: '',
  gstRate: '18',
  hsnCode: '',
  stock: '0',
  minStock: '0',
  reorderQty: '0',
  warrantyMonths: '0',
};

export default function InventoryPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Reorder dialog state — opens with a single low-stock product
  // pre-filled. The dialog lets the user batch in more low-stock items
  // before creating the draft PO.
  const [reorderSeed, setReorderSeed] = useState<Product | null>(null);
  // Stock filter pills.  in_stock = stock > minStock,
  // low = 0 < stock <= minStock, out = stock <= 0,
  // warranty = warrantyMonths > 0, inactive = isActive === false.
  const [stockFilter, setStockFilter] = useState<
    'all' | 'in_stock' | 'low' | 'out' | 'warranty' | 'inactive'
  >('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [labelCopies, setLabelCopies] = useState(6);
  const labelSheetRef = useRef<HTMLDivElement>(null);
  // When true, the next wedge scan fills the QR field instead of triggering
  // the global "open product by barcode" flow.
  const [captureQrScan, setCaptureQrScan] = useState(false);
  // Serial-tracking drawer state
  const [serialsProduct, setSerialsProduct] = useState<Product | null>(null);
  // Wizard (two-step: create serialised product → scan its units)
  const [serialWizardOpen, setSerialWizardOpen] = useState(false);

  // HSN verification status per product, keyed by productId. Loaded
  // alongside the product list and refreshed whenever the list changes.
  // The audit endpoint is cheap (one call per page load) and the data
  // drives both the inline status pill and the Verify dialog.
  const [hsnStatus, setHsnStatus] = useState<Map<string, HsnAuditRow>>(new Map());
  const [verifyOpen, setVerifyOpen] = useState<{ product: Product; row?: HsnAuditRow } | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const rows = await api.get<Product[]>('/products?limit=200');
      setProducts(rows);
      // Fire-and-forget HSN audit prefetch — if it fails we just don't
      // render the inline pill, no toast spam.
      api
        .get<{ rows: HsnAuditRow[] }>('/hsn/audit/products')
        .then((res) => {
          const m = new Map<string, HsnAuditRow>();
          for (const r of res.rows || []) m.set(String(r.productId), r);
          setHsnStatus(m);
        })
        .catch(() => {
          /* non-fatal */
        });
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('barcode');
    if (code && code.trim()) {
      handleScan(code.trim());
      window.history.replaceState({}, '', '/dashboard/inventory');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = products.filter((p) => {
    // Stock filter first — short-circuits before the text match.
    if (stockFilter === 'out' && p.stock > 0) return false;
    if (stockFilter === 'low' && (p.stock <= 0 || p.stock > (p.minStock || 0))) return false;
    if (stockFilter === 'in_stock' && p.stock <= (p.minStock || 0)) return false;
    if (stockFilter === 'warranty' && !((p as Product & { warrantyMonths?: number }).warrantyMonths)) return false;
    if (stockFilter === 'inactive' && p.isActive !== false) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.includes(searchTerm) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  // Per-category counts for the filter pill badges. Walked once over
  // the full list — cheap because `products` is already in memory.
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= (p.minStock || 0));
  const outOfStock = products.filter((p) => p.stock <= 0);
  const inStock = products.filter((p) => p.stock > (p.minStock || 0));
  const warrantyProducts = products.filter(
    (p) => (p as Product & { warrantyMonths?: number }).warrantyMonths,
  );
  const inactive = products.filter((p) => p.isActive === false);
  const totalValue = products.reduce((s, p) => s + p.sellingPrice * p.stock, 0);

  const openNew = async () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openNewWithBarcode = (barcode: string) => {
    setForm({ ...EMPTY_FORM, barcode });
    setDialogOpen(true);
  };

  const handleScan = async (code: string) => {
    setSearchTerm('');
    try {
      const existing = await api.get<Product>(
        `/products/by-barcode/${encodeURIComponent(code)}`,
      );
      toast.success(`Found ${existing.name} — opening for edit`);
      openEdit(existing);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.info(`New barcode ${code} — fill in product details`);
        openNewWithBarcode(code);
        return;
      }
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  useBarcodeScanner({
    onScan: handleScan,
    enabled:
      !dialogOpen &&
      !barcodeProduct &&
      !labelProduct &&
      !serialsProduct &&
      !serialWizardOpen,
  });

  // Dialog-local scanner: when the operator clicked "Scan to fill" on the QR
  // field, the next scan is routed into form.qrCode instead of the global
  // "open product by barcode" flow above.
  useBarcodeScanner({
    onScan: (code) => {
      setForm((f) => ({ ...f, qrCode: code }));
      setCaptureQrScan(false);
      toast.success(`QR captured: ${code.slice(0, 60)}${code.length > 60 ? '…' : ''}`);
    },
    enabled: dialogOpen && captureQrScan,
    minLength: 4,
    // QR payloads often carry URLs / punctuation, not just alphanumerics.
    charPattern: /[\x20-\x7E]/,
  });

  const openEdit = (p: Product) => {
    setForm({
      _id: p._id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      qrCode: p.qrCode || '',
      isSerialised: !!p.isSerialised,
      priceIncludesGst: !!p.priceIncludesGst,
      category: p.category || 'General',
      brand: p.brand || '',
      unit: p.unit || 'pcs',
      purchasePrice: String(p.purchasePrice ?? 0),
      sellingPrice: String(p.sellingPrice ?? 0),
      mrp: String(p.mrp ?? p.sellingPrice ?? 0),
      gstRate: String(p.gstRate ?? 18),
      hsnCode: p.hsnCode || '',
      stock: String(p.stock ?? 0),
      minStock: String(p.minStock ?? 0),
      reorderQty: String(p.reorderQty ?? 0),
      warrantyMonths: String(p.warrantyMonths ?? 0),
    });
    setDialogOpen(true);
  };

  const generateBarcode = async () => {
    try {
      const { barcode } = await api.get<{ barcode: string }>('/products/generate-barcode');
      setForm((f) => ({ ...f, barcode }));
      toast.success('Barcode generated');
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  const saveProduct = async () => {
    if (!form.name || !form.sku || !form.sellingPrice || !form.hsnCode) {
      toast.error('Name, SKU, HSN and selling price are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || undefined,
        qrCode: form.qrCode || '',
        isSerialised: form.isSerialised,
        priceIncludesGst: form.priceIncludesGst,
        category: form.category,
        brand: form.brand,
        unit: form.unit,
        purchasePrice: Number(form.purchasePrice || 0),
        sellingPrice: Number(form.sellingPrice),
        mrp: Number(form.mrp || form.sellingPrice),
        gstRate: Number(form.gstRate),
        hsnCode: form.hsnCode,
        stock: Number(form.stock || 0),
        minStock: Number(form.minStock || 0),
        reorderQty: Number(form.reorderQty || 0),
        warrantyMonths: Number(form.warrantyMonths || 0),
      };
      if (form._id) {
        await api.put<Product>(`/products/${form._id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post<Product>('/products', payload);
        toast.success('Product created');
      }
      setDialogOpen(false);
      loadProducts();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const adjustStock = async (product: Product) => {
    const input = window.prompt(
      `Adjust stock for ${product.name} (current: ${product.stock}). Enter new quantity:`,
      String(product.stock),
    );
    if (input === null) return;
    const next = Number(input);
    if (Number.isNaN(next) || next < 0) {
      toast.error('Invalid quantity');
      return;
    }
    const reason = window.prompt('Reason for adjustment:', 'Manual correction') || '';
    try {
      await api.post(`/products/${product._id}/adjust-stock`, {
        newQuantity: next,
        reason,
      });
      toast.success('Stock adjusted');
      loadProducts();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  const printLabels = () => {
    if (!labelProduct) return;
    // Offscreen iframe print — prints only the labels, not the dialog chrome.
    printLabelsInIframe(labelProduct, labelCopies);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground mt-1">
            Add products, generate barcodes, manage stock
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={loadProducts}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const code = window.prompt('Enter or scan barcode to add/edit:');
              if (code && code.trim()) handleScan(code.trim());
            }}
            title="Scan a barcode anywhere on this page — if it matches a product, it opens for edit; if not, a new-product form opens with the barcode filled in."
          >
            <BarcodeIcon className="w-4 h-4 mr-1" /> Scan to add
          </Button>
          <Button onClick={openNew} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Add Product
          </Button>
          <Button
            onClick={() => setSerialWizardOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
            title="For products where each physical unit has its own serial / IMEI / QR. Add the master once, then scan each unit."
          >
            <ListPlus className="w-4 h-4 mr-1" /> Add serialised
          </Button>
        </div>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <CardContent className="p-1 text-sm flex items-center gap-2 text-blue-900 dark:text-blue-300">
          <BarcodeIcon className="w-5 h-5" />
          Scan any barcode (USB scanner or handheld) while on this page — if the
          product exists it opens for edit, if it&apos;s new the form opens with
          the barcode pre-filled.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-0.5">
        <StatCard label="Total Products" value={String(products.length)} icon={<Package />} />
        <StatCard
          label="Low Stock"
          value={String(lowStock.length)}
          icon={<AlertTriangle />}
          tone={lowStock.length > 0 ? 'warning' : undefined}
        />
        <StatCard
          label="Stock Value (₹)"
          value={totalValue.toLocaleString('en-IN')}
          icon={<Package />}
        />
        <StatCard
          label="Out of Stock"
          value={String(products.filter((p) => p.stock <= 0).length)}
          icon={<AlertTriangle />}
          tone={products.some((p) => p.stock <= 0) ? 'danger' : undefined}
        />
      </div>

      <Card>
        <CardContent className="p-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, barcode or category…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Stock-status filter pills. Counts stay live as inventory
              changes (e.g. after a sale or GRN). */}
          <div className="flex items-center gap-1 flex-wrap text-[11px]">
            {(
              [
                { key: 'all', label: 'All', tone: 'bg-slate-600', count: products.length },
                { key: 'in_stock', label: 'In stock', tone: 'bg-emerald-600', count: inStock.length },
                { key: 'low', label: 'Low stock', tone: 'bg-amber-600', count: lowStock.length },
                { key: 'out', label: 'Out of stock', tone: 'bg-rose-600', count: outOfStock.length },
                { key: 'warranty', label: 'With warranty', tone: 'bg-blue-600', count: warrantyProducts.length },
                { key: 'inactive', label: 'Inactive', tone: 'bg-slate-500', count: inactive.length },
              ] as const
            ).map((p) => {
              const active = stockFilter === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setStockFilter(p.key)}
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
              );
            })}
          </div>
        </CardContent>
      </Card>

      {lowStock.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-2 flex items-center gap-2 text-orange-900 dark:text-orange-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            {lowStock.length} product(s) at or below minimum stock. Reorder soon.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading inventory…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No products match. Add one or clear the filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>HSN</TableHead>
                    <TableHead className="text-right">Purchase</TableHead>
                    <TableHead className="text-right">Selling</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow
                      key={p._id}
                      className={p.stock <= p.minStock ? 'bg-orange-50 dark:bg-orange-950/20' : ''}
                    >
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                          {p.name}
                          {(p.warrantyMonths ?? 0) > 0 && (
                            <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px] py-0 h-5">
                              {p.warrantyMonths}m warranty
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.sku} · {p.category} · {p.unit}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          className="font-mono text-xs underline decoration-dotted"
                          onClick={() => setBarcodeProduct(p)}
                        >
                          {p.barcode || '—'}
                        </button>
                      </TableCell>
                      <TableCell>
                        <HsnCell
                          product={p}
                          row={hsnStatus.get(String(p._id))}
                          onVerify={() =>
                            setVerifyOpen({ product: p, row: hsnStatus.get(String(p._id)) })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">₹{p.purchasePrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₹{p.sellingPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">{p.gstRate}%</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span>{p.stock}</span>
                          {p.stock <= 0 ? (
                            <Badge variant="destructive">Out</Badge>
                          ) : p.stock <= p.minStock ? (
                            <Badge className="bg-orange-500 hover:bg-orange-500">Low</Badge>
                          ) : (
                            <Badge variant="secondary">OK</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="View barcode"
                            onClick={() => setBarcodeProduct(p)}
                          >
                            <BarcodeIcon className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Print labels"
                            onClick={() => {
                              setLabelProduct(p);
                              setLabelCopies(6);
                            }}
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Adjust stock"
                            onClick={() => adjustStock(p)}
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </Button>
                          {/* Reorder — only surfaces when this product is at
                              or below its minStock threshold. Opens a dialog
                              that creates a draft PO; more low-stock items
                              can be batched into the same draft from there. */}
                          {p.stock <= (p.minStock || 0) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Reorder from supplier"
                              onClick={() => setReorderSeed(p)}
                            >
                              <Truck className="w-4 h-4 text-amber-600" />
                            </Button>
                          )}
                          {p.isSerialised && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Manage serials"
                              onClick={() => setSerialsProduct(p)}
                            >
                              <ListPlus className="w-4 h-4 text-indigo-600" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
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

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{form._id ? 'Edit product' : 'Add product'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3 py-2 overflow-y-auto pr-1">
            {/* Row 1: Identity */}
            <Field label="Name *" className="col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="SKU *">
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                disabled={!!form._id}
              />
            </Field>

            {/* Row 2: Scan codes */}
            <Field label="Barcode">
              <div className="flex gap-2">
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="Scan, type, or auto-generate"
                />
                <Button type="button" variant="outline" onClick={generateBarcode}>
                  <BarcodeIcon className="w-4 h-4" />
                </Button>
              </div>
            </Field>
            {form.isSerialised ? (
              <Field label="QR code (per-unit)" className="col-span-2">
                <div className="text-[11px] text-muted-foreground h-9 flex items-center px-2 bg-muted/40 rounded border border-dashed">
                  Managed per unit — use <b className="mx-1">Manage serials</b> to add
                  individual QR / serial numbers after saving.
                </div>
              </Field>
            ) : (
              <Field label="QR code" className="col-span-2">
                <div className="flex gap-2">
                  <Input
                    value={form.qrCode}
                    onChange={(e) => setForm({ ...form, qrCode: e.target.value })}
                    placeholder={
                      captureQrScan
                        ? 'Listening for the next QR scan…'
                        : 'Paste or scan the QR payload (URL, code, …)'
                    }
                  />
                  <Button
                    type="button"
                    variant={captureQrScan ? 'default' : 'outline'}
                    onClick={() => setCaptureQrScan((v) => !v)}
                    title="Click, then scan the QR. The next scan fills this field."
                  >
                    <QrCodeIcon className="w-4 h-4 mr-1" />
                    {captureQrScan ? 'Waiting…' : 'Scan to fill'}
                  </Button>
                  {form.qrCode && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setForm({ ...form, qrCode: '' })}
                      title="Clear QR code"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
            )}

            {/* Row 3: Serial status indicator — only when editing an existing serialised product */}
            {form._id && form.isSerialised && (
              <div className="col-span-3 text-xs bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-md px-3 py-2 flex items-center gap-2">
                <Badge className="bg-indigo-600 text-[10px] py-0 h-5">Serialised</Badge>
                <span>
                  Stock is maintained by individual units. Use{' '}
                  <b>Manage serials</b> on the product row to add or remove units.
                </span>
              </div>
            )}

            {/* Row 4: Taxonomy — HSN search + format/rate verification */}
            <Field label="HSN / SAC code *">
              <HsnAutocomplete
                value={form.hsnCode}
                onChange={(v) => setForm({ ...form, hsnCode: v })}
                onRateSuggest={(rate) => setForm({ ...form, gstRate: String(rate) })}
                appliedRate={Number(form.gstRate || 0)}
              />
            </Field>
            <Field label="Category">
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>
            <Field label="Brand">
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </Field>

            {/* Row 5: Units / tax / warranty */}
            <Field label="Unit">
              <select
                className="h-9 border rounded-md px-2 bg-background w-full"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="GST rate %">
              <select
                className="h-9 border rounded-md px-2 bg-background w-full"
                value={form.gstRate}
                onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
              >
                {GST_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Warranty (months)">
              <Input
                type="number"
                min={0}
                value={form.warrantyMonths}
                onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })}
                placeholder="0 = no warranty"
              />
            </Field>

            {/* Row 6: Pricing */}
            <Field label="Purchase price (₹)">
              <Input
                type="number"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
              />
            </Field>
            <Field label="Selling price (₹) *">
              <Input
                type="number"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
              />
            </Field>
            <Field label="MRP (₹)">
              <Input
                type="number"
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              />
            </Field>

            {/* GST-inclusive toggle (applies to the selling price above) */}
            <div className="col-span-3">
              <PriceIncludesGstToggle
                checked={form.priceIncludesGst}
                onChange={(v) => setForm({ ...form, priceIncludesGst: v })}
                sellingPrice={Number(form.sellingPrice || 0)}
                gstRate={Number(form.gstRate || 0)}
              />
            </div>

            {/* Row 7: Stock */}
            {!form._id && (
              <Field label="Opening stock">
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </Field>
            )}
            <Field label="Min stock">
              <Input
                type="number"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </Field>
            <Field label="Reorder qty">
              <Input
                type="number"
                value={form.reorderQty}
                onChange={(e) => setForm({ ...form, reorderQty: e.target.value })}
              />
            </Field>

            {Number(form.warrantyMonths) > 0 && (
              <div className="col-span-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2">
                This item carries a {form.warrantyMonths}-month warranty. When sold,
                customer name, mobile, and address are required so the warranty can be
                honored later.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveProduct} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? 'Saving…' : form._id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reorder dialog — opens with one low-stock product pre-filled;
          the cashier can add more low-stock items and pick a supplier. */}
      {reorderSeed && (
        <ReorderDialog
          seed={reorderSeed}
          allProducts={products}
          onClose={() => setReorderSeed(null)}
          onCreated={(id) => {
            setReorderSeed(null);
            router.push(`/dashboard/purchases?po=${id}`);
          }}
        />
      )}

      {/* Barcode view dialog */}
      <Dialog open={!!barcodeProduct} onOpenChange={(o) => !o && setBarcodeProduct(null)}>
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{barcodeProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {barcodeProduct && (
              <div className="text-center py-2">
                <div className="bg-white p-4 rounded inline-block">
                  <Barcode
                    value={barcodeProduct.barcode || '0'}
                    format={pickBarcodeFormat(barcodeProduct.barcode)}
                    displayValue
                    height={80}
                    width={2}
                  />
                </div>
                <div className="mt-3 text-sm">
                  ₹{barcodeProduct.sellingPrice.toFixed(2)} · SKU {barcodeProduct.sku}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBarcodeProduct(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (barcodeProduct) {
                  setLabelProduct(barcodeProduct);
                  setLabelCopies(6);
                  setBarcodeProduct(null);
                }
              }}
            >
              <Printer className="w-4 h-4 mr-1" /> Print labels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HSN verify dialog — opened from any row's inline Verify button. */}
      {verifyOpen && (
        <HsnVerifyDialog
          product={verifyOpen.product}
          row={verifyOpen.row}
          onClose={() => setVerifyOpen(null)}
          onApplyRate={async (rate) => {
            try {
              await api.put(`/products/${verifyOpen.product._id}`, { gstRate: rate });
              toast.success(`Updated GST to ${rate}% for ${verifyOpen.product.name}`);
              setVerifyOpen(null);
              await loadProducts();
            } catch (err) {
              if (err instanceof ApiError) toast.error(err.message);
            }
          }}
        />
      )}

      {/* Label print dialog */}
      <Dialog open={!!labelProduct} onOpenChange={(o) => !o && setLabelProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">Print barcode labels — {labelProduct?.name}</DialogTitle>
          </DialogHeader>
          {labelProduct && (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {/* Controls — stay pinned above the scrolling preview */}
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="w-20">Copies</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={labelCopies}
                  onChange={(e) =>
                    setLabelCopies(Math.max(1, Math.min(60, Number(e.target.value) || 1)))
                  }
                  className="w-20"
                />
                <div className="text-[11px] text-muted-foreground">
                  Preview below scrolls · up to 60 per sheet · print uses full page layout
                </div>
              </div>
              {/* Scrollable preview — bounded so it never overruns the viewport */}
              <div
                ref={labelSheetRef}
                className="print-barcode-sheet border rounded p-3 bg-white text-slate-900 flex-1 overflow-auto min-h-0"
              >
                {Array.from({ length: labelCopies }).map((_, i) => (
                  <LabelCard key={i} product={labelProduct} />
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelProduct(null)}>
              Close
            </Button>
            <Button onClick={printLabels}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Manage serials dialog */}
      <SerialsDialog
        product={serialsProduct}
        onUnitsChanged={loadProducts}
        onClose={() => {
          setSerialsProduct(null);
          loadProducts();
        }}
      />

      {/* Add-serialised wizard */}
      <SerialisedProductWizard
        open={serialWizardOpen}
        onClose={() => setSerialWizardOpen(false)}
        onProductCreated={loadProducts}
      />
    </div>
  );
}

function SerialsDialog({
  product,
  onClose,
  onUnitsChanged,
}: {
  product: Product | null;
  onClose: () => void;
  onUnitsChanged?: () => void;
}) {
  const open = !!product;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Serials — {product?.name}</DialogTitle>
        </DialogHeader>
        {product && (
          <SerialsPanel
            product={product}
            autoScan={false}
            onUnitsChanged={onUnitsChanged}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared scan + list panel — used by the edit-mode "Manage serials" dialog and
 * by the Add-serialised wizard step 2. Owns its own API I/O for units.
 * `onUnitsChanged` lets the parent refresh its product list so the outer
 * Inventory table stock column ticks up in real time as serials are added.
 */
function SerialsPanel({
  product,
  autoScan = false,
  onUnitsChanged,
}: {
  product: Product;
  autoScan?: boolean;
  onUnitsChanged?: () => void;
}) {
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState(autoScan);
  const [manualSerial, setManualSerial] = useState('');
  const [pending, setPending] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.get<ProductUnit[]>(`/products/${product._id}/units`);
      setUnits(rows);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPending([]);
    setScanMode(autoScan);
    setManualSerial('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product._id]);

  useBarcodeScanner({
    onScan: (code) => {
      const s = code.trim();
      if (!s) return;
      setPending((prev) => {
        if (prev.includes(s)) {
          toast.info(`Already in pending list: ${s}`);
          return prev;
        }
        if (units.some((u) => u.serialNo === s)) {
          toast.error(`Already registered: ${s}`);
          return prev;
        }
        toast.success(`Added: ${s.slice(0, 40)}${s.length > 40 ? '…' : ''}`);
        return [...prev, s];
      });
    },
    enabled: scanMode,
    minLength: 4,
    charPattern: /[\x20-\x7E]/,
  });

  const addManual = () => {
    const s = manualSerial.trim();
    if (!s) return;
    setPending((prev) => {
      if (prev.includes(s)) {
        toast.info('Already in pending list');
        return prev;
      }
      if (units.some((u) => u.serialNo === s)) {
        toast.error('Already registered');
        return prev;
      }
      return [...prev, s];
    });
    setManualSerial('');
  };

  const removePending = (s: string) => {
    setPending((prev) => prev.filter((x) => x !== s));
  };

  const savePending = async () => {
    if (pending.length === 0) return;
    try {
      await api.post(`/products/${product._id}/units`, { serials: pending });
      toast.success(`Added ${pending.length} unit${pending.length === 1 ? '' : 's'}`);
      setPending([]);
      load();
      onUnitsChanged?.();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  const removeUnit = async (serialNo: string) => {
    if (!window.confirm(`Remove unit ${serialNo}? Only in-stock units can be removed.`)) return;
    try {
      await api.del(`/products/${product._id}/units/${encodeURIComponent(serialNo)}`);
      toast.success('Unit removed');
      load();
      onUnitsChanged?.();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  const statusTone: Record<string, string> = {
    in_stock: 'bg-green-100 text-green-800',
    sold: 'bg-slate-200 text-slate-700',
    returned: 'bg-amber-100 text-amber-800',
    damaged: 'bg-red-100 text-red-800',
  };
  const inStockCount = units.filter((u) => u.status === 'in_stock').length;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-md px-3 py-2">
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
            {inStockCount}
          </div>
          <div className="text-xs uppercase tracking-wide text-indigo-700/80 dark:text-indigo-300/80">
            in stock
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {units.length} total registered · count updates after each Save
        </div>
      </div>
      <div className="space-y-3 flex-1 overflow-auto">
          {/* Add section */}
          <div className="rounded border p-3 bg-muted/30 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant={scanMode ? 'default' : 'outline'}
                onClick={() => setScanMode((v) => !v)}
                className={scanMode ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
              >
                <QrCodeIcon className="w-4 h-4 mr-1" />
                {scanMode ? 'Listening… scan now' : 'Scan serials'}
              </Button>
              <div className="flex-1 flex gap-2 min-w-[300px]">
                <Input
                  value={manualSerial}
                  onChange={(e) => setManualSerial(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addManual();
                    }
                  }}
                  placeholder="Or type a serial and press Enter"
                />
                <Button type="button" variant="outline" onClick={addManual} disabled={!manualSerial.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {pending.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground font-semibold uppercase">
                  Pending ({pending.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {pending.map((s) => (
                    <div
                      key={s}
                      className="inline-flex items-center gap-1 text-xs font-mono bg-background border rounded px-2 py-1"
                    >
                      <span className="truncate max-w-[280px]" title={s}>{s}</span>
                      <button
                        onClick={() => removePending(s)}
                        className="text-muted-foreground hover:text-red-600"
                        title="Remove from pending"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <Button onClick={savePending} className="bg-indigo-600 hover:bg-indigo-700">
                  Save {pending.length} unit{pending.length === 1 ? '' : 's'}
                </Button>
              </div>
            )}
            {pending.length === 0 && (
              <div className="text-[11px] text-muted-foreground">
                {scanMode
                  ? 'Scan each unit\'s QR / serial with your scanner. Each scan queues; click Save when done.'
                  : 'Start "Scan serials" to batch-add with your USB scanner, or type serials manually.'}
              </div>
            )}
          </div>

          {/* Existing units */}
          <div className="border rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_140px_60px] gap-2 px-3 py-2 bg-muted text-[11px] font-semibold uppercase text-muted-foreground">
              <div>Serial</div>
              <div>Status</div>
              <div>Added</div>
              <div></div>
            </div>
            {loading && (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            )}
            {!loading && units.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground italic">
                No units yet. Scan or type one above.
              </div>
            )}
            {!loading && units.map((u) => (
              <div
                key={u._id}
                className="grid grid-cols-[1fr_100px_140px_60px] gap-2 px-3 py-2 text-xs border-t items-center"
              >
                <div className="font-mono truncate" title={u.serialNo}>{u.serialNo}</div>
                <div>
                  <Badge className={`${statusTone[u.status] || 'bg-muted'} text-[10px] py-0 h-5`} variant="outline">
                    {u.status}
                  </Badge>
                </div>
                <div className="text-muted-foreground">
                  {u.addedAt ? new Date(u.addedAt).toLocaleDateString('en-IN') : '—'}
                </div>
                <div className="text-right">
                  {u.status === 'in_stock' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove unit"
                      onClick={() => removeUnit(u.serialNo)}
                      className="h-7 w-7"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
  );
}

function SerialisedProductWizard({
  open,
  onClose,
  onProductCreated,
}: {
  open: boolean;
  onClose: () => void;
  onProductCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setForm({ ...EMPTY_FORM, isSerialised: true });
      setCreatedProduct(null);
      setSaving(false);
    }
  }, [open]);

  const submitStep1 = async () => {
    if (!form.name || !form.sku || !form.sellingPrice || !form.hsnCode) {
      toast.error('Name, SKU, HSN and selling price are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        isSerialised: true,
        priceIncludesGst: form.priceIncludesGst,
        category: form.category,
        brand: form.brand,
        unit: form.unit,
        purchasePrice: Number(form.purchasePrice || 0),
        sellingPrice: Number(form.sellingPrice),
        mrp: Number(form.mrp || form.sellingPrice),
        gstRate: Number(form.gstRate),
        hsnCode: form.hsnCode,
        // No opening stock — stock is derived from scanned units.
        minStock: Number(form.minStock || 0),
        reorderQty: Number(form.reorderQty || 0),
        warrantyMonths: Number(form.warrantyMonths || 0),
      };
      const product = await api.post<Product>('/products', payload);
      setCreatedProduct(product);
      setStep(2);
      toast.success(`${product.name} created. Now scan each unit.`);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    onClose();
    if (createdProduct) onProductCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-indigo-600" />
            {step === 1
              ? 'Add serialised product — Step 1 of 2'
              : `Scan units for ${createdProduct?.name}`}
          </DialogTitle>
          <div className="text-xs text-muted-foreground">
            {step === 1
              ? 'Set up the product master (part no, name, GST, pricing). Next step: scan each physical unit.'
              : 'Plug in your USB scanner. Each scan registers one unit under this product. Click Save to commit, repeat as more units arrive, then click Done.'}
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3 py-2 overflow-y-auto pr-1">
            <Field label="Name *" className="col-span-2">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Dell XPS 13 9315 i7"
              />
            </Field>
            <Field label="Part No. / SKU *">
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="Model identifier"
              />
            </Field>

            <Field label="HSN / SAC code *">
              <HsnAutocomplete
                value={form.hsnCode}
                onChange={(v) => setForm({ ...form, hsnCode: v })}
                onRateSuggest={(rate) => setForm({ ...form, gstRate: String(rate) })}
                appliedRate={Number(form.gstRate || 0)}
              />
            </Field>
            <Field label="Category">
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>
            <Field label="Brand">
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </Field>

            <Field label="Unit">
              <select
                className="h-9 border rounded-md px-2 bg-background w-full"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="GST rate %">
              <select
                className="h-9 border rounded-md px-2 bg-background w-full"
                value={form.gstRate}
                onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
              >
                {GST_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </Field>
            <Field label="Warranty (months)">
              <Input
                type="number"
                min={0}
                value={form.warrantyMonths}
                onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })}
                placeholder="0 = no warranty"
              />
            </Field>

            <Field label="Purchase price (₹)">
              <Input
                type="number"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
              />
            </Field>
            <Field label="Selling price (₹) *">
              <Input
                type="number"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
              />
            </Field>
            <Field label="MRP (₹)">
              <Input
                type="number"
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              />
            </Field>

            <div className="col-span-3">
              <PriceIncludesGstToggle
                checked={form.priceIncludesGst}
                onChange={(v) => setForm({ ...form, priceIncludesGst: v })}
                sellingPrice={Number(form.sellingPrice || 0)}
                gstRate={Number(form.gstRate || 0)}
              />
            </div>

            <Field label="Min stock (alert)">
              <Input
                type="number"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </Field>
            <Field label="Reorder qty">
              <Input
                type="number"
                value={form.reorderQty}
                onChange={(e) => setForm({ ...form, reorderQty: e.target.value })}
              />
            </Field>
            <div /> {/* spacer */}

            <div className="col-span-3 text-xs bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-md px-3 py-2 flex items-center gap-2">
              <Badge className="bg-indigo-600 text-[10px] py-0 h-5">Serialised</Badge>
              <span>
                No opening-stock field — stock is set automatically as you scan individual
                units in the next step.
              </span>
            </div>
          </div>
        )}

        {step === 2 && createdProduct && (
          <div className="py-2 flex flex-col gap-3 flex-1 overflow-hidden">
            <SerialsPanel
              product={createdProduct}
              autoScan
              onUnitsChanged={onProductCreated}
            />
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={finish}>
                Cancel
              </Button>
              <Button
                onClick={submitStep1}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? 'Creating…' : 'Next: Scan units →'}
              </Button>
            </>
          ) : (
            <Button onClick={finish} className="bg-indigo-600 hover:bg-indigo-700">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warning'
        ? 'text-orange-600'
        : '';
  return (
    <Card className="py-0">
      <CardContent className="p-2 flex items-center gap-2">
        <div className={`w-7 h-7 rounded-md bg-muted flex items-center justify-center ${toneClass}`}>
          {icon}
        </div>
        <div className="leading-tight">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className={`text-base font-bold ${toneClass}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className || ''}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Inline HSN cell for the inventory table. Shows the code, a tiny status pill
 * derived from the prefetched audit, and a Verify button that opens a
 * detail dialog with prescribed rate(s) + a one-click rate fix.
 */
function HsnCell({
  product,
  row,
  onVerify,
}: {
  product: Product;
  row?: HsnAuditRow;
  onVerify: () => void;
}) {
  const status: HsnStatus | null = row?.status ?? null;
  const pill = status ? HSN_PILL[status] : null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs">{product.hsnCode || '—'}</span>
      {pill && (
        <Badge
          variant="secondary"
          className={`${pill.tone} border-transparent text-[10px] py-0 h-5`}
          title={
            row?.masterDescription ||
            (status === 'unknown_hsn' ? 'Not in HSN master' : '')
          }
        >
          <pill.Icon className="w-3 h-3 mr-0.5" />
          {pill.label}
        </Badge>
      )}
      <Button
        size="icon"
        variant="ghost"
        title="Verify HSN against master"
        onClick={onVerify}
        className="h-6 w-6"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

/**
 * Dialog opened by the inline Verify button. Shows: master description,
 * prescribed rate(s), applied rate, and offers a one-tap "Apply prescribed
 * rate" fix when there's a mismatch. For deeper edits (changing the HSN
 * itself), the user is sent to the row's edit form or the HSN audit page.
 */
function HsnVerifyDialog({
  product,
  row,
  onClose,
  onApplyRate,
}: {
  product: Product;
  row?: HsnAuditRow;
  onClose: () => void;
  onApplyRate: (rate: number) => void;
}) {
  const status = row?.status;
  const pill = status ? HSN_PILL[status] : null;
  const mismatch = status === 'rate_mismatch';
  const prescribed = row?.prescribedRates || [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            HSN verification
            {pill && (
              <Badge variant="secondary" className={`${pill.tone} border-transparent`}>
                <pill.Icon className="w-3 h-3 mr-1" />
                {pill.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
            <span className="text-muted-foreground">Product</span>
            <span className="font-medium truncate">{product.name}</span>

            <span className="text-muted-foreground">SKU</span>
            <span className="font-mono text-xs">{product.sku}</span>

            <span className="text-muted-foreground">HSN code</span>
            <span className="font-mono">
              {product.hsnCode || <em className="text-rose-500">missing</em>}
              {row?.kind && (
                <span className="text-[10px] text-muted-foreground ml-1 uppercase">
                  {row.kind}
                </span>
              )}
              {row?.digits ? (
                <span className="text-[10px] text-muted-foreground ml-1">
                  ({row.digits}-digit)
                </span>
              ) : null}
            </span>

            <span className="text-muted-foreground">Description</span>
            <span className="text-xs">
              {row?.masterDescription || (
                <span className="text-muted-foreground italic">
                  Not in master — verify manually with your CA.
                </span>
              )}
            </span>

            <span className="text-muted-foreground">Applied rate</span>
            <span>
              <strong>{product.gstRate}%</strong>
            </span>

            <span className="text-muted-foreground">Prescribed</span>
            <span>
              {prescribed.length > 0 ? (
                <strong className={mismatch ? 'text-amber-700 dark:text-amber-300' : ''}>
                  {prescribed.map((r) => `${r}%`).join(' / ')}
                </strong>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>

          {mismatch && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-xs">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-900 dark:text-amber-200">
                    Rate mismatch
                  </div>
                  <p className="text-amber-800 dark:text-amber-200/80 mt-1">
                    The HSN master prescribes{' '}
                    <strong>{prescribed.map((r) => `${r}%`).join(' / ')}</strong>, but
                    this product charges <strong>{product.gstRate}%</strong>. Fix it
                    before filing GSTR-1.
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === 'unknown_hsn' && (
            <div className="rounded-md border border-slate-300 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-xs">
              The HSN <span className="font-mono">{product.hsnCode}</span> is well-formed
              but not in our bundled master. This is informational — your code may still
              be correct (the master ships with ~600 common codes). Double-check the
              prescribed rate with the GST portal if you're unsure.
            </div>
          )}

          {status === 'invalid_format' && (
            <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-700 p-3 text-xs">
              <div className="flex items-start gap-2">
                <ShieldX className="w-4 h-4 text-rose-700 dark:text-rose-300 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-900 dark:text-rose-200">
                    Invalid format
                  </div>
                  <p className="text-rose-800 dark:text-rose-200/80 mt-1">
                    HSN must be 2, 4, 6 or 8 digits. SAC must be 6 digits starting with
                    99. Open the product and fix the code.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {mismatch && prescribed[0] !== undefined && (
            <Button
              onClick={() => onApplyRate(prescribed[0])}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Apply {prescribed[0]}%
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * GST-mode toggle with a live preview of how the selling price breaks down.
 * `checked = true` means the selling price already includes GST and tax is
 * extracted from it at sale time (so the customer pays exactly the listed price).
 * `checked = false` means tax is added on top at sale time.
 */
function PriceIncludesGstToggle({
  checked,
  onChange,
  sellingPrice,
  gstRate,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  sellingPrice: number;
  gstRate: number;
}) {
  const fmt = (n: number) => `₹${n.toFixed(2)}`;
  const hasPrice = sellingPrice > 0 && gstRate > 0;
  let preview: React.ReactNode = null;
  if (hasPrice) {
    if (checked) {
      // Inclusive: extract tax out of the price
      const taxable = sellingPrice / (1 + gstRate / 100);
      const tax = sellingPrice - taxable;
      preview = (
        <>
          Customer pays <b>{fmt(sellingPrice)}</b> · Taxable {fmt(taxable)} + GST {fmt(tax)} ({gstRate}%)
        </>
      );
    } else {
      // Exclusive: tax added on top
      const tax = sellingPrice * (gstRate / 100);
      const total = sellingPrice + tax;
      preview = (
        <>
          Customer pays <b>{fmt(total)}</b> · {fmt(sellingPrice)} + GST {fmt(tax)} ({gstRate}%)
        </>
      );
    }
  }
  return (
    <label className="flex items-start gap-3 cursor-pointer bg-muted/40 border rounded-md px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          Selling price <b>includes</b> GST
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            {checked
              ? '(inclusive — GST is extracted from the price)'
              : '(exclusive — GST is added on top at checkout)'}
          </span>
        </div>
        {preview && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{preview}</div>
        )}
      </div>
    </label>
  );
}

function pickBarcodeFormat(code?: string): 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' {
  const v = (code || '').trim();
  if (/^\d{13}$/.test(v)) return 'EAN13';
  if (/^\d{12}$/.test(v)) return 'UPC';
  if (/^\d{8}$/.test(v)) return 'EAN8';
  return 'CODE128';
}

function LabelCard({ product }: { product: Product }) {
  return (
    <div className="border rounded p-2 text-[10px] text-center">
      <div className="font-bold truncate">{product.name}</div>
      <div>{product.brand}</div>
      <div className="my-1 flex justify-center">
        <Barcode
          value={product.barcode || '0'}
          format={pickBarcodeFormat(product.barcode)}
          displayValue
          height={40}
          width={1.3}
          fontSize={10}
          margin={0}
        />
      </div>
      <div className="font-bold">₹{product.sellingPrice.toFixed(2)}</div>
      <div className="text-[9px] text-slate-500">SKU {product.sku}</div>
    </div>
  );
}

/**
 * Reorder dialog. Opens with one low-stock product (`seed`) and lets the
 * cashier add more low-stock items, pick a supplier, tune quantities, then
 * fire POST /purchases with status:'draft'. The draft PO can then be
 * reviewed, edited and submitted from /dashboard/purchases.
 *
 * Default quantity per line is reorderQty (falling back to minStock, then 1)
 * so the operator usually only has to confirm the supplier and click Create.
 */
interface ReorderLine {
  productId: string;
  name: string;
  sku: string;
  purchasePrice: number;
  gstRate: number;
  hsnCode: string;
  quantity: number;
}

interface SupplierLite {
  _id: string;
  name: string;
  gstNumber?: string;
  stateCode?: string;
}

function ReorderDialog({
  seed,
  allProducts,
  onClose,
  onCreated,
}: {
  seed: Product;
  allProducts: Product[];
  onClose: () => void;
  onCreated: (poId: string) => void;
}) {
  const defaultQtyFor = (p: Product) =>
    Number(p.reorderQty || p.minStock || 1);

  const toLine = (p: Product): ReorderLine => ({
    productId: p._id,
    name: p.name,
    sku: p.sku,
    purchasePrice: Number(p.purchasePrice || 0),
    gstRate: Number(p.gstRate || 0),
    hsnCode: p.hsnCode || '',
    quantity: defaultQtyFor(p),
  });

  const [lines, setLines] = useState<ReorderLine[]>([toLine(seed)]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [addSearch, setAddSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<SupplierLite[]>('/suppliers')
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  // Low-stock products NOT already on the draft, filtered by the search box.
  const candidates = allProducts.filter((p) => {
    if (p.stock > (p.minStock || 0)) return false;
    if (lines.some((l) => l.productId === p._id)) return false;
    const q = addSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  });

  const addLine = (p: Product) => {
    setLines((prev) => [...prev, toLine(p)]);
    setAddSearch('');
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const updateQty = (productId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, qty) } : l)),
    );
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0);
  const tax = lines.reduce(
    (s, l) => s + l.quantity * l.purchasePrice * (l.gstRate / 100),
    0,
  );
  const grandTotal = subtotal + tax;

  const create = async () => {
    if (!supplierId) {
      toast.error('Pick a supplier first');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one product to reorder');
      return;
    }
    setSubmitting(true);
    try {
      // Backend POST /purchases accepts a draft PO with these line fields.
      // The PO will land on /dashboard/purchases?po=<id> for review + submit.
      const res = await api.post<{ _id: string; poNumber: string }>('/purchases', {
        supplierId,
        status: 'draft',
        items: lines.map((l) => ({
          productId: l.productId,
          orderedQty: l.quantity,
          purchasePrice: l.purchasePrice,
          gstRate: l.gstRate,
        })),
      });
      toast.success(`Draft PO ${res.poNumber} created`);
      onCreated(res._id);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Could not create draft PO');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-600" />
            Reorder from supplier
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Supplier */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Supplier *</Label>
            <select
              className="h-9 w-full border rounded-md px-2 bg-background text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">— Pick a supplier —</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                  {s.gstNumber ? ` · ${s.gstNumber}` : ''}
                </option>
              ))}
            </select>
            {suppliers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No suppliers yet. Add one under{' '}
                <a href="/dashboard/suppliers" className="text-blue-600 underline">
                  Suppliers
                </a>{' '}
                first.
              </p>
            )}
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Items ({lines.length})</Label>
            <div className="border rounded-md divide-y">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      SKU {l.sku} · ₹{l.purchasePrice.toFixed(2)} × {l.gstRate}% GST
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => updateQty(l.productId, Number(e.target.value))}
                    className="w-20 text-right"
                  />
                  <div className="w-24 text-right font-mono text-sm">
                    ₹{(l.quantity * l.purchasePrice * (1 + l.gstRate / 100)).toFixed(2)}
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(l.productId)}
                      className="text-muted-foreground hover:text-red-600 p-1"
                      title="Remove from draft"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add more — searches the rest of low-stock inventory. */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Add another low-stock item</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search by name / SKU / barcode"
                className="pl-8"
              />
            </div>
            {addSearch.trim() && (
              <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
                {candidates.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-2 italic">
                    No matching low-stock products.
                  </div>
                ) : (
                  candidates.slice(0, 8).map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => addLine(p)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.stock} in stock · min {p.minStock}
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-blue-600" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="bg-muted/40 rounded-md p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span className="font-mono">₹{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t">
              <span>Grand total</span>
              <span className="font-mono">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={submitting || !supplierId || lines.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting ? 'Creating…' : `Create draft PO (${lines.length} item${lines.length === 1 ? '' : 's'})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
