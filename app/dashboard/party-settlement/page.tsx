'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeftRight,
  RefreshCcw,
  Search,
  Sparkles,
  CheckCircle2,
  Info,
  Users,
  TrendingUp,
  TrendingDown,
  Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Pair {
  customerId: string;
  customerName: string;
  supplierId: string;
  supplierName: string;
  gstNumber: string;
  phone: string;
  matchedBy: 'GSTIN' | 'phone';
  receivable: number;
  payable: number;
  suggestedSettlement: number;
  netDirection: 'receivable' | 'payable' | 'even';
  netAmount: number;
}

export default function PartySettlementPage() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<Pair | null>(null);
  const [search, setSearch] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setPairs(await api.get<Pair[]>('/accounting/party-settlements'));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const receivable = pairs.reduce((s, p) => s + p.receivable, 0);
    const payable = pairs.reduce((s, p) => s + p.payable, 0);
    const settleable = pairs.reduce((s, p) => s + p.suggestedSettlement, 0);
    return { receivable, payable, settleable };
  }, [pairs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pairs;
    return pairs.filter((p) =>
      p.customerName.toLowerCase().includes(q) ||
      p.supplierName.toLowerCase().includes(q) ||
      (p.gstNumber || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q),
    );
  }, [pairs, search]);

  // Sort by largest suggested settlement first — that's the highest-value action.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.suggestedSettlement - a.suggestedSettlement),
    [filtered],
  );

  const settleAll = async () => {
    if (pairs.length === 0) return;
    const total = pairs.reduce((s, p) => s + p.suggestedSettlement, 0);
    const ok = window.confirm(
      `Post ${pairs.length} contra voucher${pairs.length === 1 ? '' : 's'} totalling ${money(total)}?\n` +
      'Each pair will be settled by its suggested amount (the smaller side wiped to zero).',
    );
    if (!ok) return;

    setBulkRunning(true);
    let done = 0;
    let failed = 0;
    for (const p of pairs) {
      try {
        await api.post('/accounting/party-settlements', {
          customerId: p.customerId,
          supplierId: p.supplierId,
          amount: p.suggestedSettlement,
          narration: `Auto-settle vs ${p.customerName}`,
        });
        done++;
      } catch {
        failed++;
      }
    }
    setBulkRunning(false);
    if (failed === 0) toast.success(`Settled ${done} pair${done === 1 ? '' : 's'}`);
    else toast.warning(`${done} settled · ${failed} failed`);
    await load();
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-indigo-600" />
            Party Settlement
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Net off mutual dues with parties that are both customer &amp; supplier.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={settleAll}
            disabled={pairs.length === 0 || bulkRunning}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            {bulkRunning ? 'Settling…' : `Settle all suggested${pairs.length ? ` (${pairs.length})` : ''}`}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile
          label="Matched pairs"
          value={String(pairs.length)}
          icon={<Users className="w-4 h-4" />}
          tone="indigo"
        />
        <KpiTile
          label="Total receivable"
          value={money(totals.receivable)}
          icon={<TrendingUp className="w-4 h-4" />}
          tone="emerald"
        />
        <KpiTile
          label="Total payable"
          value={money(totals.payable)}
          icon={<TrendingDown className="w-4 h-4" />}
          tone="red"
        />
        <KpiTile
          label="Net settleable"
          value={money(totals.settleable)}
          icon={<Scale className="w-4 h-4" />}
          tone="amber"
          hint="Smaller side per pair"
        />
      </div>

      {/* Search + helper */}
      {pairs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, GSTIN, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="w-3 h-3" />
            Settling posts a contra voucher (CON-…). Both ledgers reduce by the same amount.
          </div>
        </div>
      )}

      {/* Pair list */}
      {pairs.length === 0 ? (
        <EmptyState loading={loading} />
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground italic">
            No pairs match &ldquo;{search}&rdquo;.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => (
            <PairRow key={`${p.customerId}-${p.supplierId}`} pair={p} onSettle={() => setActive(p)} />
          ))}
        </div>
      )}

      {active && (
        <SettleDialog
          pair={active}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); load(); }}
        />
      )}
    </div>
  );
}

type KpiTone = 'indigo' | 'emerald' | 'red' | 'amber';
const TONE_CLASSES: Record<KpiTone, string> = {
  indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-300',
  emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300',
  red: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-300',
  amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
};

function KpiTile({
  label, value, icon, tone, hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: KpiTone;
  hint?: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-3 flex items-center gap-3 leading-tight">
        <div className={`w-9 h-9 rounded-md flex items-center justify-center ${TONE_CLASSES[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-bold tabular-nums truncate">{value}</div>
          {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function PairRow({ pair, onSettle }: { pair: Pair; onSettle: () => void }) {
  // Bars are drawn proportional to the larger side — gives a visual sense of
  // who owes more and how much overlap (the suggested settlement) exists.
  const maxSide = Math.max(pair.receivable, pair.payable, 1);
  const recvPct = (pair.receivable / maxSide) * 100;
  const payPct = (pair.payable / maxSide) * 100;
  const overlapPct = (pair.suggestedSettlement / maxSide) * 100;

  const initials = pair.customerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <Card className="py-0">
      <CardContent className="p-3 flex items-center gap-4 flex-wrap md:flex-nowrap">
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-[200px] flex-1">
          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 flex items-center justify-center font-semibold shrink-0">
            {initials || '·'}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{pair.customerName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                {pair.matchedBy}
              </Badge>
              <span className="text-[11px] text-muted-foreground font-mono truncate">
                {pair.gstNumber || pair.phone || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Bars */}
        <div className="flex-1 min-w-[260px] space-y-1.5">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-16 text-emerald-600 font-medium shrink-0">Receivable</span>
            <div className="flex-1 h-3 bg-muted rounded overflow-hidden relative">
              <div
                className="h-full bg-emerald-500/70"
                style={{ width: `${recvPct}%` }}
              />
              {/* Overlap marker — settlement zone */}
              <div
                className="absolute top-0 left-0 h-full border-r-2 border-amber-500"
                style={{ width: `${overlapPct}%` }}
              />
            </div>
            <span className="font-mono text-emerald-700 w-24 text-right shrink-0">
              {money(pair.receivable)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-16 text-red-600 font-medium shrink-0">Payable</span>
            <div className="flex-1 h-3 bg-muted rounded overflow-hidden relative">
              <div
                className="h-full bg-red-500/70"
                style={{ width: `${payPct}%` }}
              />
              <div
                className="absolute top-0 left-0 h-full border-r-2 border-amber-500"
                style={{ width: `${overlapPct}%` }}
              />
            </div>
            <span className="font-mono text-red-700 w-24 text-right shrink-0">
              {money(pair.payable)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <span className="text-muted-foreground">
              {pair.netDirection === 'even' && 'Will fully settle to zero'}
              {pair.netDirection === 'receivable' && (
                <>After: <b className="text-emerald-600">{money(pair.netAmount)}</b> still receivable</>
              )}
              {pair.netDirection === 'payable' && (
                <>After: <b className="text-red-600">{money(pair.netAmount)}</b> still payable</>
              )}
            </span>
            <span className="font-mono text-amber-600 font-semibold">
              ⇄ {money(pair.suggestedSettlement)}
            </span>
          </div>
        </div>

        {/* Action */}
        <Button
          onClick={onSettle}
          className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
        >
          <ArrowLeftRight className="w-4 h-4 mr-1.5" />
          Settle
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
          <ArrowLeftRight className="w-7 h-7 text-indigo-600" />
        </div>
        <div className="font-semibold">
          {loading ? 'Looking for matched parties…' : 'Nothing to settle right now'}
        </div>
        <div className="text-sm text-muted-foreground max-w-md">
          A pair shows up here as soon as the same GSTIN (or phone) has both an outstanding sale invoice
          and an outstanding purchase order. We&rsquo;ll then suggest the smaller of the two as the
          settlement amount.
        </div>
      </CardContent>
    </Card>
  );
}

function SettleDialog({ pair, onClose, onDone }: { pair: Pair; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(pair.suggestedSettlement.toFixed(2)));
  const [narration, setNarration] = useState(`Mutual settlement against ${pair.customerName}`);
  const [submitting, setSubmitting] = useState(false);

  const amt = Number(amount || 0);
  const max = Math.min(pair.receivable, pair.payable);
  const validAmount = amt > 0 && amt <= max + 0.01;
  const remainingReceivable = Math.max(0, pair.receivable - amt);
  const remainingPayable = Math.max(0, pair.payable - amt);

  const submit = async () => {
    if (!validAmount) return;
    setSubmitting(true);
    try {
      await api.post('/accounting/party-settlements', {
        customerId: pair.customerId,
        supplierId: pair.supplierId,
        amount: amt,
        narration,
      });
      toast.success(`Settled ${money(amt)} via contra voucher`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
            Settle: {pair.customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Before */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border rounded-md p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
              <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
                We are owed
              </div>
              <div className="font-mono font-bold text-lg text-emerald-700 dark:text-emerald-400 tabular-nums">
                {money(pair.receivable)}
              </div>
            </div>
            <div className="border rounded-md p-3 bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900">
              <div className="text-[10px] uppercase tracking-wide text-red-700 dark:text-red-400 font-semibold">
                We owe
              </div>
              <div className="font-mono font-bold text-lg text-red-700 dark:text-red-400 tabular-nums">
                {money(pair.payable)}
              </div>
            </div>
          </div>

          {/* Amount input with quick buttons */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Settle amount (₹)</Label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setAmount(pair.suggestedSettlement.toFixed(2))}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  Suggested
                </button>
                <button
                  type="button"
                  onClick={() => setAmount((max / 2).toFixed(2))}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70"
                >
                  ½
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(max.toFixed(2))}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70"
                >
                  Max
                </button>
              </div>
            </div>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={max}
              className="font-mono text-base"
            />
            <div className="text-[10px] text-muted-foreground">
              Max settleable is the smaller side: <b>{money(max)}</b>.
            </div>
          </div>

          {/* Narration */}
          <div className="space-y-1.5">
            <Label className="text-xs">Narration</Label>
            <Input value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>

          {/* After preview */}
          {validAmount && (
            <div className="bg-muted/50 border rounded-md p-3 space-y-2">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                After settlement
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between border rounded px-2 py-1 bg-background">
                  <span className="text-muted-foreground">Receivable left</span>
                  <span className="font-mono font-semibold">{money(remainingReceivable)}</span>
                </div>
                <div className="flex justify-between border rounded px-2 py-1 bg-background">
                  <span className="text-muted-foreground">Payable left</span>
                  <span className="font-mono font-semibold">{money(remainingPayable)}</span>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Posts contra voucher CON-… → <span className="font-mono">Dr Sundry Creditors {money(amt)}</span>{' '}
                · <span className="font-mono">Cr Sundry Debtors {money(amt)}</span>.
              </div>
            </div>
          )}

          {!validAmount && amt > 0 && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-2">
              Amount must be greater than 0 and at most {money(max)}.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!validAmount || submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? 'Posting…' : `Post ${money(amt)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
