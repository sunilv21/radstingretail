'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  RefreshCcw, MessageCircle, Copy, Phone, AlertTriangle, CheckCircle2, ExternalLink, IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { StoreInfo } from '@/lib/types';
import {
  buildReminderMessage,
  pickToneFromDues,
  buildUpiLink,
  type ReminderTone,
  type DuesSummary,
} from '@/lib/reminder-templates';

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface AgingRow {
  customerId: string | null;
  customerName: string;
  phone: string;
  totalDue: number;
  buckets: Record<string, number>;
  invoices: { invoiceNumber: string; invoiceDate: string; ageDays: number; bucket: string; due: number }[];
}
interface AgingResp {
  bucketLabels?: string[];
  receivables: { rows: AgingRow[]; buckets: Record<string, number>; total: number };
  payables: unknown;
}

// Pick the most-overdue bucket that has a non-zero value.
function dominantBucket(buckets: Record<string, number>, labels: string[]): string {
  for (let i = labels.length - 1; i >= 0; i--) {
    if ((buckets[labels[i]] || 0) > 0) return labels[i];
  }
  return labels[0] || '0-30';
}

export default function CollectionsPage() {
  const [aging, setAging] = useState<AgingResp | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<AgingRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        api.get<AgingResp>('/reports/aging'),
        api.get<StoreInfo>('/store/me').catch(() => null),
      ]);
      setAging(a);
      setStore(s);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalReceivable = aging?.receivables.total || 0;
  const labels = aging?.bucketLabels && aging.bucketLabels.length
    ? aging.bucketLabels
    : ['0-30', '31-60', '61-90', '90+'];
  // Everything except the first bucket is "overdue" per the configured cutoffs.
  const buckets = aging?.receivables.buckets || {};
  const overdueByLabel = labels.slice(1).map((l) => ({ label: l, value: buckets[l] || 0 }));
  const overdueAny = overdueByLabel.reduce((s, b) => s + b.value, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <IndianRupee className="w-7 h-7 text-emerald-600" />
          Collections
        </h1>
        <p className="text-muted-foreground mt-1">
          Outstanding receivables grouped by aging bucket. Send tailored reminders via WhatsApp
          with embedded UPI payment links — customer taps the link, their UPI app opens with
          payee + amount pre-filled.
        </p>
      </div>

      {!store?.upiId && (
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <CardContent className="p-3 text-sm flex items-start gap-2 text-amber-900 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <b>UPI ID not set.</b> Reminders will go out without a payment link. Set your UPI VPA
              (e.g. <span className="font-mono">store@hdfcbank</span>) in <b>Settings → Store profile</b> to
              embed one-tap UPI payment links in every reminder.
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SumCard label="Total receivable" value={money(totalReceivable)} tone="emerald" />
        {overdueByLabel.slice(0, 3).map((b, idx) => {
          const tone = b.value === 0 ? 'gray' : idx === 0 ? 'amber' : idx === 1 ? 'orange' : 'red';
          return (
            <SumCard key={b.label} label={`Overdue ${b.label}`} value={money(b.value)} tone={tone} />
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customers with outstanding dues</CardTitle>
          <CardDescription>
            {aging?.receivables.rows.length === 0
              ? 'No outstanding dues — all paid up.'
              : overdueAny > 0
                ? `${money(overdueAny)} is overdue beyond 30 days. Click Send reminder to chase.`
                : `${money(totalReceivable)} receivable, all within 30 days.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Worst aging</TableHead>
                  {labels.map((l) => (
                    <TableHead key={l} className="text-right">{l}</TableHead>
                  ))}
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(aging?.receivables.rows || []).length === 0 ? (
                  <TableRow><TableCell colSpan={5 + labels.length} className="text-center text-muted-foreground italic py-8">No outstanding receivables.</TableCell></TableRow>
                ) : aging!.receivables.rows.map((r) => {
                  const dom = dominantBucket(r.buckets, labels);
                  const domIdx = labels.indexOf(dom);
                  const tone = domIdx === labels.length - 1 ? 'destructive'
                    : domIdx >= 2 ? 'destructive'
                    : domIdx === 1 ? 'secondary' : 'outline';
                  return (
                    <TableRow key={r.customerId || r.customerName}>
                      <TableCell className="font-medium">{r.customerName}</TableCell>
                      <TableCell className="text-xs font-mono">{r.phone || '—'}</TableCell>
                      <TableCell><Badge variant={tone} className="text-[10px]">{dom}</Badge></TableCell>
                      {labels.map((l, idx) => {
                        const v = r.buckets[l] || 0;
                        const className = idx === 0
                          ? ''
                          : idx === labels.length - 1
                            ? (v > 0 ? 'text-red-600 font-semibold' : '')
                            : idx === 1
                              ? (v > 0 ? 'text-amber-600' : '')
                              : (v > 0 ? 'text-orange-600' : '');
                        return (
                          <TableCell key={l} className={`text-right font-mono ${className}`}>{money(v)}</TableCell>
                        );
                      })}
                      <TableCell className="text-right font-mono font-semibold text-emerald-700">{money(r.totalDue)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => setActive(r)}
                          disabled={!r.phone}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                          title={r.phone ? 'Send WhatsApp reminder' : 'Customer has no phone number'}
                        >
                          <MessageCircle className="w-3.5 h-3.5 mr-1" /> Remind
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {active && store && (
        <ReminderDialog
          row={active}
          store={store}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); load(); }}
        />
      )}
    </div>
  );
}

function ReminderDialog({
  row, store, onClose, onDone,
}: {
  row: AgingRow; store: StoreInfo; onClose: () => void; onDone: () => void;
}) {
  const dues: DuesSummary = useMemo(
    () => ({
      customerName: row.customerName,
      customerPhone: row.phone,
      totalDue: row.totalDue,
      invoices: row.invoices.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        due: i.due,
        ageDays: i.ageDays,
      })),
    }),
    [row],
  );

  const [tone, setTone] = useState<ReminderTone>(() => pickToneFromDues(dues));
  const [message, setMessage] = useState(() => buildReminderMessage(tone, dues, store));
  const [sending, setSending] = useState(false);

  // Re-generate template when tone changes (but only if user hasn't customized)
  const [pristine, setPristine] = useState(true);
  const onToneChange = (t: ReminderTone) => {
    setTone(t);
    if (pristine) {
      setMessage(buildReminderMessage(t, dues, store));
    }
  };
  const onMessageChange = (m: string) => {
    setMessage(m);
    setPristine(false);
  };

  const upiLink = store.upiId
    ? buildUpiLink({
        vpa: store.upiId,
        payeeName: store.name || 'Store',
        amount: row.totalDue,
        note: `Payment to ${store.name || 'Store'}`,
      })
    : '';

  const sendViaApi = async () => {
    setSending(true);
    try {
      const res = await api.post<{ sentTo?: string; messageId?: string }>(
        `/customers/${row.customerId}/remind`,
        { message },
      );
      toast.success(`Reminder sent to ${res.sentTo || row.phone}`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) toast.error(`Send failed — ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const openWaMe = () => {
    const phone = row.phone.replace(/\D/g, '');
    const wa = `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(message)}`;
    window.open(wa, '_blank');
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Reminder message copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
            Send reminder to {row.customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <Info label="Phone" value={row.phone || '—'} mono />
            <Info label="Total due" value={money(row.totalDue)} tone="emerald" />
            <Info
              label="UPI link"
              value={store.upiId ? '✓ embedded' : 'not configured'}
              tone={store.upiId ? 'emerald' : 'amber'}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Reminder tone</Label>
            <div className="flex gap-2">
              {(['friendly', 'firm', 'final'] as ReminderTone[]).map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={tone === t ? 'default' : 'outline'}
                  onClick={() => onToneChange(t)}
                  className={tone === t ? (t === 'final' ? 'bg-red-600 hover:bg-red-700' : t === 'firm' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700') : ''}
                >
                  {t === 'friendly' && '😊 '}
                  {t === 'firm' && '⚠️ '}
                  {t === 'final' && '🚨 '}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
              {!pristine && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setMessage(buildReminderMessage(tone, dues, store)); setPristine(true); }}
                >
                  Reset to template
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              rows={14}
              className="font-mono text-xs"
            />
          </div>

          {upiLink && (
            <div className="border rounded p-2 bg-muted/30 text-[11px] space-y-1">
              <div className="font-semibold">Embedded UPI deep link</div>
              <div className="font-mono break-all text-muted-foreground">{upiLink}</div>
              <div className="text-[10px]">When the customer taps this in WhatsApp on their phone, their UPI app (PhonePe / GPay / Paytm) opens with payee + ₹{row.totalDue.toFixed(2)} pre-filled.</div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={copyMessage}>
            <Copy className="w-4 h-4 mr-1" /> Copy
          </Button>
          <Button variant="outline" onClick={openWaMe} disabled={!row.phone}>
            <ExternalLink className="w-4 h-4 mr-1" /> Open wa.me
          </Button>
          <Button
            onClick={sendViaApi}
            disabled={sending || !row.phone || !row.customerId}
            className="bg-emerald-600 hover:bg-emerald-700"
            title={!store.whatsapp?.configured ? 'Configure WhatsApp Cloud API in Settings to send via API' : ''}
          >
            <MessageCircle className="w-4 h-4 mr-1" />
            {sending ? 'Sending…' : store.whatsapp?.configured ? 'Send via API' : 'Send via API (configure WhatsApp first)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SumCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'amber' | 'orange' | 'red' | 'gray' }) {
  const cls = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
    gray: 'text-muted-foreground',
  }[tone];
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 font-mono ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'emerald' | 'amber' }) {
  const cls = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : '';
  return (
    <div className="border rounded p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-medium ${mono ? 'font-mono' : ''} ${cls}`}>{value}</div>
    </div>
  );
}
