'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Search,
  RefreshCcw,
  Pencil,
  ScrollText,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import HsnAutocomplete from '@/components/HsnAutocomplete';

type Status =
  | 'verified'
  | 'rate_mismatch'
  | 'unknown_hsn'
  | 'invalid_format'
  | 'missing';

interface AuditRow {
  productId: string;
  name: string;
  sku: string;
  hsnCode: string;
  appliedRate: number;
  status: Status;
  prescribedRates: number[];
  masterDescription: string | null;
  kind: 'hsn' | 'sac' | null;
  reason: string | null;
  digits: number;
}

interface AuditResponse {
  minDigits: number;
  summary: {
    total: number;
    verified: number;
    rateMismatch: number;
    unknown: number;
    invalidFormat: number;
    missing: number;
  };
  rows: AuditRow[];
}

const STATUS_META: Record<
  Status,
  { label: string; tone: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  verified: {
    label: 'Verified',
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    Icon: ShieldCheck,
  },
  rate_mismatch: {
    label: 'Rate mismatch',
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  unknown_hsn: {
    label: 'Unknown HSN',
    tone: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
    Icon: HelpCircle,
  },
  invalid_format: {
    label: 'Invalid format',
    tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    Icon: XCircle,
  },
  missing: {
    label: 'Missing',
    tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    Icon: XCircle,
  },
};

export default function HsnAuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [editing, setEditing] = useState<AuditRow | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<AuditResponse>('/hsn/audit/products'));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows
      .filter((r) => (filter === 'all' ? true : r.status === filter))
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.hsnCode.toLowerCase().includes(q),
      );
  }, [data, search, filter]);

  const saveEdit = async (next: { hsnCode: string; gstRate: number }) => {
    if (!editing) return;
    setSavingProduct(true);
    try {
      await api.put(`/products/${editing.productId}`, {
        hsnCode: next.hsnCode,
        gstRate: next.gstRate,
      });
      toast.success(`Updated ${editing.name}`);
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSavingProduct(false);
    }
  };

  const totals = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-blue-600" />
            HSN / SAC verification
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Audit every product against the HSN master and its prescribed GST rate.
            Fix mismatches before they hit GSTR-1. Minimum digits required by this
            organisation:{' '}
            <strong>{data?.minDigits ?? 4}</strong>
            <span className="text-[11px] ml-2">
              (change in Organisation → Settings if turnover crossed ₹5Cr)
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Link href="/dashboard/inventory">
            <Button variant="outline">Back to inventory</Button>
          </Link>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Summary label="Total SKUs" value={totals.total} tone="muted" />
          <Summary label="Verified" value={totals.verified} tone="emerald" />
          <Summary label="Rate mismatch" value={totals.rateMismatch} tone="amber" />
          <Summary label="Unknown HSN" value={totals.unknown} tone="slate" />
          <Summary
            label="Invalid / missing"
            value={totals.invalidFormat + totals.missing}
            tone="rose"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Audit results</CardTitle>
              <CardDescription>
                Click a row's pencil icon to fix the HSN/rate in place.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name / SKU / HSN"
                  className="pl-7 h-8 w-60 text-xs"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap text-[11px]">
                {(
                  [
                    { key: 'all', label: 'All', tone: 'bg-slate-600', count: totals?.total ?? 0 },
                    {
                      key: 'verified',
                      label: 'Verified',
                      tone: 'bg-emerald-600',
                      count: totals?.verified ?? 0,
                    },
                    {
                      key: 'rate_mismatch',
                      label: 'Mismatch',
                      tone: 'bg-amber-600',
                      count: totals?.rateMismatch ?? 0,
                    },
                    {
                      key: 'unknown_hsn',
                      label: 'Unknown',
                      tone: 'bg-slate-600',
                      count: totals?.unknown ?? 0,
                    },
                    {
                      key: 'invalid_format',
                      label: 'Invalid',
                      tone: 'bg-rose-600',
                      count: totals?.invalidFormat ?? 0,
                    },
                    {
                      key: 'missing',
                      label: 'Missing',
                      tone: 'bg-rose-700',
                      count: totals?.missing ?? 0,
                    },
                  ] as const
                ).map((p) => {
                  const active = filter === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setFilter(p.key)}
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>HSN / SAC</TableHead>
                <TableHead className="text-right">Applied</TableHead>
                <TableHead className="text-right">Prescribed</TableHead>
                <TableHead>Master description</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                    {loading ? 'Loading…' : 'No products match this filter.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <TableRow key={r.productId}>
                      <TableCell>
                        <Badge variant="secondary" className={`${meta.tone} border-transparent`}>
                          <meta.Icon className="w-3 h-3 mr-1" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {r.sku}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {r.hsnCode || <span className="text-rose-500">—</span>}
                        {r.kind && (
                          <span className="text-[10px] text-muted-foreground ml-1 uppercase">
                            {r.kind}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{r.appliedRate}%</TableCell>
                      <TableCell className="text-right">
                        {r.prescribedRates.length > 0 ? (
                          <span
                            className={
                              r.status === 'rate_mismatch'
                                ? 'text-amber-700 dark:text-amber-300 font-semibold'
                                : ''
                            }
                          >
                            {r.prescribedRates.map((x) => `${x}%`).join(' / ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">
                        {r.masterDescription || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Fix HSN / rate"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <EditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          saving={savingProduct}
        />
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'muted' | 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const cls =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'rose'
          ? 'text-rose-700 dark:text-rose-300'
          : tone === 'slate'
            ? 'text-slate-700 dark:text-slate-300'
            : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-0.5 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: AuditRow;
  onClose: () => void;
  onSave: (next: { hsnCode: string; gstRate: number }) => void;
  saving: boolean;
}) {
  const [hsnCode, setHsnCode] = useState(row.hsnCode || '');
  const [gstRate, setGstRate] = useState(String(row.appliedRate));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fix HSN — {row.name}</DialogTitle>
          <DialogDescription>
            Pick an HSN from the master or paste a valid code. The applied GST rate
            updates with one click when there's a mismatch.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold">HSN / SAC code</div>
            <HsnAutocomplete
              value={hsnCode}
              onChange={setHsnCode}
              onRateSuggest={(r) => setGstRate(String(r))}
              appliedRate={Number(gstRate || 0)}
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold">GST rate (%)</div>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full text-sm"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
            >
              {[0, 0.25, 3, 5, 12, 18, 28].map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave({ hsnCode: hsnCode.trim(), gstRate: Number(gstRate) })}
            disabled={saving || !hsnCode.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? 'Saving…' : 'Save fix'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
