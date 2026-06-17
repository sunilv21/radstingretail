'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Barcode, Search, Eye, RefreshCcw, Share2, MessageCircle, Mail, Link as LinkIcon, Printer, Undo2, FileCheck2, IndianRupee } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import type { Sale, StoreInfo } from '@/lib/types';
import { toast } from 'sonner';
import { billShareUrl, whatsappLink, mailtoLink, copyToClipboard } from '@/lib/share-invoice';
import { printInvoice } from '@/lib/print-invoice';

const SALES_PATH = '/sales?limit=100';

export default function SalesHistoryPage() {
  // Seed from cache so revisiting renders instantly (no skeleton flash).
  const cachedSales = api.peek<Sale[]>(SALES_PATH);
  const [sales, setSales] = useState<Sale[]>(cachedSales ?? []);
  const [store, setStore] = useState<StoreInfo | null>(api.peek<StoreInfo>('/store/me') ?? null);
  const [loading, setLoading] = useState(!cachedSales);
  const [searchTerm, setSearchTerm] = useState('');
  // Status filter pills. 'all' shows everything; the rest narrow by
  // either paymentStatus (paid / partial / credit) or top-level
  // status (returned). 'today' filters by created-at = today.
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'paid' | 'credit' | 'partial' | 'returned' | 'today'
  >('all');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [shareFor, setShareFor] = useState<Sale | null>(null);
  const [returnFor, setReturnFor] = useState<Sale | null>(null);
  const [payFor, setPayFor] = useState<Sale | null>(null);

  const load = async () => {
    if (api.peek<Sale[]>(SALES_PATH) === undefined) setLoading(true);
    try {
      const [rows, s] = await Promise.all([
        api.get<Sale[]>(SALES_PATH),
        api.get<StoreInfo>('/store/me').catch(() => null),
      ]);
      setSales(rows);
      setStore(s);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const share = async (sale: Sale, how: 'wa' | 'mail' | 'copy' | 'print') => {
    if (how === 'wa') {
      if (!sale.customerSnapshot?.phone) {
        toast.error('Customer phone missing on this bill');
        return;
      }
      // If WhatsApp API is configured, send automatically; else open wa.me fallback.
      if (store?.whatsapp?.configured) {
        try {
          const res = await api.post<{ sentTo?: string; messageId?: string }>(
            `/sales/${sale._id}/whatsapp`,
            {},
          );
          toast.success(`Bill sent on WhatsApp to ${res.sentTo || sale.customerSnapshot.phone}`);
        } catch (err) {
          if (err instanceof ApiError) toast.error(`WhatsApp send failed — ${err.message}`);
          else toast.error('WhatsApp send failed');
        }
        return;
      }
      const url = whatsappLink(sale, store);
      if (!url) {
        toast.error('Customer phone missing on this bill');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (how === 'mail') {
      const url = mailtoLink(sale, store);
      if (!url) {
        toast.error('Customer email missing on this bill');
        return;
      }
      window.location.href = url;
    } else if (how === 'copy') {
      const url = billShareUrl(sale.shareToken || sale._id);
      copyToClipboard(url).then((ok) => {
        if (ok) toast.success('Bill link copied');
        else toast.error('Copy failed — try again');
      });
    } else if (how === 'print') {
      printInvoice(sale, store);
    }
  };

  const isToday = (iso: string) =>
    new Date(iso).toDateString() === new Date().toDateString();

  const filtered = sales.filter((s) => {
    // Status filter first (cheap)
    if (statusFilter === 'returned' && s.status !== 'returned') return false;
    if (statusFilter === 'paid' && s.paymentStatus !== 'paid') return false;
    if (statusFilter === 'credit' && s.paymentStatus !== 'credit') return false;
    if (statusFilter === 'partial' && s.paymentStatus !== 'partial') return false;
    if (statusFilter === 'today' && !isToday(s.createdAt)) return false;
    // Then text search
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.invoiceNumber?.toLowerCase().includes(q) ||
      s.customerSnapshot?.name?.toLowerCase().includes(q) ||
      s.customerSnapshot?.phone?.toLowerCase().includes(q)
    );
  });

  // Counts for the filter pill badges (computed once over the whole set
  // — cheap because we already have `sales` in memory).
  const counts = {
    all: sales.length,
    paid: sales.filter((s) => s.paymentStatus === 'paid' && s.status !== 'returned').length,
    credit: sales.filter((s) => s.paymentStatus === 'credit').length,
    partial: sales.filter((s) => s.paymentStatus === 'partial').length,
    returned: sales.filter((s) => s.status === 'returned').length,
    today: sales.filter((s) => isToday(s.createdAt)).length,
  };

  const totalToday = sales
    .filter((s) => new Date(s.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + s.grandTotal, 0);

  const totalAll = sales.reduce((sum, s) => sum + s.grandTotal, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales History</h1>
          <p className="text-muted-foreground mt-2">All invoices issued from this store</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Link href="/dashboard/pos">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Barcode className="w-4 h-4 mr-1" /> New Sale
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <StatCard label="Invoices" value={String(sales.length)} />
        <StatCard label="Today's sales" value={`₹${totalToday.toFixed(2)}`} />
        <StatCard label="Lifetime sales" value={`₹${totalAll.toFixed(2)}`} />
      </div>

      <Card>
        <CardContent className="p-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoice number, customer name or phone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Status filter pills. Drives `paymentStatus` + `status`
              filters above. Counts on each chip stay live as the
              underlying sales list refetches. */}
          <div className="flex items-center gap-1 flex-wrap text-[11px]">
            {(
              [
                { key: 'all', label: 'All', tone: 'bg-slate-600' },
                { key: 'paid', label: 'Paid', tone: 'bg-emerald-600' },
                { key: 'credit', label: 'Credit (party)', tone: 'bg-amber-600' },
                { key: 'partial', label: 'Partial', tone: 'bg-blue-600' },
                { key: 'returned', label: 'Returned', tone: 'bg-rose-600' },
                { key: 'today', label: 'Today', tone: 'bg-violet-600' },
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
                    {counts[p.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No sales yet. Head to POS and ring one up.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((sale) => (
                    <TableRow key={sale._id}>
                      <TableCell className="font-medium">{sale.invoiceNumber}</TableCell>
                      <TableCell>{sale.customerSnapshot?.name || 'Walk-in'}</TableCell>
                      <TableCell className="text-right">{sale.items?.length ?? 0}</TableCell>
                      <TableCell className="text-right">₹{sale.totalTax.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₹{sale.grandTotal.toFixed(2)}
                        {store?.settings?.eWayBillThreshold &&
                          sale.grandTotal > store.settings.eWayBillThreshold &&
                          sale.status !== 'returned' && (
                            <div
                              className="text-[10px] mt-0.5 text-amber-700 dark:text-amber-400"
                              title={`E-way bill is statutorily required for sales above ₹${store.settings.eWayBillThreshold.toLocaleString('en-IN')}`}
                            >
                              EWB required
                            </div>
                          )}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge sale={sale} />
                      </TableCell>
                      <TableCell>{new Date(sale.createdAt).toLocaleString('en-IN')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View"
                            onClick={() => setSelected(sale)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Share / send to customer"
                            onClick={() => setShareFor(sale)}
                          >
                            <Share2 className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Print"
                            onClick={() => share(sale, 'print')}
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          {sale.status !== 'returned' && sale.paymentStatus !== 'paid' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={`Record payment — outstanding ₹${(sale.grandTotal - (sale.amountPaid || 0)).toFixed(2)}`}
                              onClick={() => setPayFor(sale)}
                            >
                              <IndianRupee className="w-4 h-4 text-emerald-600" />
                            </Button>
                          )}
                          {sale.status !== 'returned' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Issue credit note (return)"
                              onClick={() => setReturnFor(sale)}
                            >
                              <Undo2 className="w-4 h-4 text-amber-600" />
                            </Button>
                          )}
                          {sale.status === 'returned' && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-amber-50 text-amber-700 border-amber-300">
                              Credit Note
                            </Badge>
                          )}
                          {store?.eInvoice?.enabled && sale.customerSnapshot?.gstNumber && sale.status !== 'returned' && !sale.eInvoice?.irn && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Generate e-invoice (IRN)"
                              onClick={async () => {
                                try {
                                  const r = await api.post<{ eInvoice: { irn: string } }>(`/sales/${sale._id}/einvoice/generate`);
                                  toast.success(`IRN generated · ${r.eInvoice.irn.slice(0, 16)}…`);
                                  load();
                                } catch (err) {
                                  if (err instanceof ApiError) toast.error(err.message);
                                }
                              }}
                            >
                              <FileCheck2 className="w-4 h-4 text-purple-600" />
                            </Button>
                          )}
                          {sale.eInvoice?.irn && sale.eInvoice.status === 'active' && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-purple-50 text-purple-700 border-purple-300" title={`IRN: ${sale.eInvoice.irn}`}>
                              IRN ✓
                            </Badge>
                          )}
                          {sale.eInvoice?.status === 'cancelled' && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-slate-100 text-slate-700">
                              IRN cancelled
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

      {selected && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <Card
            className="max-w-xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>
                {selected.invoiceNumber} · ₹{selected.grandTotal.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="mb-3">
                <div className="text-muted-foreground text-xs">Customer</div>
                <div>{selected.customerSnapshot?.name || 'Walk-in'}</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>{it.productSnapshot.name}</TableCell>
                      <TableCell className="text-right">{it.quantity}</TableCell>
                      <TableCell className="text-right">{it.sellingPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{it.totalTax.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{it.totalAmount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex justify-end">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {shareFor && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShareFor(null)}
        >
          <Card className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">
                Send {shareFor.invoiceNumber} to customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Customer</div>
                <div>
                  {shareFor.customerSnapshot?.name || 'Walk-in'}
                  {shareFor.customerSnapshot?.phone
                    ? ` · ${shareFor.customerSnapshot.phone}`
                    : ''}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={!shareFor.customerSnapshot?.phone}
                  onClick={() => {
                    share(shareFor, 'wa');
                    setShareFor(null);
                  }}
                  className="flex-col h-16 gap-1 relative"
                  title={
                    !shareFor.customerSnapshot?.phone
                      ? 'Phone missing on this bill'
                      : store?.whatsapp?.configured
                        ? 'Send automatically via WhatsApp API'
                        : 'Open WhatsApp with bill link'
                  }
                >
                  <MessageCircle className="w-5 h-5 text-green-600" />
                  <span className="text-xs">
                    WhatsApp{store?.whatsapp?.configured ? ' (API)' : ''}
                  </span>
                  {store?.whatsapp?.configured && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  disabled={!shareFor.customerSnapshot?.email}
                  onClick={() => {
                    share(shareFor, 'mail');
                    setShareFor(null);
                  }}
                  className="flex-col h-16 gap-1"
                  title={
                    shareFor.customerSnapshot?.email
                      ? 'Open mail client with bill link'
                      : 'Email missing on this bill'
                  }
                >
                  <Mail className="w-5 h-5 text-blue-600" />
                  <span className="text-xs">Email</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    share(shareFor, 'copy');
                  }}
                  className="flex-col h-16 gap-1"
                >
                  <LinkIcon className="w-5 h-5 text-slate-600" />
                  <span className="text-xs">Copy link</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    share(shareFor, 'print');
                    setShareFor(null);
                  }}
                  className="flex-col h-16 gap-1"
                >
                  <Printer className="w-5 h-5 text-slate-700" />
                  <span className="text-xs">Print</span>
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground break-all bg-muted p-2 rounded">
                {billShareUrl(shareFor.shareToken || shareFor._id)}
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShareFor(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {returnFor && (
        <ReturnSaleDialog
          sale={returnFor}
          onClose={() => setReturnFor(null)}
          onDone={() => { setReturnFor(null); load(); }}
        />
      )}

      {payFor && (
        <RecordPaymentDialog
          sale={payFor}
          onClose={() => setPayFor(null)}
          onDone={() => { setPayFor(null); load(); }}
        />
      )}
    </div>
  );
}

function ReturnSaleDialog({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: () => void }) {
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(sale.items.map((it) => [it.productId, it.quantity])),
  );
  const [reason, setReason] = useState('');
  const [refundMode, setRefundMode] = useState<'cash' | 'bank' | 'credit'>(
    sale.paymentStatus === 'credit' ? 'credit' : 'cash',
  );
  const [submitting, setSubmitting] = useState(false);

  const totalReturning = sale.items.reduce((s, it) => {
    const q = Number(qtys[it.productId] || 0);
    if (!(q > 0) || q > it.quantity) return s;
    const ratio = q / it.quantity;
    return s + Number(it.totalAmount || 0) * ratio;
  }, 0);

  const submit = async () => {
    const items = sale.items
      .filter((it) => Number(qtys[it.productId] || 0) > 0)
      .map((it) => ({ productId: it.productId, quantity: Number(qtys[it.productId]) }));
    if (items.length === 0) {
      toast.error('Pick at least one item to return');
      return;
    }
    setSubmitting(true);
    try {
      const cn = await api.post<Sale>(`/sales/${sale._id}/return`, { items, reason, refundMode });
      toast.success(`Credit note ${cn.invoiceNumber} issued`);
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
            Issue Credit Note — {sale.invoiceNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-y-auto">
          <div className="text-xs text-muted-foreground">
            Posts a new <b>CN-…</b> document linked to this invoice. Stock returns inward, output GST is reversed,
            and the original invoice stays immutable. Pick the quantity to return per line.
          </div>
          <div className="border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right w-32">Return qty</TableHead>
                  <TableHead className="text-right">Line value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((it) => {
                  const q = Number(qtys[it.productId] || 0);
                  const valid = q >= 0 && q <= it.quantity;
                  return (
                    <TableRow key={it.productId}>
                      <TableCell className="text-sm">{it.productSnapshot?.name}</TableCell>
                      <TableCell className="text-right">{it.quantity}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={q}
                          onChange={(e) => setQtys({ ...qtys, [it.productId]: Number(e.target.value) || 0 })}
                          className={`h-8 w-24 text-right ${!valid ? 'border-red-500' : ''}`}
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs">Refund mode</label>
              <select
                className="h-9 border rounded-md px-2 bg-background w-full"
                value={refundMode}
                onChange={(e) => setRefundMode(e.target.value as typeof refundMode)}
              >
                <option value="cash">Cash refund</option>
                <option value="bank">Bank transfer</option>
                <option value="credit">Adjust against future credit (no cash flow)</option>
              </select>
            </div>
            <div>
              <label className="text-xs">Reason</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in transit" />
            </div>
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
            {submitting ? 'Posting…' : 'Issue Credit Note'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function PaymentBadge({ sale }: { sale: Sale }) {
  const outstanding = Number(sale.grandTotal || 0) - Number(sale.amountPaid || 0);
  if (sale.status === 'returned') {
    return <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">Refunded</Badge>;
  }
  if (sale.paymentStatus === 'paid') {
    return (
      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
        Paid · {sale.payments?.map((p) => p.mode).join('+') || '—'}
      </Badge>
    );
  }
  if (sale.paymentStatus === 'partial') {
    return (
      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300" title={`Outstanding ₹${outstanding.toFixed(2)}`}>
        Partial · ₹{outstanding.toFixed(2)} due
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-300" title={`Outstanding ₹${outstanding.toFixed(2)}`}>
      Credit · ₹{outstanding.toFixed(2)} due
    </Badge>
  );
}

function RecordPaymentDialog({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: () => void }) {
  const outstanding = Math.max(0, Number(sale.grandTotal || 0) - Number(sale.amountPaid || 0));
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'bank'>('cash');
  // Amount = how much actually settles against the bill (capped at outstanding).
  // Tendered = cash physically handed over (cash mode only). Change = tendered - amount.
  const [amount, setAmount] = useState<string>(outstanding.toFixed(2));
  const [tendered, setTendered] = useState<string>(outstanding.toFixed(2));
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amt = Number(amount || 0);
  const tend = Number(tendered || 0);
  const isCash = mode === 'cash';
  const change = isCash ? Math.max(0, tend - amt) : 0;
  const validAmount = amt > 0 && amt <= outstanding + 0.01;
  const validTender = !isCash || tend + 0.01 >= amt;
  const valid = validAmount && validTender;

  // When user types tendered above outstanding, auto-cap the recorded amount.
  // When tendered < outstanding (partial cash), recorded amount tracks tendered.
  const onTenderedChange = (v: string) => {
    setTendered(v);
    if (!isCash) return;
    const t = Number(v || 0);
    const cappedAmount = Math.min(t, outstanding);
    setAmount(cappedAmount > 0 ? cappedAmount.toFixed(2) : '0');
  };

  const setAmountAndMatchTender = (v: string) => {
    setAmount(v);
    if (isCash) {
      const a = Number(v || 0);
      // If the tendered amount is below the new amount, bump it to match.
      if (Number(tendered || 0) < a) setTendered(v);
    }
  };

  const submit = async () => {
    if (!validAmount) {
      toast.error(`Amount must be 0 < x ≤ ₹${outstanding.toFixed(2)}`);
      return;
    }
    if (!validTender) {
      toast.error('Cash tendered must cover the amount being settled');
      return;
    }
    setSubmitting(true);
    try {
      await api.post<Sale>(`/sales/${sale._id}/payment`, { mode, amount: amt, reference });
      const remainingDue = outstanding - amt;
      toast.success(
        amt + 0.01 >= outstanding
          ? `${sale.invoiceNumber} marked paid${change > 0 ? ` · change ₹${change.toFixed(2)}` : ''}`
          : `Payment recorded — ₹${remainingDue.toFixed(2)} still due${change > 0 ? ` · change ₹${change.toFixed(2)}` : ''}`,
      );
      onDone();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Could not record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            Record payment — {sale.invoiceNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border p-2">
              <div className="text-[11px] text-muted-foreground">Bill total</div>
              <div className="font-mono font-semibold">₹{Number(sale.grandTotal || 0).toFixed(2)}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-[11px] text-muted-foreground">Already paid</div>
              <div className="font-mono font-semibold">₹{Number(sale.amountPaid || 0).toFixed(2)}</div>
            </div>
          </div>
          <div className="rounded border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 p-2 flex justify-between">
            <span>Outstanding</span>
            <span className="font-mono font-bold text-rose-700">₹{outstanding.toFixed(2)}</span>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Mode</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['cash', 'upi', 'card', 'bank'] as const).map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode(m)}
                  className={`h-8 capitalize text-xs ${mode === m ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                >
                  {m === 'bank' ? 'Bank' : m}
                </Button>
              ))}
            </div>
          </div>
          {isCash ? (
            <>
              <div>
                <label className="text-[11px] text-muted-foreground">Cash tendered (handed over)</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tendered}
                  onChange={(e) => onTenderedChange(e.target.value)}
                  placeholder={outstanding.toFixed(2)}
                />
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  {[100, 500, 1000, 2000].map((v) => (
                    <Button
                      key={v}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onTenderedChange(String((Number(tendered) || 0) + v))}
                    >
                      +{v}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 text-xs w-full"
                  onClick={() => onTenderedChange(outstanding.toFixed(2))}
                >
                  Set exact (₹{outstanding.toFixed(2)})
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border p-2">
                  <div className="text-[11px] text-muted-foreground">Settling against bill</div>
                  <div className="font-mono font-semibold text-emerald-700">₹{amt.toFixed(2)}</div>
                </div>
                <div className={`rounded border p-2 ${change > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800' : ''}`}>
                  <div className="text-[11px] text-muted-foreground">Change to give back</div>
                  <div className={`font-mono font-semibold ${change > 0 ? 'text-amber-700' : ''}`}>
                    ₹{change.toFixed(2)}
                  </div>
                </div>
              </div>
              {tend > outstanding && (
                <div className="text-[11px] text-muted-foreground">
                  Customer handed ₹{tend.toFixed(2)} for an outstanding of ₹{outstanding.toFixed(2)}.
                  Bill clears at ₹{outstanding.toFixed(2)}; return ₹{change.toFixed(2)} cash to the customer.
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="text-[11px] text-muted-foreground">Amount received</label>
              <Input
                type="number"
                min={0}
                max={outstanding}
                step="0.01"
                value={amount}
                onChange={(e) => setAmountAndMatchTender(e.target.value)}
                className={!validAmount ? 'border-rose-500' : ''}
              />
            </div>
          )}
          <div>
            <label className="text-[11px] text-muted-foreground">Reference (optional)</label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR / cheque no / receipt no"
            />
          </div>
          <div className="text-[11px] text-muted-foreground">
            Posts to ledger: Dr {isCash ? 'Cash' : 'Bank'} ₹{amt.toFixed(2)}, Cr Sundry Debtors ₹{amt.toFixed(2)}.
            {amt + 0.01 >= outstanding ? ' Bill will be marked paid.' : ' Bill will remain partial.'}
          </div>
        </CardContent>
        <div className="px-4 pb-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!valid || submitting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? 'Recording…' : 'Record payment'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
