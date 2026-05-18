'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Download, RefreshCcw, BookOpen, ShoppingCart, Truck, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { Sale, StoreInfo } from '@/lib/types';

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOnly = (d: string | Date) => new Date(d).toLocaleDateString('en-IN');

// ---------- date range helpers ----------
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function defaultRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: ymd(start), to: ymd(today) };
}

// ---------- CSV helper ----------
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Sales register · Purchase register · Aging · Day book — period-wise listings with CSV export.
        </p>
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="grid grid-cols-4 max-w-2xl">
          <TabsTrigger value="sales"><ShoppingCart className="w-4 h-4 mr-1" /> Sales</TabsTrigger>
          <TabsTrigger value="purchases"><Truck className="w-4 h-4 mr-1" /> Purchases</TabsTrigger>
          <TabsTrigger value="aging"><Clock className="w-4 h-4 mr-1" /> Aging</TabsTrigger>
          <TabsTrigger value="daybook"><BookOpen className="w-4 h-4 mr-1" /> Day Book</TabsTrigger>
        </TabsList>

        <TabsContent value="sales"><SalesRegister /></TabsContent>
        <TabsContent value="purchases"><PurchaseRegister /></TabsContent>
        <TabsContent value="aging"><AgingReport /></TabsContent>
        <TabsContent value="daybook"><DayBook /></TabsContent>
      </Tabs>
    </div>
  );
}

// =================================================================
// Sales Register
// =================================================================

function SalesRegister() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [sales, setSales] = useState<Sale[]>([]);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [salesData, storeData] = await Promise.all([
        api.get<Sale[]>(`/sales?from=${from}&to=${to}T23:59:59&limit=500`),
        api.get<StoreInfo>('/store/me').catch(() => null),
      ]);
      setSales(salesData);
      setStore(storeData);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = useMemo(() => {
    let count = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0, grand = 0;
    for (const s of sales) {
      count += 1;
      grand += Number(s.grandTotal || 0);
      for (const it of s.items || []) {
        taxable += Number(it.taxableAmount || 0);
        cgst += Number(it.cgst || 0);
        sgst += Number(it.sgst || 0);
        igst += Number(it.igst || 0);
      }
    }
    return { count, taxable, cgst, sgst, igst, totalTax: cgst + sgst + igst, grand };
  }, [sales]);

  const exportCsv = () => {
    const header = [
      'Invoice', 'Date', 'Customer', 'Phone', 'GSTIN', 'Place of Supply',
      'Taxable', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Round-off', 'Grand Total', 'Payment Status',
    ];
    const rows = sales.map((s) => {
      let taxable = 0, cgst = 0, sgst = 0, igst = 0, totalTax = 0;
      let interState = false;
      for (const it of s.items || []) {
        taxable += Number(it.taxableAmount || 0);
        cgst += Number(it.cgst || 0);
        sgst += Number(it.sgst || 0);
        igst += Number(it.igst || 0);
        totalTax += Number(it.totalTax || 0);
        if (Number(it.igst || 0) > 0) interState = true;
      }
      return [
        s.invoiceNumber,
        dateOnly(s.createdAt),
        s.customerSnapshot?.name || 'Walk-in',
        s.customerSnapshot?.phone || '',
        s.customerSnapshot?.gstNumber || '',
        interState ? 'Inter-State' : 'Intra-State',
        taxable.toFixed(2), cgst.toFixed(2), sgst.toFixed(2), igst.toFixed(2),
        totalTax.toFixed(2), Number(s.roundOff || 0).toFixed(2),
        Number(s.grandTotal || 0).toFixed(2),
        s.paymentStatus,
      ];
    });
    downloadCsv(`sales-register-${from}-to-${to}.csv`, [header, ...rows]);
    toast.success(`Exported ${sales.length} invoices`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Sales Register</CardTitle>
            <CardDescription>
              Period {dateOnly(from)} → {dateOnly(to)}. {store?.gstNumber ? `GSTIN ${store.gstNumber}` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <DateRange from={from} to={to} onChange={(f, t) => setRange({ from: f, to: t })} />
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
            </Button>
            <Button onClick={exportCsv} disabled={sales.length === 0} className="bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs mb-3 bg-muted/40 rounded-md p-3">
          <Stat label="Invoices" value={String(totals.count)} />
          <Stat label="Taxable" value={money(totals.taxable)} />
          <Stat label="CGST" value={money(totals.cgst)} />
          <Stat label="SGST" value={money(totals.sgst)} />
          <Stat label="IGST" value={money(totals.igst)} />
          <Stat label="Grand Total" value={money(totals.grand)} bold />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>POS</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground italic py-6">
                    No invoices in this period.
                  </TableCell>
                </TableRow>
              ) : sales.map((s) => {
                let taxable = 0, cgst = 0, sgst = 0, igst = 0;
                let interState = false;
                for (const it of s.items || []) {
                  taxable += Number(it.taxableAmount || 0);
                  cgst += Number(it.cgst || 0);
                  sgst += Number(it.sgst || 0);
                  igst += Number(it.igst || 0);
                  if (Number(it.igst || 0) > 0) interState = true;
                }
                return (
                  <TableRow key={s._id}>
                    <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                    <TableCell className="text-xs">{dateOnly(s.createdAt)}</TableCell>
                    <TableCell className="max-w-40 truncate">{s.customerSnapshot?.name || 'Walk-in'}</TableCell>
                    <TableCell>
                      <Badge variant={interState ? 'destructive' : 'secondary'} className="text-[10px]">
                        {interState ? 'IGST' : 'CGST/SGST'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(taxable)}</TableCell>
                    <TableCell className="text-right font-mono">{money(cgst)}</TableCell>
                    <TableCell className="text-right font-mono">{money(sgst)}</TableCell>
                    <TableCell className="text-right font-mono">{money(igst)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{money(s.grandTotal)}</TableCell>
                    <TableCell>
                      <Badge variant={s.paymentStatus === 'paid' ? 'secondary' : s.paymentStatus === 'credit' ? 'destructive' : 'outline'} className="text-[10px]">
                        {s.paymentStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =================================================================
// Purchase Register
// =================================================================

interface PoLite {
  _id: string;
  poNumber: string;
  storeId: string;
  supplierId: string;
  supplierSnapshot: { name?: string; gstNumber?: string };
  status: string;
  paymentStatus: string;
  subtotal: number;
  totalTax: number;
  grandTotal: number;
  amountPaid: number;
  items: { cgst: number; sgst: number; igst: number; taxableAmount: number; receivedQty: number }[];
  createdAt: string;
}

function PurchaseRegister() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [pos, setPos] = useState<PoLite[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // /api/purchases doesn't currently filter by date — fetch and filter client-side.
      const data = await api.get<PoLite[]>('/purchases?limit=500');
      setPos(data.filter((p) => {
        const t = new Date(p.createdAt).getTime();
        return t >= new Date(from).getTime() && t <= new Date(`${to}T23:59:59`).getTime();
      }));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = useMemo(() => {
    let count = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0, grand = 0;
    for (const p of pos) {
      count += 1;
      grand += Number(p.grandTotal || 0);
      for (const it of p.items || []) {
        taxable += Number(it.taxableAmount || 0);
        cgst += Number(it.cgst || 0);
        sgst += Number(it.sgst || 0);
        igst += Number(it.igst || 0);
      }
    }
    return { count, taxable, cgst, sgst, igst, grand };
  }, [pos]);

  const exportCsv = () => {
    const header = ['PO #', 'Date', 'Supplier', 'GSTIN', 'Status', 'Payment', 'Taxable', 'CGST', 'SGST', 'IGST', 'Grand Total', 'Amount Paid', 'Outstanding'];
    const rows = pos.map((p) => {
      let taxable = 0, cgst = 0, sgst = 0, igst = 0;
      for (const it of p.items || []) {
        taxable += Number(it.taxableAmount || 0);
        cgst += Number(it.cgst || 0);
        sgst += Number(it.sgst || 0);
        igst += Number(it.igst || 0);
      }
      return [
        p.poNumber, dateOnly(p.createdAt),
        p.supplierSnapshot?.name || '', p.supplierSnapshot?.gstNumber || '',
        p.status, p.paymentStatus,
        taxable.toFixed(2), cgst.toFixed(2), sgst.toFixed(2), igst.toFixed(2),
        Number(p.grandTotal || 0).toFixed(2),
        Number(p.amountPaid || 0).toFixed(2),
        Number((p.grandTotal || 0) - (p.amountPaid || 0)).toFixed(2),
      ];
    });
    downloadCsv(`purchase-register-${from}-to-${to}.csv`, [header, ...rows]);
    toast.success(`Exported ${pos.length} purchases`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Purchase Register</CardTitle>
            <CardDescription>Period {dateOnly(from)} → {dateOnly(to)}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <DateRange from={from} to={to} onChange={(f, t) => setRange({ from: f, to: t })} />
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
            </Button>
            <Button onClick={exportCsv} disabled={pos.length === 0} className="bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs mb-3 bg-muted/40 rounded-md p-3">
          <Stat label="Purchases" value={String(totals.count)} />
          <Stat label="Taxable" value={money(totals.taxable)} />
          <Stat label="CGST" value={money(totals.cgst)} />
          <Stat label="SGST" value={money(totals.sgst)} />
          <Stat label="IGST" value={money(totals.igst)} />
          <Stat label="Grand Total" value={money(totals.grand)} bold />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pos.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground italic py-6">No purchases in this period.</TableCell></TableRow>
              ) : pos.map((p) => {
                let taxable = 0, cgst = 0, sgst = 0, igst = 0;
                for (const it of p.items || []) {
                  taxable += Number(it.taxableAmount || 0);
                  cgst += Number(it.cgst || 0);
                  sgst += Number(it.sgst || 0);
                  igst += Number(it.igst || 0);
                }
                const outstanding = Number(p.grandTotal || 0) - Number(p.amountPaid || 0);
                return (
                  <TableRow key={p._id}>
                    <TableCell className="font-mono text-xs">{p.poNumber}</TableCell>
                    <TableCell className="text-xs">{dateOnly(p.createdAt)}</TableCell>
                    <TableCell className="max-w-40 truncate">{p.supplierSnapshot?.name || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{p.status}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{money(taxable)}</TableCell>
                    <TableCell className="text-right font-mono">{money(cgst)}</TableCell>
                    <TableCell className="text-right font-mono">{money(sgst)}</TableCell>
                    <TableCell className="text-right font-mono">{money(igst)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{money(p.grandTotal)}</TableCell>
                    <TableCell className={`text-right font-mono ${outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {money(outstanding)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =================================================================
// Aging Report
// =================================================================

interface AgingRow {
  customerId?: string | null;
  supplierId?: string;
  customerName?: string;
  supplierName?: string;
  phone: string;
  gstNumber?: string;
  totalDue: number;
  buckets: Record<string, number>;
  invoices?: { invoiceNumber: string; invoiceDate: string; ageDays: number; bucket: string; due: number }[];
  purchases?: { poNumber: string; poDate: string; ageDays: number; bucket: string; due: number }[];
}
interface AgingResp {
  bucketLabels?: string[];
  receivables: { rows: AgingRow[]; buckets: Record<string, number>; total: number };
  payables: { rows: AgingRow[]; buckets: Record<string, number>; total: number };
}

function AgingReport() {
  const [data, setData] = useState<AgingResp | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<AgingResp>('/reports/aging'));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgingTable
          title="Receivables (Customer dues)"
          tone="emerald"
          data={data?.receivables}
          labels={data?.bucketLabels || ['0-30', '31-60', '61-90', '90+']}
          rowName={(r) => r.customerName || ''}
          rowDocs={(r) => r.invoices?.map((i) => ({ doc: i.invoiceNumber, date: i.invoiceDate, ageDays: i.ageDays, due: i.due, bucket: i.bucket })) || []}
        />
        <AgingTable
          title="Payables (Supplier dues)"
          tone="red"
          data={data?.payables}
          labels={data?.bucketLabels || ['0-30', '31-60', '61-90', '90+']}
          rowName={(r) => r.supplierName || ''}
          rowDocs={(r) => r.purchases?.map((p) => ({ doc: p.poNumber, date: p.poDate, ageDays: p.ageDays, due: p.due, bucket: p.bucket })) || []}
        />
      </div>
    </div>
  );
}

function AgingTable({
  title, tone, data, labels, rowName, rowDocs,
}: {
  title: string;
  tone: 'emerald' | 'red';
  data: AgingResp['receivables'] | undefined;
  labels: string[];
  rowName: (r: AgingRow) => string;
  rowDocs: (r: AgingRow) => { doc: string; date: string; ageDays: number; due: number; bucket: string }[];
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const toneCls = tone === 'emerald' ? 'text-emerald-600' : 'text-red-600';
  const total = data?.total || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{title}</span>
          <span className={`font-mono ${toneCls}`}>{money(total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-2 text-xs mb-3`} style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
          {labels.map((b) => (
            <div key={b} className="border rounded p-2 text-center">
              <div className="text-muted-foreground">{b} days</div>
              <div className="font-bold font-mono">{money(data?.buckets[b] || 0)}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                {labels.map((l) => (
                  <TableHead key={l} className="text-right">{l}</TableHead>
                ))}
                <TableHead className="text-right">Total Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data || data.rows.length === 0 ? (
                <TableRow><TableCell colSpan={2 + labels.length} className="text-center text-muted-foreground italic py-6">No outstanding dues.</TableCell></TableRow>
              ) : data.rows.map((r) => {
                const key = r.customerId || r.supplierId || rowName(r);
                const expanded = expandedKey === String(key);
                return (
                  <>
                    <TableRow
                      key={String(key)}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedKey(expanded ? null : String(key))}
                    >
                      <TableCell>
                        <div className="font-medium">{rowName(r)}</div>
                        {r.phone && <div className="text-[10px] text-muted-foreground">{r.phone}</div>}
                      </TableCell>
                      {labels.map((l, idx) => {
                        const v = r.buckets[l] || 0;
                        const className = idx === labels.length - 1
                          ? (v > 0 ? 'text-red-600 font-semibold' : '')
                          : idx >= 2
                            ? (v > 0 ? 'text-amber-600' : '')
                            : '';
                        return (
                          <TableCell key={l} className={`text-right font-mono ${className}`}>{money(v)}</TableCell>
                        );
                      })}
                      <TableCell className={`text-right font-mono font-semibold ${toneCls}`}>{money(r.totalDue)}</TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={`${String(key)}-detail`} className="bg-muted/20">
                        <TableCell colSpan={2 + labels.length} className="p-0">
                          <div className="p-3 text-xs space-y-1">
                            {rowDocs(r).map((d, i) => (
                              <div key={i} className="grid grid-cols-5 gap-2 py-1 border-b last:border-0">
                                <div className="font-mono">{d.doc}</div>
                                <div>{dateOnly(d.date)}</div>
                                <div>{d.ageDays} days</div>
                                <div><Badge variant="outline" className="text-[10px]">{d.bucket}</Badge></div>
                                <div className="text-right font-mono font-semibold">{money(d.due)}</div>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =================================================================
// Day Book
// =================================================================

interface DayBookEntry {
  _id: string;
  storeId: string;
  entryType: 'debit' | 'credit';
  accountType: string;
  accountId?: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  narration?: string;
  isAutoGenerated?: boolean;
  createdAt: string;
}

function DayBook() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [rows, setRows] = useState<DayBookEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', `${to}T23:59:59`);
      setRows(await api.get<DayBookEntry[]>(`/accounting/day-book?${params}`));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = useMemo(() => {
    const dr = rows.filter((r) => r.entryType === 'debit').reduce((s, r) => s + r.amount, 0);
    const cr = rows.filter((r) => r.entryType === 'credit').reduce((s, r) => s + r.amount, 0);
    return { dr, cr, balanced: Math.abs(dr - cr) < 0.01 };
  }, [rows]);

  const exportCsv = () => {
    const header = ['Time', 'Type', 'Account Type', 'Reference', 'Narration', 'Debit', 'Credit'];
    const data = rows.map((r) => [
      new Date(r.createdAt).toLocaleString('en-IN'),
      r.entryType, r.accountType, r.referenceType || '', r.narration || '',
      r.entryType === 'debit' ? r.amount.toFixed(2) : '',
      r.entryType === 'credit' ? r.amount.toFixed(2) : '',
    ]);
    downloadCsv(`daybook-${from}-to-${to}.csv`, [header, ...data]);
    toast.success(`Exported ${rows.length} entries`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Day Book</CardTitle>
            <CardDescription>Chronological ledger entries — every Dr and Cr posted in the period.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <DateRange from={from} to={to} onChange={(f, t) => setRange({ from: f, to: t })} />
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
            </Button>
            <Button onClick={exportCsv} disabled={rows.length === 0} className="bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-xs mb-3 bg-muted/40 rounded-md p-3">
          <Stat label="Entries" value={String(rows.length)} />
          <Stat label="Total Debits" value={money(totals.dr)} bold />
          <Stat
            label="Total Credits"
            value={money(totals.cr)}
            bold
            tone={totals.balanced ? 'emerald' : 'red'}
            hint={totals.balanced ? 'Σ Dr = Σ Cr ✓' : '✗ Out of balance'}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Account type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground italic py-6">No ledger entries in this period.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{r.accountType}</Badge>
                    {r.isAutoGenerated && <span className="text-[10px] text-muted-foreground ml-1">auto</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.referenceType ? <Badge variant="secondary" className="text-[10px]">{r.referenceType}</Badge> : '—'}
                  </TableCell>
                  <TableCell className="text-xs max-w-72 truncate" title={r.narration}>{r.narration || '—'}</TableCell>
                  <TableCell className="text-right font-mono">{r.entryType === 'debit' ? money(r.amount) : ''}</TableCell>
                  <TableCell className="text-right font-mono">{r.entryType === 'credit' ? money(r.amount) : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =================================================================
// Helpers
// =================================================================

function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  return (
    <div className="flex gap-2 items-end">
      <div>
        <Label className="text-[10px] uppercase">From</Label>
        <Input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className="h-9 w-36" />
      </div>
      <div>
        <Label className="text-[10px] uppercase">To</Label>
        <Input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className="h-9 w-36" />
      </div>
    </div>
  );
}

function Stat({
  label, value, bold, tone, hint,
}: {
  label: string; value: string; bold?: boolean;
  tone?: 'emerald' | 'red'; hint?: string;
}) {
  const toneCls = tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : '';
  return (
    <div>
      <div className="text-muted-foreground uppercase text-[10px]">{label}</div>
      <div className={`font-mono ${bold ? 'font-bold' : ''} ${toneCls}`}>{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
