'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  IndianRupee,
  Plus,
  RefreshCcw,
  Receipt,
  TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

interface ExpenseCategory {
  key: string;
  label: string;
  help: string;
}

interface ExpenseRow {
  _id: string;
  voucherNumber: string;
  date: string;
  category: string;
  paidVia: string;
  amount: number;
  narration: string;
  createdAt: string;
}

interface ListResp {
  data: ExpenseRow[];
  meta: { page: number; limit: number; total: number; pages: number };
}

interface BreakdownResp {
  total: number;
  rows: { category: string; amount: number; pct: number }[];
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PAYMENT_MODES = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank transfer' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'cheque', label: 'Cheque' },
];

export default function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  // Default date window: this month so the register doesn't bring back years
  // of records on first paint. Users can extend via the date inputs.
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      const [list, brk] = await Promise.all([
        api.get<ListResp>(`/expenses?${params.toString()}`),
        api.get<BreakdownResp>(
          `/expenses/breakdown?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString()}`,
        ),
      ]);
      setRows(list.data);
      setBreakdown(brk);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Categories load once.
  useEffect(() => {
    api.get<ExpenseCategory[]>('/expenses/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, filterCategory]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <IndianRupee className="w-6 h-6 text-rose-600" />
            Expenses
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Rent, salaries, electricity, delivery — every operating cost the shop
            incurs. Each entry posts a payment voucher in the books, so trial
            balance and P&amp;L stay accurate.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" />
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-rose-600 hover:bg-rose-700"
          >
            <Plus className="w-4 h-4 mr-1" /> New expense
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">
                Total spent (period)
              </div>
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">
                {money(breakdown?.total ?? total)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {from || '—'} → {to || 'today'}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">
              Top categories
            </div>
            {breakdown && breakdown.rows.length > 0 ? (
              <div className="space-y-1">
                {breakdown.rows.slice(0, 5).map((r) => (
                  <div key={r.category} className="flex items-center gap-2 text-xs">
                    <div className="w-32 truncate">{r.category}</div>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-rose-500"
                        style={{ width: `${Math.min(100, r.pct)}%` }}
                      />
                    </div>
                    <div className="font-mono text-right w-20">{money(r.amount)}</div>
                    <div className="text-muted-foreground w-12 text-right">
                      {r.pct.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-3 italic">
                No expenses recorded in this period.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-40"
            />
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-40"
            />
          </div>
          <div className="flex items-center gap-1 text-[11px] flex-wrap">
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-2 py-1 rounded-full border ${
                filterCategory === 'all'
                  ? 'bg-rose-600 text-white border-transparent'
                  : 'bg-card hover:bg-muted text-muted-foreground border-border'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilterCategory(c.key)}
                title={c.help}
                className={`px-2 py-1 rounded-full border ${
                  filterCategory === c.key
                    ? 'bg-rose-600 text-white border-transparent'
                    : 'bg-card hover:bg-muted text-muted-foreground border-border'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Register */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Register
          </CardTitle>
          <CardDescription>
            Every expense posts a payment voucher — drill in via Accounting → Books to
            see the underlying ledger entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid via</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                    {loading ? 'Loading…' : 'No expenses for this filter.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-mono text-xs">{r.voucherNumber}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(r.date).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 border-transparent">
                        {r.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.paidVia}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">
                      {r.narration}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {money(r.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialogOpen && (
        <NewExpenseDialog
          categories={categories}
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewExpenseDialog({
  categories,
  onClose,
  onCreated,
}: {
  categories: ExpenseCategory[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    category: 'rent',
    customCategory: '',
    amount: '',
    paymentMode: 'cash',
    reference: '',
    narration: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Enter an amount greater than 0');
      return;
    }
    if (form.category === 'misc' && !form.customCategory.trim()) {
      toast.error('Give the miscellaneous expense a short name (e.g. "Dust mask")');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/expenses', {
        category: form.category,
        customCategory: form.customCategory || undefined,
        amount: Number(form.amount),
        paymentMode: form.paymentMode,
        reference: form.reference || undefined,
        narration: form.narration || undefined,
        date: form.date,
      });
      toast.success('Expense recorded');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = categories.find((c) => c.key === form.category);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record an expense</DialogTitle>
          <DialogDescription>
            Posts a payment voucher in the books so the trial balance and P&amp;L stay
            consistent. Pick a category, amount, payment mode — done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Category</Label>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            {selectedCategory && (
              <p className="text-[11px] text-muted-foreground">{selectedCategory.help}</p>
            )}
          </div>
          {form.category === 'misc' && (
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Custom name *</Label>
              <Input
                value={form.customCategory}
                onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                placeholder="e.g. Pest control, fire-safety AMC"
                maxLength={60}
              />
              <p className="text-[11px] text-muted-foreground">
                A new sub-account is created with this name (reused across future
                entries — pick a stable label).
              </p>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Amount *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Paid via</Label>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full text-sm"
              value={form.paymentMode}
              onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference</Label>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Bill no. / UTR / cheque #"
              maxLength={60}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              value={form.narration}
              onChange={(e) => setForm({ ...form, narration: e.target.value })}
              rows={2}
              maxLength={200}
              placeholder="Anything specific — vendor name, period covered, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {submitting ? 'Saving…' : 'Record expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
