'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Sparkles,
  RefreshCcw,
  Package,
  AlertTriangle,
  Truck,
  ArrowLeftRight,
  Clock,
  Snowflake,
  Zap,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

const money = (n: number) =>
  '₹' +
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = (n: number) => Number(n || 0).toLocaleString('en-IN');

interface WarehouseInsightsResp {
  generatedAt: string;
  deadStock: {
    productId: string;
    name: string;
    sku: string;
    stock: number;
    stockValue: number;
    lastOutAt: number | null;
    daysIdle: number | null;
  }[];
  slowMovers: {
    productId: string;
    name: string;
    sku: string;
    stock: number;
    stockValue: number;
    lastOutAt: number | null;
    daysIdle: number | null;
  }[];
  fastMovers: {
    productId: string;
    name: string;
    sku: string;
    stock: number;
    totalOut: number;
  }[];
  topShipped: {
    productId: string | null;
    name: string;
    sku: string;
    qty: number;
    transferCount: number;
  }[];
  topDestinations: {
    branchId: string;
    branchName: string;
    branchType: 'store' | 'warehouse';
    qty: number;
    transferCount: number;
  }[];
  stockoutIncidents: {
    productId: string;
    name: string;
    sku: string;
    currentStock: number;
    incidents: number;
    lastAt: string;
  }[];
  supplierLeadTime: {
    supplierId: string | null;
    supplierName: string;
    avgDays: number;
    minDays: number;
    maxDays: number;
    grns: number;
  }[];
  suppliersCount: number;
  deadStockValue: number;
  slowMoverValue: number;
}

export default function WarehouseInsights() {
  const [data, setData] = useState<WarehouseInsightsResp | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<WarehouseInsightsResp>('/reports/warehouse-insights'));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-violet-600" />
            Warehouse insights
          </h1>
          <p className="text-muted-foreground mt-1">
            Stock that's sitting too long, items in heavy rotation, where your
            outbound goes, and how reliable your suppliers are. No customer or
            POS metrics — they don't apply here.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" />
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SumCard
            label="Dead stock (90+ days idle)"
            value={money(data.deadStockValue)}
            hint={`${data.deadStock.length} SKU${data.deadStock.length === 1 ? '' : 's'} at risk`}
            icon={<Snowflake className="w-4 h-4" />}
            tone={data.deadStockValue > 0 ? 'amber' : 'gray'}
          />
          <SumCard
            label="Slow movers (30–90d)"
            value={money(data.slowMoverValue)}
            hint={`${data.slowMovers.length} watch-list item${data.slowMovers.length === 1 ? '' : 's'}`}
            icon={<Clock className="w-4 h-4" />}
            tone={data.slowMoverValue > 0 ? 'blue' : 'gray'}
          />
          <SumCard
            label="Top destination"
            value={data.topDestinations[0]?.branchName || '—'}
            hint={
              data.topDestinations[0]
                ? `${num(data.topDestinations[0].qty)} units · last 90 days`
                : 'No transfers yet'
            }
            icon={<ArrowLeftRight className="w-4 h-4" />}
            tone="violet"
          />
          <SumCard
            label="Stockout incidents (30d)"
            value={String(data.stockoutIncidents.length)}
            hint={
              data.stockoutIncidents.length === 0
                ? 'No items hit zero recently'
                : 'SKUs that ran out — restock priority'
            }
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={data.stockoutIncidents.length > 0 ? 'red' : 'gray'}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard
          title="Top shipped SKUs (last 90 days)"
          icon={<Zap className="w-4 h-4 text-emerald-600" />}
          subtitle="What this warehouse pushes out the most. Stocking strategy fodder."
        >
          {!data || data.topShipped.length === 0 ? (
            <Empty>No transfers dispatched in the last 90 days.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units shipped</TableHead>
                  <TableHead className="text-right">Transfers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topShipped.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground mr-2">#{i + 1}</span>
                      {p.name}
                      {p.sku && (
                        <span className="font-mono text-[10px] text-muted-foreground ml-2">
                          {p.sku}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{num(p.qty)}</TableCell>
                    <TableCell className="text-right text-xs">{p.transferCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title="Top destination branches (last 90 days)"
          icon={<Warehouse className="w-4 h-4 text-violet-600" />}
          subtitle="Where your stock actually lands. Imbalanced split? Rebalance the inbound POs."
        >
          {!data || data.topDestinations.length === 0 ? (
            <Empty>No outbound transfers in the last 90 days.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Transfers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topDestinations.map((d, i) => (
                  <TableRow key={d.branchId}>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground mr-2">#{i + 1}</span>
                      {d.branchName}
                      {d.branchType === 'warehouse' && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          WH
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{num(d.qty)}</TableCell>
                    <TableCell className="text-right text-xs">{d.transferCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title="Fast movers (lifetime out + transfer)"
          icon={<Zap className="w-4 h-4 text-blue-600" />}
          subtitle="High-velocity SKUs. Make sure these never go to zero."
        >
          {!data || data.fastMovers.length === 0 ? (
            <Empty>No outbound movements recorded yet.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Current stock</TableHead>
                  <TableHead className="text-right">Total out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.fastMovers.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground mr-2">#{i + 1}</span>
                      {p.name}
                      <span className="font-mono text-[10px] text-muted-foreground ml-2">
                        {p.sku}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right text-xs ${p.stock <= 0 ? 'text-rose-600 font-semibold' : ''}`}
                    >
                      {num(p.stock)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{num(p.totalOut)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title="Supplier reliability (last 180 days)"
          icon={<Truck className="w-4 h-4 text-emerald-600" />}
          subtitle="Average days from PO date to first GRN. Lower is better — sorted by avg."
        >
          {!data || data.supplierLeadTime.length === 0 ? (
            <Empty>Not enough GRN history yet to compute lead times.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Avg days</TableHead>
                  <TableHead className="text-right">Best / Worst</TableHead>
                  <TableHead className="text-right">GRNs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.supplierLeadTime.map((s) => (
                  <TableRow key={s.supplierId || s.supplierName}>
                    <TableCell className="text-sm">{s.supplierName}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          s.avgDays <= 3
                            ? 'text-emerald-600 font-semibold'
                            : s.avgDays >= 14
                              ? 'text-rose-600 font-semibold'
                              : 'font-semibold'
                        }
                      >
                        {s.avgDays.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                      {s.minDays.toFixed(1)} / {s.maxDays.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right text-xs">{s.grns}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Dead stock — no outbound movement in 90+ days"
        icon={<Snowflake className="w-4 h-4 text-amber-600" />}
        subtitle="Capital tied up here. Push to a store, return to supplier, or liquidate."
      >
        {!data || data.deadStock.length === 0 ? (
          <Empty>Nothing dead — every in-stock SKU has moved within 90 days.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Value at cost</TableHead>
                <TableHead className="text-right">Last shipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.deadStock.map((p) => (
                <TableRow key={p.productId}>
                  <TableCell className="text-sm">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="text-right">{num(p.stock)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-amber-700 dark:text-amber-400">
                    {money(p.stockValue)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {p.lastOutAt ? (
                      `${p.daysIdle} days ago`
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Never shipped
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard
        title="Slow movers — last shipped 30–90 days ago"
        icon={<Clock className="w-4 h-4 text-blue-600" />}
        subtitle="The watch list before they become dead stock."
      >
        {!data || data.slowMovers.length === 0 ? (
          <Empty>No slow movers — recent or stale, nothing in the middle.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Value at cost</TableHead>
                <TableHead className="text-right">Last shipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slowMovers.map((p) => (
                <TableRow key={p.productId}>
                  <TableCell className="text-sm">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="text-right">{num(p.stock)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {money(p.stockValue)}
                  </TableCell>
                  <TableCell className="text-right text-xs">{p.daysIdle} days ago</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard
        title="Stockout incidents (last 30 days)"
        icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
        subtitle="SKUs that hit zero. Each incident is one movement that depleted the stock to ≤0."
      >
        {!data || data.stockoutIncidents.length === 0 ? (
          <Empty>No stockouts in the last 30 days. Inventory plan is working.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Current stock</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
                <TableHead className="text-right">Last hit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stockoutIncidents.map((s) => (
                <TableRow key={s.productId}>
                  <TableCell className="text-sm">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                  <TableCell
                    className={`text-right text-xs ${s.currentStock <= 0 ? 'text-rose-600 font-semibold' : ''}`}
                  >
                    {num(s.currentStock)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{s.incidents}</TableCell>
                  <TableCell className="text-right text-xs">
                    {new Date(s.lastAt).toLocaleDateString('en-IN')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-sm text-muted-foreground italic py-6">{children}</div>;
}

function SumCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'violet' | 'emerald' | 'amber' | 'red' | 'blue' | 'gray';
}) {
  const cls =
    tone === 'violet'
      ? 'text-violet-600'
      : tone === 'emerald'
        ? 'text-emerald-600'
        : tone === 'amber'
          ? 'text-amber-600'
          : tone === 'red'
            ? 'text-red-600'
            : tone === 'blue'
              ? 'text-blue-600'
              : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
          {icon}
          {label}
        </div>
        <div className={`text-lg font-bold mt-1 truncate ${cls}`}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-1 truncate">{hint}</div>}
      </CardContent>
    </Card>
  );
}
