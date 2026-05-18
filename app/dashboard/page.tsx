'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Barcode,
  ShoppingCart,
  Package,
  Truck,
  BarChart3,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { can, getCurrentUser, isActiveWarehouse } from '@/lib/rbac';
import type { AuthUser } from '@/lib/types';
import WarehouseDashboard from '@/components/WarehouseDashboard';

interface DashboardStats {
  totalSales: number;
  todaysSales: number;
  todaysInvoices: number;
  totalInventoryValue: number;
  lowStockItems: number;
  outOfStock: number;
  totalProducts: number;
  recentSales: {
    _id: string;
    invoiceNumber: string;
    customer: string;
    grandTotal: number;
    createdAt: string;
  }[];
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => setMe(getCurrentUser()), []);

  // When the active branch is a warehouse, the entire dashboard swaps to the
  // stock-centric variant — no POS / Sales / GST surfaces, just inbound,
  // outbound, holdings. We skip the sales-dashboard fetch in that case.
  const warehouseMode = isActiveWarehouse(me);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      setLoading(false);
      return;
    }
    if (warehouseMode) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await api.get<DashboardStats>('/reports/dashboard');
        setStats(data);
      } catch (err) {
        if (err instanceof ApiError && err.status !== 401) {
          console.error(err.message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [warehouseMode]);

  if (warehouseMode) {
    return <WarehouseDashboard me={me} />;
  }

  // Quick-access cards filtered by RBAC — cashiers don't see Accounting at
  // all, anyone without sales:read won't see POS or Sales History, etc.
  const allModules = [
    {
      title: 'POS / Billing',
      description: 'Scan, search, bill — the fast lane',
      icon: Barcode,
      href: '/dashboard/pos',
      color: 'bg-blue-500/10 text-blue-600',
      visible: can(me, 'sales', 'create'),
    },
    {
      title: 'Sales History',
      description: 'Browse invoices and view details',
      icon: ShoppingCart,
      href: '/dashboard/sales',
      color: 'bg-indigo-500/10 text-indigo-600',
      visible: can(me, 'sales', 'read'),
    },
    {
      title: 'Inventory',
      description: 'Products, barcodes, stock, labels',
      icon: Package,
      href: '/dashboard/inventory',
      color: 'bg-green-500/10 text-green-600',
      visible: can(me, 'inventory', 'read') || can(me, 'products', 'read'),
    },
    {
      title: 'Purchases',
      description: 'Manage POs and supplier stock-in',
      icon: Truck,
      href: '/dashboard/purchases',
      color: 'bg-orange-500/10 text-orange-600',
      visible: can(me, 'purchases', 'read'),
    },
    {
      title: 'Accounting',
      description: 'Ledger, GST, reports',
      icon: BarChart3,
      href: '/dashboard/accounting',
      color: 'bg-purple-500/10 text-purple-600',
      visible: can(me, 'accounting', 'read'),
    },
  ];
  const modules = allModules.filter((m) => m.visible);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Live metrics for your store.
          </p>
        </div>
        {can(me, 'sales', 'create') && (
          <Link href="/dashboard/pos">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
              <Barcode className="w-5 h-5 mr-2" /> Open POS
            </Button>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <StatCard
            title="Today's sales"
            value={inr(stats.todaysSales)}
            hint={`${stats.todaysInvoices} invoice${stats.todaysInvoices === 1 ? '' : 's'}`}
          />
          <StatCard
            title="Lifetime sales"
            value={inr(stats.totalSales)}
            hint="All completed invoices"
          />
          <StatCard
            title="Inventory value"
            value={inr(stats.totalInventoryValue)}
            hint={`${stats.totalProducts} products`}
          />
          <StatCard
            title="Low stock"
            value={String(stats.lowStockItems)}
            hint={`${stats.outOfStock} out of stock`}
            tone={stats.lowStockItems > 0 ? 'warning' : undefined}
          />
        </div>
      ) : null}

      {stats && stats.recentSales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {stats.recentSales.map((s) => (
                <div key={s._id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{s.invoiceNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.customer} · {new Date(s.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="font-semibold">{inr(s.grandTotal)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">Quick access</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.href} href={m.href}>
                <Card className="h-full cursor-pointer hover:shadow-lg transition-shadow gap-2 py-2">
                  <CardHeader className="pb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center shrink-0`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <CardTitle className="text-sm">{m.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground leading-snug">{m.description}</p>
                    <Button variant="outline" size="sm" className="w-full group h-8">
                      Open{' '}
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: 'warning';
}) {
  return (
    <Card className="gap-1 py-2">
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-bold leading-tight ${tone === 'warning' ? 'text-orange-600' : ''}`}>
          {value}
        </p>
        {hint ? <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
