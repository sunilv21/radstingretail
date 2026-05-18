'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen,
  Wallet,
  Receipt,
  RefreshCcw,
  Plus,
  Trash2,
  FileSpreadsheet,
  Scale,
  TrendingUp,
  Banknote,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

interface Account {
  _id: string;
  name: string;
  groupId: string;
  openingBalance: number;
}
interface Voucher {
  _id: string;
  type: 'payment' | 'receipt' | 'journal' | 'contra';
  voucherNumber: string;
  date: string;
  narration: string;
  entries: { accountId: string; accountName: string; entryType: 'debit' | 'credit'; amount: number }[];
  totalAmount: number;
}
interface TrialBalance {
  rows: {
    accountId: string;
    accountName: string;
    groupName: string;
    openingBalance: number;
    debits: number;
    credits: number;
    closingBalance: number;
  }[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
}
interface PnL {
  income: { accountId: string; name: string; amount: number }[];
  expense: { accountId: string; name: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  closingStock?: {
    totalAtCost: number;
    totalAtRetail: number;
    potentialMargin: number;
    units: number;
    lines: number;
    categories: {
      category: string;
      lines: number;
      units: number;
      valueAtCost: number;
      valueAtRetail: number;
    }[];
  };
  salesByPaymentMode?: {
    breakdown: { mode: 'cash' | 'upi' | 'card' | 'credit' | 'loyalty'; amount: number; count: number }[];
    paymentsTotal: number;
    totalSales: number;
    totalTax: number;
    totalBills: number;
  };
  salesProfit?: {
    billCount: number;
    revenue: number;
    cost: number;
    grossProfit: number;
    marginPct: number;
    zeroCostLines: number;
    topBills: {
      invoiceNumber: string;
      customerName: string;
      createdAt: string;
      revenue: number;
      cost: number;
      profit: number;
      margin: number;
    }[];
  };
}
interface BalanceSheet {
  assets: { accountId: string; name: string; amount: number }[];
  liabilities: { accountId: string; name: string; amount: number }[];
  retainedEarnings: number;
  totalAssets: number;
  totalEquityAndLiab: number;
  balanced: boolean;
}
interface CashFlow {
  netCashFlow: number;
  buckets: { label: string; amount: number }[];
}

const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function AccountingPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [cash, setCash] = useState<CashFlow | null>(null);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);

  const load = async () => {
    try {
      const [a, v, t, p, b, c] = await Promise.all([
        api.get<Account[]>('/accounting/accounts'),
        api.get<Voucher[]>('/accounting/vouchers?limit=50'),
        api.get<TrialBalance>('/accounting/trial-balance'),
        api.get<PnL>('/accounting/profit-loss'),
        api.get<BalanceSheet>('/accounting/balance-sheet'),
        api.get<CashFlow>('/accounting/cash-flow'),
      ]);
      setAccounts(a);
      setVouchers(v);
      setTb(t);
      setPnl(p);
      setBs(b);
      setCash(c);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Accounting</h1>
          <p className="text-muted-foreground mt-1">
            Tally-style ledgers, vouchers, and financial statements
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button
            onClick={() => setVoucherDialogOpen(true)}
            disabled={accounts.length === 0}
            title={accounts.length === 0 ? 'Loading chart of accounts…' : 'Post a manual voucher'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-1" /> New Voucher
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<TrendingUp />}
          label="Net profit (to date)"
          value={inr(pnl?.netProfit ?? 0)}
          tone={pnl && pnl.netProfit < 0 ? 'warning' : undefined}
        />
        <KpiCard icon={<Scale />} label="Total assets" value={inr(bs?.totalAssets ?? 0)} />
        <KpiCard
          icon={<Banknote />}
          label="Net cash flow"
          value={inr(cash?.netCashFlow ?? 0)}
          tone={cash && cash.netCashFlow < 0 ? 'warning' : undefined}
        />
        <KpiCard
          icon={<BookOpen />}
          label="Books balance"
          value={tb?.balanced ? 'Balanced' : 'OUT OF BALANCE'}
          tone={tb?.balanced ? undefined : 'danger'}
        />
      </div>

      <Tabs defaultValue="vouchers">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 max-w-4xl">
          <TabsTrigger value="vouchers">
            <Receipt className="w-4 h-4 mr-1" /> Vouchers
          </TabsTrigger>
          <TabsTrigger value="trial">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Trial bal.
          </TabsTrigger>
          <TabsTrigger value="pnl">
            <TrendingUp className="w-4 h-4 mr-1" /> P&amp;L
          </TabsTrigger>
          <TabsTrigger value="sales-pnl">
            <TrendingUp className="w-4 h-4 mr-1" /> Sales P&amp;L
          </TabsTrigger>
          <TabsTrigger value="bs">
            <Scale className="w-4 h-4 mr-1" /> Balance sheet
          </TabsTrigger>
          <TabsTrigger value="cash">
            <Wallet className="w-4 h-4 mr-1" /> Cash flow
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vouchers">
          <Card>
            <CardHeader>
              <CardTitle>Voucher register</CardTitle>
            </CardHeader>
            <CardContent>
              {vouchers.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No vouchers yet. Click &quot;New Voucher&quot; to record payment, receipt, journal, or contra.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Entries</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.map((v) => (
                      <TableRow key={v._id}>
                        <TableCell className="font-medium">{v.voucherNumber}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {v.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(v.date).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell className="text-xs">{v.narration}</TableCell>
                        <TableCell className="text-right font-semibold">{inr(v.totalAmount)}</TableCell>
                        <TableCell className="text-xs">
                          {v.entries.map((e, i) => (
                            <div key={i}>
                              {e.entryType === 'debit' ? 'Dr ' : 'Cr '}
                              {e.accountName} {inr(e.amount)}
                            </div>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial">
          <Card>
            <CardHeader>
              <CardTitle>Trial balance</CardTitle>
            </CardHeader>
            <CardContent>
              {tb ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Debits</TableHead>
                        <TableHead className="text-right">Credits</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tb.rows
                        .filter(
                          (r) =>
                            r.openingBalance !== 0 ||
                            r.debits !== 0 ||
                            r.credits !== 0 ||
                            r.closingBalance !== 0,
                        )
                        .map((r) => (
                          <TableRow
                            key={r.accountId}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => router.push(`/dashboard/ledger?accountId=${r.accountId}`)}
                            title="Click to drill into the full ledger of this account"
                          >
                            <TableCell className="font-medium underline decoration-dotted">{r.accountName}</TableCell>
                            <TableCell className="text-xs">{r.groupName}</TableCell>
                            <TableCell className="text-right">{inr(r.openingBalance)}</TableCell>
                            <TableCell className="text-right">{inr(r.debits)}</TableCell>
                            <TableCell className="text-right">{inr(r.credits)}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {inr(r.closingBalance)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 text-right text-sm space-x-4">
                    <span>
                      Total Dr: <b>{inr(tb.totalDebits)}</b>
                    </span>
                    <span>
                      Total Cr: <b>{inr(tb.totalCredits)}</b>
                    </span>
                    <Badge variant={tb.balanced ? 'secondary' : 'destructive'}>
                      {tb.balanced ? 'Balanced' : 'OUT OF BALANCE'}
                    </Badge>
                  </div>
                </>
              ) : (
                <div>Loading…</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <CardTitle>Profit &amp; Loss</CardTitle>
            </CardHeader>
            <CardContent>
              {pnl ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2 text-green-700 dark:text-green-400">Income</h3>
                    {pnl.income.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No income yet</div>
                    ) : (
                      pnl.income.map((r) => (
                        <div key={r.accountId} className="flex justify-between py-1 border-b">
                          <span>{r.name}</span>
                          <span>{inr(r.amount)}</span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between pt-2 font-bold">
                      <span>Total Income</span>
                      <span>{inr(pnl.totalIncome)}</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-red-700 dark:text-red-400">Expenses</h3>
                    {pnl.expense.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No expenses yet</div>
                    ) : (
                      pnl.expense.map((r) => (
                        <div key={r.accountId} className="flex justify-between py-1 border-b">
                          <span>{r.name}</span>
                          <span>{inr(r.amount)}</span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between pt-2 font-bold">
                      <span>Total Expenses</span>
                      <span>{inr(pnl.totalExpense)}</span>
                    </div>
                  </div>
                  <div className="md:col-span-2 border-t pt-3 flex justify-between text-lg">
                    <span className="font-bold">Net profit / (loss)</span>
                    <span
                      className={`font-bold ${pnl.netProfit < 0 ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {inr(pnl.netProfit)}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Closing stock panel — informational only. Doesn't
                  alter the P&L numbers above; just shows what's still
                  sitting in inventory at cost / retail / potential
                  margin, with a per-category breakdown of where the
                  value is parked. */}
              {pnl?.closingStock && pnl.closingStock.totalAtCost > 0 && (
                <div className="mt-6 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-blue-700 dark:text-blue-400">
                      Closing Stock — held in inventory
                    </h3>
                    <div className="text-right text-xs">
                      <div>
                        <span className="text-muted-foreground">At cost </span>
                        <b>{inr(pnl.closingStock.totalAtCost)}</b>
                      </div>
                      <div>
                        <span className="text-muted-foreground">At retail </span>
                        <b>{inr(pnl.closingStock.totalAtRetail)}</b>
                      </div>
                      <div className="text-emerald-700 dark:text-emerald-400">
                        <span className="text-muted-foreground">Potential margin </span>
                        <b>{inr(pnl.closingStock.potentialMargin)}</b>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {pnl.closingStock.units.toLocaleString('en-IN')} units across{' '}
                    {pnl.closingStock.lines} SKUs · informational only — Purchase Expense
                    on the P&amp;L above already counts the full inventory cost.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-1">Category</th>
                          <th className="py-1 text-right">SKUs</th>
                          <th className="py-1 text-right">Units</th>
                          <th className="py-1 text-right">Value at cost</th>
                          <th className="py-1 text-right">Value at retail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnl.closingStock.categories.map((c) => (
                          <tr key={c.category} className="border-b">
                            <td className="py-1">{c.category}</td>
                            <td className="py-1 text-right tabular-nums">{c.lines}</td>
                            <td className="py-1 text-right tabular-nums">{c.units}</td>
                            <td className="py-1 text-right tabular-nums">{inr(c.valueAtCost)}</td>
                            <td className="py-1 text-right tabular-nums text-muted-foreground">
                              {inr(c.valueAtRetail)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== SALES P&L (sales-basis view) ================
            Pulls the same P&L payload but presents it from a sales
            perspective: header KPIs (revenue, GST, bills) and the
            payment-mode breakdown strip. Profit number is identical
            to the standard P&L tab — accounting principle says
            revenue is recognised at sale time regardless of when the
            money lands. The breakdown just answers "where did the
            cash actually come from?". */}
        <TabsContent value="sales-pnl">
          <Card>
            <CardHeader>
              <CardTitle>Sales P&amp;L</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Profit computed bill-by-bill: revenue (line taxable amount) minus cost
                of goods sold (qty × product purchase price). Independent of indirect
                expenses on the standard P&amp;L — answers <em>"how much did each sale
                actually make me?"</em>.
              </p>
            </CardHeader>
            <CardContent>
              {pnl?.salesProfit && pnl.salesProfit.billCount > 0 ? (
                <div className="space-y-4">
                  {/* Headline KPIs — the gross profit on bills is the
                      lead number, with revenue / cost / margin% / bill
                      count beside it. */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <div className="rounded-md border bg-muted/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Bills
                      </div>
                      <div className="text-base font-bold tabular-nums">
                        {pnl.salesProfit.billCount.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Revenue (ex-GST)
                      </div>
                      <div className="text-base font-bold tabular-nums">
                        {inr(pnl.salesProfit.revenue)}
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Cost of items sold
                      </div>
                      <div className="text-base font-bold tabular-nums">
                        {inr(pnl.salesProfit.cost)}
                      </div>
                    </div>
                    <div className="rounded-md border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-700 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Gross profit on bills
                      </div>
                      <div
                        className={`text-base font-bold tabular-nums ${pnl.salesProfit.grossProfit < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-300'}`}
                      >
                        {inr(pnl.salesProfit.grossProfit)}
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Margin %
                      </div>
                      <div
                        className={`text-base font-bold tabular-nums ${pnl.salesProfit.marginPct < 0 ? 'text-red-600' : 'text-foreground'}`}
                      >
                        {pnl.salesProfit.marginPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {pnl.salesProfit.zeroCostLines > 0 && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2">
                      ⚠ {pnl.salesProfit.zeroCostLines} sale lines have ₹0 purchase price
                      on the linked product — those lines count their full revenue as
                      profit. Set the purchase price on those products in Inventory to
                      get a more accurate margin.
                    </div>
                  )}

                  {/* Top 10 most-profitable bills — quick read of what's
                      driving the gross profit. */}
                  {pnl.salesProfit.topBills.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">
                        Top 10 most-profitable bills
                      </h3>
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr className="text-left text-muted-foreground">
                              <th className="px-2 py-1.5">Invoice</th>
                              <th className="px-2 py-1.5">Customer</th>
                              <th className="px-2 py-1.5 text-right">Revenue</th>
                              <th className="px-2 py-1.5 text-right">Cost</th>
                              <th className="px-2 py-1.5 text-right">Profit</th>
                              <th className="px-2 py-1.5 text-right">Margin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pnl.salesProfit.topBills.map((b) => (
                              <tr key={b.invoiceNumber} className="border-t">
                                <td className="px-2 py-1 font-mono">{b.invoiceNumber}</td>
                                <td className="px-2 py-1">{b.customerName}</td>
                                <td className="px-2 py-1 text-right tabular-nums">{inr(b.revenue)}</td>
                                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                                  {inr(b.cost)}
                                </td>
                                <td
                                  className={`px-2 py-1 text-right tabular-nums font-semibold ${b.profit < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}
                                >
                                  {inr(b.profit)}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                                  {b.margin.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sales by payment mode (kept beneath the profit
                      analysis as a "where did the cash land" view). */}
                  {pnl.salesByPaymentMode && (
                    <div>
                      <h3 className="font-semibold text-purple-700 dark:text-purple-400 mb-2">
                        Sales by payment mode
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {pnl.salesByPaymentMode.breakdown.map((b) => {
                          const pct =
                            pnl.salesByPaymentMode!.paymentsTotal > 0
                              ? (b.amount / pnl.salesByPaymentMode!.paymentsTotal) * 100
                              : 0;
                          const tone =
                            b.mode === 'cash'
                              ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900'
                              : b.mode === 'upi'
                                ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900'
                                : b.mode === 'card'
                                  ? 'border-purple-300 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-900'
                                  : b.mode === 'credit'
                                    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900'
                                    : 'border-slate-300 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700';
                          return (
                            <div key={b.mode} className={`rounded-md border ${tone} p-2.5`}>
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                {b.mode}
                              </div>
                              <div className="text-base font-bold tabular-nums">{inr(b.amount)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {b.count.toLocaleString('en-IN')} bills · {pct.toFixed(1)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-muted-foreground border-t pt-3">
                    <b>Difference vs standard P&amp;L tab:</b> The standard P&amp;L
                    subtracts <em>all</em> expenses (rent, salaries, utilities, full
                    purchase expense, etc.) from total income. This Sales P&amp;L only
                    looks at the bills themselves — what came in vs what those specific
                    items cost — so it shows your gross trading margin before overheads.
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No sales in the selected period.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bs">
          <Card>
            <CardHeader>
              <CardTitle>Balance sheet</CardTitle>
            </CardHeader>
            <CardContent>
              {bs ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2 text-blue-700 dark:text-blue-400">Assets</h3>
                    {bs.assets
                      .filter((a) => a.amount !== 0)
                      .map((a) => (
                        <div key={a.accountId} className="flex justify-between py-1 border-b">
                          <span>{a.name}</span>
                          <span>{inr(a.amount)}</span>
                        </div>
                      ))}
                    <div className="flex justify-between pt-2 font-bold">
                      <span>Total Assets</span>
                      <span>{inr(bs.totalAssets)}</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-orange-700 dark:text-orange-400">
                      Liabilities &amp; Equity
                    </h3>
                    {bs.liabilities
                      .filter((a) => a.amount !== 0)
                      .map((a) => (
                        <div key={a.accountId} className="flex justify-between py-1 border-b">
                          <span>{a.name}</span>
                          <span>{inr(a.amount)}</span>
                        </div>
                      ))}
                    <div className="flex justify-between py-1 border-b">
                      <span>Retained Earnings (P&amp;L)</span>
                      <span className={bs.retainedEarnings < 0 ? 'text-red-600' : ''}>
                        {inr(bs.retainedEarnings)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 font-bold">
                      <span>Total Liab + Equity</span>
                      <span>{inr(bs.totalEquityAndLiab)}</span>
                    </div>
                  </div>
                  <div className="md:col-span-2 text-center">
                    <Badge
                      variant={bs.balanced ? 'secondary' : 'destructive'}
                      className="text-sm py-1 px-3"
                    >
                      {bs.balanced ? '✓ Books balanced' : '✗ Out of balance'}
                    </Badge>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash">
          <Card>
            <CardHeader>
              <CardTitle>Cash flow statement</CardTitle>
            </CardHeader>
            <CardContent>
              {cash ? (
                <>
                  {cash.buckets
                    .filter((b) => b.amount !== 0)
                    .map((b) => (
                      <div key={b.label} className="flex justify-between py-2 border-b">
                        <span>{b.label}</span>
                        <span className={b.amount < 0 ? 'text-red-600' : 'text-green-600'}>
                          {inr(b.amount)}
                        </span>
                      </div>
                    ))}
                  <div className="flex justify-between pt-3 text-lg font-bold">
                    <span>Net cash flow</span>
                    <span className={cash.netCashFlow < 0 ? 'text-red-600' : 'text-green-600'}>
                      {inr(cash.netCashFlow)}
                    </span>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {voucherDialogOpen && (
        <VoucherDialog
          accounts={accounts}
          onClose={() => setVoucherDialogOpen(false)}
          onPosted={() => {
            setVoucherDialogOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'warning' | 'danger';
}) {
  const c = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-orange-600' : '';
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-md bg-muted flex items-center justify-center ${c}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold ${c}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function VoucherDialog({
  accounts,
  onClose,
  onPosted,
}: {
  accounts: Account[];
  onClose: () => void;
  onPosted: () => void;
}) {
  const [type, setType] = useState<'payment' | 'receipt' | 'journal' | 'contra'>('payment');
  const [narration, setNarration] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  // Default the two starter rows to *different* accounts so the user can save
  // without first picking a second account. Falls back to the first account
  // for both if only one exists.
  const [entries, setEntries] = useState<
    { accountId: string; entryType: 'debit' | 'credit'; amount: string }[]
  >([
    { accountId: accounts[0]?._id || '', entryType: 'debit', amount: '' },
    { accountId: (accounts[1] || accounts[0])?._id || '', entryType: 'credit', amount: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // When the user types an amount on the only row of its side AND the form has
  // exactly one debit + one credit, auto-mirror to the other side so the
  // balance check passes without manual duplication. As soon as the user
  // adds a third row, auto-mirror stops (multi-leg journals).
  const updateEntry = (
    i: number,
    patch: Partial<{ accountId: string; entryType: 'debit' | 'credit'; amount: string }>,
  ) => setEntries((prev) => {
    const next = prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    if (
      next.length === 2 &&
      patch.amount !== undefined &&
      next.filter((x) => x.entryType === 'debit').length === 1 &&
      next.filter((x) => x.entryType === 'credit').length === 1
    ) {
      const otherIdx = i === 0 ? 1 : 0;
      // Only mirror if the other side hasn't been hand-edited (still empty/0)
      const otherAmount = Number(next[otherIdx].amount || 0);
      const newAmount = Number(patch.amount || 0);
      if (otherAmount === 0 || otherAmount === Number(prev[i].amount || 0)) {
        next[otherIdx] = { ...next[otherIdx], amount: newAmount > 0 ? String(newAmount) : '' };
      }
    }
    return next;
  });

  const addEntry = () =>
    setEntries((prev) => [
      ...prev,
      { accountId: accounts[0]?._id || '', entryType: 'credit', amount: '' },
    ]);
  const removeEntry = (i: number) => setEntries((prev) => prev.filter((_, idx) => idx !== i));

  const totalDr = entries
    .filter((e) => e.entryType === 'debit')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalCr = entries
    .filter((e) => e.entryType === 'credit')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const diff = Math.round((totalDr - totalCr) * 100) / 100;
  const balanced = Math.abs(diff) < 0.01 && totalDr > 0;
  const allRowsHaveAccount = entries.every((e) => e.accountId);
  const allRowsHaveAmount = entries.every((e) => Number(e.amount || 0) > 0);
  const canPost = balanced && allRowsHaveAccount && allRowsHaveAmount && !submitting;
  const blockReason = !accounts.length
    ? 'Loading chart of accounts…'
    : !allRowsHaveAccount
      ? 'Pick an account on every row'
      : !allRowsHaveAmount
        ? 'Enter an amount on every row'
      : !balanced
        ? diff > 0
          ? `Credits short by ₹${Math.abs(diff).toFixed(2)}`
          : `Debits short by ₹${Math.abs(diff).toFixed(2)}`
        : '';

  const submit = async () => {
    if (!canPost) {
      toast.error(blockReason || 'Voucher is not ready to post');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/accounting/vouchers', {
        type,
        narration,
        date,
        entries: entries.map((e) => ({ ...e, amount: Number(e.amount) })),
      });
      toast.success('Voucher posted');
      onPosted();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New voucher</DialogTitle>
          <DialogDescription>
            Manual journal posting. Add at least one debit and one credit row;
            totals must match (Σ Dr = Σ Cr) before you can post.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="h-9 w-full border rounded px-2 bg-background"
            >
              <option value="payment">Payment</option>
              <option value="receipt">Receipt</option>
              <option value="journal">Journal</option>
              <option value="contra">Contra (cash ↔ bank)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Narration</Label>
            <Input value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dr/Cr</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e, i) => (
              <TableRow key={i}>
                <TableCell>
                  <select
                    value={e.entryType}
                    onChange={(ev) => updateEntry(i, { entryType: ev.target.value as any })}
                    className="h-8 border rounded px-1 bg-background"
                  >
                    <option value="debit">Dr</option>
                    <option value="credit">Cr</option>
                  </select>
                </TableCell>
                <TableCell>
                  <select
                    value={e.accountId}
                    onChange={(ev) => updateEntry(i, { accountId: ev.target.value })}
                    className="h-8 w-full border rounded px-1 bg-background"
                  >
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={e.amount}
                    onChange={(ev) => updateEntry(i, { amount: ev.target.value })}
                    className="h-8 text-right"
                  />
                </TableCell>
                <TableCell>
                  {entries.length > 2 && (
                    <Button size="icon" variant="ghost" onClick={() => removeEntry(i)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Button variant="outline" size="sm" onClick={addEntry}>
          <Plus className="w-4 h-4 mr-1" /> Add entry
        </Button>

        <div className="bg-muted p-3 rounded text-sm grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <div>
            Dr: <b>{inr(totalDr)}</b>
          </div>
          <div>
            Cr: <b>{inr(totalCr)}</b>
          </div>
          <Badge variant={balanced ? 'secondary' : 'destructive'} className="justify-self-end">
            {balanced ? 'Balanced' : `Δ ₹${Math.abs(diff).toFixed(2)}`}
          </Badge>
        </div>

        {!canPost && blockReason && (
          <div className="text-xs text-amber-700 dark:text-amber-400 -mt-1">
            {blockReason}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canPost}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting ? 'Posting…' : 'Post voucher'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
