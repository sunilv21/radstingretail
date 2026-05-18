'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sparkles, RefreshCcw, TrendingUp, TrendingDown, AlertTriangle, Users, Package, ShoppingCart, Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { getCurrentUser, isActiveWarehouse } from '@/lib/rbac';
import WarehouseInsights from '@/components/WarehouseInsights';

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => Number(n || 0).toLocaleString('en-IN');

interface InsightsResp {
  generatedAt: string;
  topCustomers: { customerId: string | null; customerName: string; revenue: number; invoices: number }[];
  topProductsByRevenue: { productId: string | null; productName: string; revenue: number; qty: number; invoiceCount: number }[];
  topProductsByQty: { productId: string | null; productName: string; qty: number; revenue: number }[];
  deadStock: {
    productId: string;
    name: string;
    sku: string;
    stock: number;
    stockValue: number;
    lastSoldAt: number | null;
    daysSinceSold: number | null;
  }[];
  bestMargin: { name: string; sku: string; sellingPrice: number; purchasePrice: number; marginPct: number | null }[];
  worstMargin: { name: string; sku: string; sellingPrice: number; purchasePrice: number; marginPct: number | null }[];
  avgPaymentAgeHours: number;
  duplicates: {
    customerPhones: { phone: string; count: number; customers: { _id: string; name: string; gstNumber: string }[] }[];
    supplierPhones: { phone: string; count: number; suppliers: { _id: string; name: string; gstNumber: string }[] }[];
    productNames: { name: string; count: number; products: { _id: string; sku: string; barcode: string; sellingPrice: number }[] }[];
    similarCustomers: { a: { _id: string; name: string }; b: { _id: string; name: string } }[];
  };
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResp | null>(null);
  const [loading, setLoading] = useState(false);
  // Warehouse mode swaps to a stock-centric variant: dead stock, slow
  // movers, top shipped, destination breakdown, supplier lead time. The
  // retail customer/sales/margin panels would be empty there.
  const [warehouseMode, setWarehouseMode] = useState(false);

  useEffect(() => {
    setWarehouseMode(isActiveWarehouse(getCurrentUser()));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<InsightsResp>('/reports/insights'));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (warehouseMode) return;
    load();
  }, [warehouseMode]);

  if (warehouseMode) return <WarehouseInsights />;

  const totalDuplicates =
    (data?.duplicates.customerPhones.length || 0) +
    (data?.duplicates.supplierPhones.length || 0) +
    (data?.duplicates.productNames.length || 0) +
    (data?.duplicates.similarCustomers.length || 0);

  const deadStockValue = (data?.deadStock || []).reduce((s, r) => s + r.stockValue, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-600" />
            Insights
          </h1>
          <p className="text-muted-foreground mt-1">
            Pre-built answers to the questions an owner cares about. Plus a data-quality
            scanner that flags duplicate customers, suppliers, and products.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SumCard
            label="Top customer"
            value={data.topCustomers[0]?.customerName || '—'}
            hint={data.topCustomers[0] ? `${money(data.topCustomers[0].revenue)} · ${data.topCustomers[0].invoices} invoices` : 'No sales yet'}
            icon={<Trophy className="w-4 h-4" />}
            tone="purple"
          />
          <SumCard
            label="Best-selling item"
            value={data.topProductsByRevenue[0]?.productName || '—'}
            hint={data.topProductsByRevenue[0] ? money(data.topProductsByRevenue[0].revenue) : ''}
            icon={<Package className="w-4 h-4" />}
            tone="emerald"
          />
          <SumCard
            label="Dead stock value"
            value={money(deadStockValue)}
            hint={`${data.deadStock.length} items idle 90+ days`}
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={deadStockValue > 0 ? 'amber' : 'gray'}
          />
          <SumCard
            label="Data-quality issues"
            value={String(totalDuplicates)}
            hint={totalDuplicates === 0 ? 'Clean — no duplicates flagged' : 'Tap Duplicates section to review'}
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={totalDuplicates > 0 ? 'red' : 'gray'}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top customers */}
        <SectionCard title="Top 10 customers by revenue" icon={<Users className="w-4 h-4" />}>
          {data?.topCustomers.length === 0 ? (
            <Empty>No completed sales yet.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Invoices</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(data?.topCustomers || []).map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span className="text-muted-foreground mr-2">#{i + 1}</span>
                      {c.customerName}
                    </TableCell>
                    <TableCell className="text-right">{c.invoices}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{money(c.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        {/* Top products by revenue */}
        <SectionCard title="Top 10 products by revenue" icon={<ShoppingCart className="w-4 h-4" />}>
          {data?.topProductsByRevenue.length === 0 ? (
            <Empty>No completed sales yet.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(data?.topProductsByRevenue || []).map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span className="text-muted-foreground mr-2">#{i + 1}</span>
                      {p.productName}
                    </TableCell>
                    <TableCell className="text-right">{num(p.qty)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{money(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        {/* Best margin */}
        <SectionCard title="Best margin (highest profit %)" icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Sell</TableHead><TableHead className="text-right">Margin</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(data?.bestMargin || []).slice(0, 10).map((p) => (
                <TableRow key={p.sku}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(p.purchasePrice)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(p.sellingPrice)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600 font-semibold">{(p.marginPct || 0).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        {/* Worst margin */}
        <SectionCard title="Lowest margin / negative" icon={<TrendingDown className="w-4 h-4 text-red-600" />}>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Sell</TableHead><TableHead className="text-right">Margin</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(data?.worstMargin || []).slice(0, 10).map((p) => (
                <TableRow key={p.sku}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(p.purchasePrice)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(p.sellingPrice)}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${(p.marginPct || 0) < 10 ? 'text-red-600' : ''}`}>
                    {(p.marginPct || 0).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>

      {/* Dead stock */}
      <SectionCard
        title="Dead stock (no sales in 90+ days)"
        icon={<Package className="w-4 h-4 text-amber-600" />}
        subtitle="Stock-on-hand value of items that haven't moved. Consider liquidating or returning to supplier."
      >
        {data?.deadStock.length === 0 ? (
          <Empty>No dead stock — every product with stock has sold within 90 days.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Stock value</TableHead><TableHead className="text-right">Last sold</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(data?.deadStock || []).map((p) => (
                <TableRow key={p.productId}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="text-right">{num(p.stock)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-amber-700">{money(p.stockValue)}</TableCell>
                  <TableCell className="text-right text-xs">
                    {p.lastSoldAt
                      ? `${p.daysSinceSold} days ago`
                      : <Badge variant="outline" className="text-[10px]">Never sold</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {/* Duplicates / data quality */}
      <SectionCard
        title="Data-quality issues"
        icon={<AlertTriangle className={`w-4 h-4 ${totalDuplicates > 0 ? 'text-red-600' : 'text-emerald-600'}`} />}
        subtitle="Likely duplicate records that may be confusing your reports. Merge by hand."
      >
        {totalDuplicates === 0 ? (
          <Empty>No duplicates detected. Customer phones, supplier phones, and product names all unique.</Empty>
        ) : (
          <div className="space-y-4">
            {data && data.duplicates.customerPhones.length > 0 && (
              <SubSection title={`${data.duplicates.customerPhones.length} customer phone${data.duplicates.customerPhones.length === 1 ? '' : 's'} shared by multiple customers`}>
                {data.duplicates.customerPhones.map((d) => (
                  <div key={d.phone} className="border rounded p-2 text-sm">
                    <div className="font-mono text-xs text-muted-foreground">{d.phone}</div>
                    <ul className="list-disc ml-4 mt-1 text-xs">
                      {d.customers.map((c) => (
                        <li key={c._id}>{c.name}{c.gstNumber && <span className="font-mono text-muted-foreground"> · {c.gstNumber}</span>}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </SubSection>
            )}

            {data && data.duplicates.supplierPhones.length > 0 && (
              <SubSection title={`${data.duplicates.supplierPhones.length} supplier phone${data.duplicates.supplierPhones.length === 1 ? '' : 's'} shared`}>
                {data.duplicates.supplierPhones.map((d) => (
                  <div key={d.phone} className="border rounded p-2 text-sm">
                    <div className="font-mono text-xs text-muted-foreground">{d.phone}</div>
                    <ul className="list-disc ml-4 mt-1 text-xs">
                      {d.suppliers.map((s) => (
                        <li key={s._id}>{s.name}{s.gstNumber && <span className="font-mono text-muted-foreground"> · {s.gstNumber}</span>}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </SubSection>
            )}

            {data && data.duplicates.productNames.length > 0 && (
              <SubSection title={`${data.duplicates.productNames.length} product name${data.duplicates.productNames.length === 1 ? '' : 's'} used by multiple SKUs`}>
                {data.duplicates.productNames.map((d) => (
                  <div key={d.name} className="border rounded p-2 text-sm">
                    <div className="font-medium">{d.name}</div>
                    <ul className="list-disc ml-4 mt-1 text-xs">
                      {d.products.map((p) => (
                        <li key={p._id}>SKU <span className="font-mono">{p.sku}</span> · barcode <span className="font-mono">{p.barcode || '—'}</span> · {money(p.sellingPrice)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </SubSection>
            )}

            {data && data.duplicates.similarCustomers.length > 0 && (
              <SubSection title={`${data.duplicates.similarCustomers.length} customer pair${data.duplicates.similarCustomers.length === 1 ? '' : 's'} with very similar names`}>
                {data.duplicates.similarCustomers.map((d, i) => (
                  <div key={i} className="border rounded p-2 text-xs flex items-center gap-2">
                    <span>{d.a.name}</span>
                    <span className="text-muted-foreground">≈</span>
                    <span>{d.b.name}</span>
                  </div>
                ))}
              </SubSection>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-sm text-muted-foreground italic py-6">{children}</div>;
}

function SumCard({ label, value, hint, icon, tone }: { label: string; value: string; hint?: string; icon?: React.ReactNode; tone?: 'purple' | 'emerald' | 'amber' | 'red' | 'gray' }) {
  const cls = tone === 'purple' ? 'text-purple-600' : tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">{icon}{label}</div>
        <div className={`text-lg font-bold mt-1 truncate ${cls}`}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-1 truncate">{hint}</div>}
      </CardContent>
    </Card>
  );
}
