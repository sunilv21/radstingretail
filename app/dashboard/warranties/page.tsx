'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ShieldCheck, ShieldOff, RefreshCcw, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

interface WarrantyRow {
  saleId: string;
  invoiceNumber: string;
  soldAt: string;
  customer: { name: string; phone?: string; address?: string };
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  warrantyMonths: number;
  startsAt: string;
  expiresAt: string;
  status: 'active' | 'expired';
}

export default function WarrantiesPage() {
  const [rows, setRows] = useState<WarrantyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  // Status filter — overrides activeOnly when 'expiring_30d' is set.
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'expiring_30d' | 'expired'
  >('all');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (phone.trim()) params.set('phone', phone.trim());
      if (activeOnly) params.set('activeOnly', 'true');
      const data = await api.get<WarrantyRow[]>(`/sales/warranties?${params}`);
      setRows(data);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-search with debounce as the phone input changes
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, activeOnly]);

  // Days remaining helper — drives the "Time left" column AND the
  // expiring-soon filter pill. Negative for expired warranties.
  const now = Date.now();
  const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - now) / 86_400_000);

  const activeCount = rows.filter((r) => r.status === 'active').length;
  const expiredCount = rows.filter((r) => r.status === 'expired').length;
  const expiringSoonCount = rows.filter(
    (r) => r.status === 'active' && daysLeft(r.expiresAt) <= 30,
  ).length;

  const filtered = rows.filter((r) => {
    if (statusFilter === 'active') return r.status === 'active';
    if (statusFilter === 'expired') return r.status === 'expired';
    if (statusFilter === 'expiring_30d') {
      return r.status === 'active' && daysLeft(r.expiresAt) <= 30;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Warranty register</h1>
          <p className="text-muted-foreground mt-1">
            Every warranty-bearing item sold, linked to the customer so you can honor claims.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Total warranty lines" value={String(rows.length)} icon={<ShieldCheck />} />
        <Stat label="Active" value={String(activeCount)} icon={<ShieldCheck />} tone="good" />
        <Stat label="Expired" value={String(expiredCount)} icon={<ShieldOff />} tone={expiredCount > 0 ? 'warning' : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search by customer mobile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter mobile number to find the customer's warrantiesâ€¦"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="activeOnly"
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            <Label htmlFor="activeOnly" className="text-sm cursor-pointer">
              Show only active warranties
            </Label>
          </div>
          {/* Status filter pills — narrow on top of the active-only
              checkbox + phone search. Counts stay live. */}
          <div className="flex items-center gap-1 flex-wrap text-[11px]">
            {(
              [
                { key: 'all', label: 'All', tone: 'bg-slate-600', count: rows.length },
                { key: 'active', label: 'Active', tone: 'bg-emerald-600', count: activeCount },
                { key: 'expiring_30d', label: 'Expiring ≤ 30d', tone: 'bg-amber-600', count: expiringSoonCount },
                { key: 'expired', label: 'Expired', tone: 'bg-rose-600', count: expiredCount },
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
                    {p.count}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {phone ? `Warranties for ${phone}` : 'All warranty items'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loadingâ€¦</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {phone
                ? 'No warranties found for this mobile number / filter.'
                : 'No warranty sales yet. When a warranty-bearing item is sold, it shows up here.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Sold</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead>Valid till</TableHead>
                  <TableHead>Time left</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-medium">{r.customer.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {r.customer.address}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.customer.phone}</TableCell>
                    <TableCell>
                      <div>{r.productName}</div>
                      <div className="text-[10px] text-muted-foreground">SKU {r.sku}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        <Receipt className="w-3 h-3" />
                        {r.invoiceNumber}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(r.soldAt).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell className="text-xs">{r.warrantyMonths} months</TableCell>
                    <TableCell className="text-xs">
                      {new Date(r.expiresAt).toLocaleDateString('en-IN')}
                    </TableCell>
                    {/* Time left column. Negative numbers (already
                        expired) print as "—". The < 30d threshold gets
                        an amber tone so warranty-claim windows about to
                        close are obvious at a glance. */}
                    <TableCell className="text-xs tabular-nums">
                      {(() => {
                        const d = daysLeft(r.expiresAt);
                        if (d <= 0) return <span className="text-rose-600 dark:text-rose-400">—</span>;
                        const months = Math.floor(d / 30);
                        const days = d % 30;
                        const label = months > 0 ? `${months}m ${days}d` : `${d}d`;
                        const tone =
                          d <= 30
                            ? 'text-amber-700 dark:text-amber-400 font-medium'
                            : 'text-foreground';
                        return <span className={tone}>{label}</span>;
                      })()}
                    </TableCell>
                    <TableCell>
                      {r.status === 'active' ? (
                        <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Expired</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'good' | 'warning';
}) {
  const c = tone === 'good' ? 'text-green-600' : tone === 'warning' ? 'text-orange-600' : '';
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-md bg-muted flex items-center justify-center ${c}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-2xl font-bold ${c}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
