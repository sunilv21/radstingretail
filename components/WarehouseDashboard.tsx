'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
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
  Warehouse,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Truck,
  PackageOpen,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { can } from '@/lib/rbac';
import type { AuthUser } from '@/lib/types';

interface WarehouseStats {
  closingStockValueCost: number;
  closingStockValueMrp: number;
  totalUnits: number;
  totalProducts: number;
  lowStockItems: number;
  outOfStock: number;
  inbound: {
    unitsThisMonth: number;
    movementsThisMonth: number;
    recentGrns: {
      _id: string;
      poNumber: string;
      grnNumber: string | null;
      supplier: string;
      total: number;
      receivedAt: string;
    }[];
  };
  outbound: {
    unitsThisMonth: number;
    movementsThisMonth: number;
    pending: {
      _id: string;
      transferNumber: string;
      toBranch: string;
      lines: number;
      units: number;
      status: 'requested' | 'in_transit';
      createdAt: string;
    }[];
    recent: {
      _id: string;
      transferNumber: string;
      toBranch: string;
      lines: number;
      units: number;
      status: 'in_transit' | 'received';
      dispatchedAt: string | null;
      createdAt: string;
    }[];
  };
  topHoldings: {
    productId: string;
    name: string;
    sku: string;
    stock: number;
    unit: string;
    purchasePrice: number;
    value: number;
  }[];
}

const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function WarehouseDashboard({ me }: { me: AuthUser | null }) {
  const [stats, setStats] = useState<WarehouseStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await api.get<WarehouseStats>('/reports/warehouse-dashboard');
        setStats(data);
      } catch (err) {
        if (err instanceof ApiError && err.status !== 401) {
          console.error(err.message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canTransfer = can(me, 'transfers', 'create');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-violet-600" />
            Warehouse
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bulk stock holding. No POS, no customer bills — just inbound from
            suppliers and outbound to your retail branches.
          </p>
        </div>
        <div className="flex gap-2">
          {canTransfer && (
            <Link href="/dashboard/transfers">
              <Button size="lg" className="bg-violet-600 hover:bg-violet-700">
                <ArrowLeftRight className="w-5 h-5 mr-2" /> Send stock to a store
              </Button>
            </Link>
          )}
          {can(me, 'purchases', 'create') && (
            <Link href="/dashboard/purchases">
              <Button size="lg" variant="outline">
                <Truck className="w-5 h-5 mr-2" /> Receive from supplier
              </Button>
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="gap-1 py-2">
              <CardHeader className="pb-0">
                <CardTitle className="h-3 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-6 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            <StatCard
              title="Closing stock (at cost)"
              value={inr(stats.closingStockValueCost)}
              hint={`${stats.totalUnits.toLocaleString('en-IN')} units · ${stats.totalProducts} SKUs`}
              icon={<Package className="w-4 h-4" />}
              tone="violet"
            />
            <StatCard
              title="At retail (MRP)"
              value={inr(stats.closingStockValueMrp)}
              hint="Notional sell-through value"
              icon={<TrendingUp className="w-4 h-4" />}
              tone="blue"
            />
            <StatCard
              title="Inbound this month"
              value={`${stats.inbound.unitsThisMonth.toLocaleString('en-IN')} units`}
              hint={`${stats.inbound.movementsThisMonth} GRN/movement${stats.inbound.movementsThisMonth === 1 ? '' : 's'}`}
              icon={<PackageOpen className="w-4 h-4" />}
              tone="emerald"
            />
            <StatCard
              title="Outbound this month"
              value={`${stats.outbound.unitsThisMonth.toLocaleString('en-IN')} units`}
              hint={`${stats.outbound.movementsThisMonth} transfer${stats.outbound.movementsThisMonth === 1 ? '' : 's'}`}
              icon={<TrendingDown className="w-4 h-4" />}
              tone="amber"
            />
          </div>

          {(stats.lowStockItems > 0 || stats.outOfStock > 0) && (
            <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
              <CardContent className="p-3 flex items-center gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <strong>{stats.outOfStock}</strong> SKU
                  {stats.outOfStock === 1 ? ' is' : 's are'} fully depleted
                  {stats.lowStockItems > 0 && (
                    <>
                      , <strong>{stats.lowStockItems}</strong> more below
                      reorder level
                    </>
                  )}
                  . Place a purchase order or rebalance from another branch.
                </div>
                <Link href="/dashboard/inventory">
                  <Button size="sm" variant="outline">
                    Open inventory
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-violet-600" />
                  Outbound pipeline
                </CardTitle>
                <Link href="/dashboard/transfers" className="text-xs text-blue-600 hover:underline">
                  All transfers →
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TRF #</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.outbound.pending.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground italic text-sm">
                          Nothing pending. All shipments delivered.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stats.outbound.pending.map((t) => (
                        <TableRow key={t._id}>
                          <TableCell className="font-mono text-xs">{t.transferNumber}</TableCell>
                          <TableCell className="text-xs">{t.toBranch}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-xs text-muted-foreground">
                              {t.lines} line{t.lines === 1 ? '' : 's'} ·{' '}
                            </span>
                            <strong>{t.units}</strong>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                t.status === 'in_transit'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] uppercase'
                                  : 'text-[10px] uppercase'
                              }
                            >
                              {t.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PackageOpen className="w-4 h-4 text-emerald-600" />
                  Recent inbound (GRNs)
                </CardTitle>
                <Link href="/dashboard/purchases" className="text-xs text-blue-600 hover:underline">
                  All purchases →
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GRN</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.inbound.recentGrns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground italic text-sm">
                          No GRNs yet. Receive a purchase order to stock the warehouse.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stats.inbound.recentGrns.map((g) => (
                        <TableRow key={g._id}>
                          <TableCell className="font-mono text-xs">
                            {g.grnNumber || g.poNumber}
                          </TableCell>
                          <TableCell className="text-xs">{g.supplier}</TableCell>
                          <TableCell className="text-right text-xs">{inr(g.total)}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(g.receivedAt).toLocaleDateString('en-IN')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-violet-600" />
                Top stock holdings (by value)
              </CardTitle>
              <Link href="/dashboard/inventory" className="text-xs text-blue-600 hover:underline">
                Full inventory →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topHoldings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground italic text-sm">
                        No stock yet. Receive a purchase to start populating the warehouse.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.topHoldings.map((h) => (
                      <TableRow key={h.productId}>
                        <TableCell className="text-sm">{h.name}</TableCell>
                        <TableCell className="font-mono text-xs">{h.sku}</TableCell>
                        <TableCell className="text-right text-xs">
                          {h.stock} {h.unit}
                        </TableCell>
                        <TableCell className="text-right text-xs">{inr(h.purchasePrice)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{inr(h.value)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}

      <div>
        <h2 className="text-xl font-semibold mb-3">Warehouse actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            title="Inventory"
            description="Browse stock, adjust counts, low-stock list"
            icon={Package}
            href="/dashboard/inventory"
            tone="violet"
          />
          <QuickAction
            title="Send to store"
            description="Issue a transfer — deducts here, lands at the store on receipt"
            icon={ArrowLeftRight}
            href="/dashboard/transfers"
            tone="blue"
          />
          <QuickAction
            title="Receive a PO"
            description="GRN against an open purchase order"
            icon={Truck}
            href="/dashboard/purchases"
            tone="emerald"
          />
          <QuickAction
            title="Insights"
            description="Dead stock, top holdings, margin"
            icon={TrendingUp}
            href="/dashboard/insights"
            tone="amber"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone: 'violet' | 'blue' | 'emerald' | 'amber';
}) {
  const toneClass: Record<typeof tone, string> = {
    violet: 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  };
  return (
    <Card className="gap-1 py-2">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${toneClass[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{title}</div>
          <div className="text-lg font-bold leading-tight">{value}</div>
          {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  title,
  description,
  icon: Icon,
  href,
  tone,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  tone: 'violet' | 'blue' | 'emerald' | 'amber';
}) {
  const toneClass: Record<typeof tone, string> = {
    violet: 'bg-violet-500/10 text-violet-600',
    blue: 'bg-blue-500/10 text-blue-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
  };
  return (
    <Link href={href}>
      <Card className="h-full cursor-pointer hover:shadow-lg transition-shadow gap-2 py-2">
        <CardHeader className="pb-1">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${toneClass[tone]}`}>
              <Icon className="w-4 h-4" />
            </div>
            <CardTitle className="text-sm">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground leading-snug">{description}</p>
          <Button variant="outline" size="sm" className="w-full group h-8">
            Open <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}
