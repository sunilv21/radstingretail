'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, FileText, RefreshCcw, AlertCircle, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, API_BASE } from '@/lib/api';
import { exportGstReportPdf, exportGstReportCsv } from '@/lib/print-gst';
import type { StoreInfo } from '@/lib/types';

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => Number(n || 0).toLocaleString('en-IN');

interface SummaryResp {
  period: string;
  sales: { count: number; taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number };
  purchases: { count: number; taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number };
  netGSTPayable: number;
}

interface Gstr1Row {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  gstin: string | null;
  placeOfSupply: string;
  invoiceValue: number;
  taxableValue: number;
  cgst: number; sgst: number; igst: number; totalTax: number;
  rate: number;
}
interface Gstr1B2csRow {
  placeOfSupply: string;
  rate: number;
  taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number;
  count: number;
}
interface HsnRow {
  hsn: string; description: string; rate: number; uqc: string; quantity: number;
  taxableValue: number; cgst: number; sgst: number; igst: number; totalValue: number;
}
interface SectionTotals {
  count?: number;
  taxableValue?: number;
  cgst?: number; sgst?: number; igst?: number; totalTax?: number;
  invoiceValue?: number;
}
interface Gstr1Resp {
  period: string;
  gstin: string;
  sections: {
    '4A_B2B': { rows: Gstr1Row[]; totals: SectionTotals };
    '5A_B2CL': { rows: Gstr1Row[]; totals: SectionTotals };
    '6A_Exports': { rows: Gstr1Row[]; totals: SectionTotals };
    '7_B2CS': { rows: Gstr1B2csRow[]; totals: SectionTotals };
    '8_NilExempt': { nil: number; exempt: number; nonGst: number };
    '9B_CDNR': { rows: Gstr1Row[]; totals: SectionTotals };
    '9B_CDNUR': { rows: Gstr1Row[]; totals: SectionTotals };
    '12_HSN': { rows: HsnRow[]; totals: SectionTotals };
    '13_Documents': {
      invoices: { from: string; to: string; total: number; cancelled: number };
    };
  };
}

interface Gstr3bResp {
  period: string;
  gstin: string;
  sections: {
    '3.1_OutwardSupplies': {
      taxableSupplies: { taxableValue: number; cgst: number; sgst: number; igst: number };
      zeroRated: { taxableValue: number; igst: number };
      nilRated: { taxableValue: number };
      exempt: { taxableValue: number };
      nonGst: { taxableValue: number };
    };
    '3.2_InterStateUnregistered': { totalTaxableValueToUnregistered: number };
    '4_ITC': {
      eligible: { cgst: number; sgst: number; igst: number; total: number };
      ineligible: { cgst: number; sgst: number; igst: number };
      netITC: number;
    };
    '5_InwardSupplies': { fromComposition: number; nilRated: number; nonGst: number };
    '5.1_InterestLateFee': { interest: number; lateFee: number };
    '6.1_PaymentOfTax': { outputTax: number; itcUtilised: number; netPayable: number };
  };
}

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function GSTPage() {
  const [period, setPeriod] = useState(defaultPeriod());
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [gstr1, setGstr1] = useState<Gstr1Resp | null>(null);
  const [gstr3b, setGstr3b] = useState<Gstr3bResp | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  // Lifted state from child tabs so the export functions (PDF / CSV) can see
  // every tab's data — without this, 2A reconcile and GSTR-9 stay invisible
  // to the export layer.
  const [reconcile, setReconcile] = useState<ReconcileResp | null>(null);
  const [gstr9, setGstr9] = useState<Gstr9Resp | null>(null);

  // Pull store profile once for the PDF header (logo, name, address, GSTIN).
  useEffect(() => {
    api.get<StoreInfo>('/store/me').then(setStore).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [s, r1, r3b] = await Promise.all([
        api.get<SummaryResp>(`/gst/summary/${period}`),
        api.get<Gstr1Resp>(`/gst/gstr1/${period}`),
        api.get<Gstr3bResp>(`/gst/gstr3b/${period}`),
      ]);
      setSummary(s);
      setGstr1(r1);
      setGstr3b(r3b);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const downloadJson = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE}/gst/export/gstr1/${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gstr1-${period}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded gstr1-${period}.json`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const downloadPdf = () => {
    if (!summary || !gstr1 || !gstr3b) {
      toast.error('Reports still loading — try again in a moment.');
      return;
    }
    exportGstReportPdf({ period, store, summary, gstr1, gstr3b, reconcile, gstr9 });
    const extras: string[] = [];
    if (reconcile) extras.push('2A reconcile');
    if (gstr9) extras.push('GSTR-9');
    toast.success(
      `PDF includes Summary, GSTR-1, GSTR-3B, HSN${extras.length ? ', ' + extras.join(', ') : ''}. ` +
      'Pick "Save as PDF" in the print dialog.',
    );
  };

  const downloadCsv = () => {
    if (!summary || !gstr1 || !gstr3b) {
      toast.error('Reports still loading — try again in a moment.');
      return;
    }
    exportGstReportCsv({ period, store, summary, gstr1, gstr3b, reconcile, gstr9 });
    toast.success('CSV downloaded — opens in Excel / Google Sheets.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">GST Returns</h1>
          <p className="text-muted-foreground mt-1">
            Monthly GSTR-1 (outward supplies) + GSTR-3B (summary). Export JSON for the
            GST Offline Utility — no GSP needed for portal upload.
          </p>
          {gstr1 && !gstr1.gstin && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              GSTIN missing on store profile — set it in Settings → GST.
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Period</Label>
            <Input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value || defaultPeriod())}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" />
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button
            onClick={downloadPdf}
            disabled={!summary || !gstr1 || !gstr3b}
            className="bg-emerald-600 hover:bg-emerald-700"
            title="A4 PDF with everything from every tab: Summary, GSTR-1 (all sections), GSTR-3B, HSN, 2A reconcile (if loaded), GSTR-9 (if loaded)"
          >
            <FileDown className="w-4 h-4 mr-1" /> Export PDF
          </Button>
          <Button
            onClick={downloadCsv}
            disabled={!summary || !gstr1 || !gstr3b}
            variant="outline"
            title="One CSV with every section as a labelled block — opens in Excel / Google Sheets"
          >
            <FileText className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          <Button onClick={downloadJson} className="bg-blue-600 hover:bg-blue-700">
            <Download className="w-4 h-4 mr-1" /> Export GSTR-1 JSON
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Output GST (Sales)"
            value={money(summary.sales.totalTax)}
            hint={`${summary.sales.count} invoices · ${money(summary.sales.taxableValue)} taxable`}
            tone="purple"
          />
          <SummaryCard
            label="Input ITC (Purchases)"
            value={money(summary.purchases.totalTax)}
            hint={`${summary.purchases.count} GRNs · ${money(summary.purchases.taxableValue)} taxable`}
            tone="green"
          />
          <SummaryCard
            label="Net GST Payable"
            value={money(summary.netGSTPayable)}
            hint={summary.netGSTPayable > 0 ? 'Pay this to government' : 'ITC carry-forward'}
            tone={summary.netGSTPayable > 0 ? 'red' : 'green'}
          />
          <SummaryCard
            label="GSTIN"
            value={gstr1?.gstin || '—'}
            hint={`Period ${period}`}
            tone="slate"
            mono
          />
        </div>
      )}

      <Tabs defaultValue="gstr1">
        <TabsList className="grid grid-cols-5 max-w-3xl">
          <TabsTrigger value="gstr1">GSTR-1</TabsTrigger>
          <TabsTrigger value="gstr3b">GSTR-3B</TabsTrigger>
          <TabsTrigger value="hsn">HSN</TabsTrigger>
          <TabsTrigger value="reconcile">2A Reconcile</TabsTrigger>
          <TabsTrigger value="gstr9">GSTR-9 Annual</TabsTrigger>
        </TabsList>

        <TabsContent value="gstr1" className="space-y-4">
          {gstr1 && <Gstr1View data={gstr1} />}
        </TabsContent>
        <TabsContent value="gstr3b" className="space-y-4">
          {gstr3b && <Gstr3bView data={gstr3b} />}
        </TabsContent>
        <TabsContent value="hsn" className="space-y-4">
          {gstr1 && <HsnView rows={gstr1.sections['12_HSN'].rows} totals={gstr1.sections['12_HSN'].totals} />}
        </TabsContent>
        <TabsContent value="reconcile" className="space-y-4">
          <ReconcileView period={period} result={reconcile} setResult={setReconcile} />
        </TabsContent>
        <TabsContent value="gstr9" className="space-y-4">
          <Gstr9View data={gstr9} setData={setGstr9} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  label, value, hint, tone, mono,
}: {
  label: string; value: string | number; hint?: string;
  tone?: 'green' | 'red' | 'purple' | 'slate'; mono?: boolean;
}) {
  const toneClass = {
    green: 'text-emerald-600',
    red: 'text-red-600',
    purple: 'text-indigo-600',
    slate: 'text-slate-700 dark:text-slate-300',
  }[tone || 'slate'];
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${toneClass} ${mono ? 'font-mono text-base' : ''}`}>
          {value}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Gstr1View({ data }: { data: Gstr1Resp }) {
  const s = data.sections;
  return (
    <Tabs defaultValue="b2b">
      <TabsList className="flex flex-wrap h-auto">
        <TabsTrigger value="b2b">4A · B2B ({s['4A_B2B'].rows.length})</TabsTrigger>
        <TabsTrigger value="b2cl">5A · B2CL ({s['5A_B2CL'].rows.length})</TabsTrigger>
        <TabsTrigger value="exports">6A · Exports ({s['6A_Exports'].rows.length})</TabsTrigger>
        <TabsTrigger value="b2cs">7 · B2CS ({s['7_B2CS'].rows.length})</TabsTrigger>
        <TabsTrigger value="nil">8 · Nil/Exempt</TabsTrigger>
        <TabsTrigger value="cdnr">9B · CDNR ({s['9B_CDNR'].rows.length})</TabsTrigger>
        <TabsTrigger value="cdnur">9B · CDNUR ({s['9B_CDNUR'].rows.length})</TabsTrigger>
        <TabsTrigger value="docs">13 · Docs</TabsTrigger>
      </TabsList>

      <TabsContent value="b2b">
        <SectionCard title="4A — B2B (registered customers)" subtitle="Invoices to GSTIN-registered buyers">
          <InvoiceTable rows={s['4A_B2B'].rows} totals={s['4A_B2B'].totals} showGstin />
        </SectionCard>
      </TabsContent>
      <TabsContent value="b2cl">
        <SectionCard title="5A — B2C Large" subtitle="Inter-state, unregistered, invoice > ₹2.5L">
          <InvoiceTable rows={s['5A_B2CL'].rows} totals={s['5A_B2CL'].totals} />
        </SectionCard>
      </TabsContent>
      <TabsContent value="exports">
        <SectionCard title="6A — Exports" subtitle="With/without payment of IGST">
          {s['6A_Exports'].rows.length === 0 ? (
            <EmptyRow>No exports recorded for this period.</EmptyRow>
          ) : (
            <InvoiceTable rows={s['6A_Exports'].rows} totals={s['6A_Exports'].totals} />
          )}
        </SectionCard>
      </TabsContent>
      <TabsContent value="b2cs">
        <SectionCard title="7 — B2C Small (consolidated)" subtitle="Intra-state + small inter-state, grouped by state and rate">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Place of Supply</TableHead>
                <TableHead className="text-right">Rate %</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">Total Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s['7_B2CS'].rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground italic">
                    No B2C-Small invoices for this period.
                  </TableCell>
                </TableRow>
              ) : (
                s['7_B2CS'].rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant={r.placeOfSupply === 'Inter-State' ? 'destructive' : 'secondary'}>
                        {r.placeOfSupply}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.rate}%</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.taxableValue)}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.cgst)}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.sgst)}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.igst)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{money(r.totalTax)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <SectionTotalsRow totals={s['7_B2CS'].totals} />
        </SectionCard>
      </TabsContent>
      <TabsContent value="nil">
        <SectionCard title="8 — Nil rated / Exempt / Non-GST">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Nil rated</div><div className="font-bold">{money(s['8_NilExempt'].nil)}</div></div>
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Exempt</div><div className="font-bold">{money(s['8_NilExempt'].exempt)}</div></div>
            <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Non-GST</div><div className="font-bold">{money(s['8_NilExempt'].nonGst)}</div></div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            Mark a product&apos;s Tax Type as Exempt in Inventory to bucket it here. Currently
            the system treats every line as taxable.
          </div>
        </SectionCard>
      </TabsContent>
      <TabsContent value="cdnr">
        <SectionCard title="9B — Credit/Debit Notes (Registered)">
          {s['9B_CDNR'].rows.length === 0 ? (
            <EmptyRow>No credit/debit notes for registered customers.</EmptyRow>
          ) : (
            <InvoiceTable rows={s['9B_CDNR'].rows} totals={s['9B_CDNR'].totals} showGstin />
          )}
        </SectionCard>
      </TabsContent>
      <TabsContent value="cdnur">
        <SectionCard title="9B — Credit/Debit Notes (Unregistered)">
          {s['9B_CDNUR'].rows.length === 0 ? (
            <EmptyRow>No credit/debit notes for unregistered customers.</EmptyRow>
          ) : (
            <InvoiceTable rows={s['9B_CDNUR'].rows} totals={s['9B_CDNUR'].totals} />
          )}
        </SectionCard>
      </TabsContent>
      <TabsContent value="docs">
        <SectionCard title="13 — Document Issued" subtitle="Invoice number ranges issued in the period">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">First invoice</div>
              <div className="font-mono">{s['13_Documents'].invoices.from || '—'}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Last invoice</div>
              <div className="font-mono">{s['13_Documents'].invoices.to || '—'}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Total invoices</div>
              <div className="text-xl font-bold">{s['13_Documents'].invoices.total}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Cancelled</div>
              <div className="text-xl font-bold">{s['13_Documents'].invoices.cancelled}</div>
            </div>
          </div>
        </SectionCard>
      </TabsContent>
    </Tabs>
  );
}

function Gstr3bView({ data }: { data: Gstr3bResp }) {
  const s = data.sections;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SectionCard title="3.1 — Outward supplies & inward on reverse charge">
        <Table>
          <TableHeader>
            <TableRow><TableHead></TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">IGST</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">(a) Taxable supplies</TableCell>
              <TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].taxableSupplies.taxableValue)}</TableCell>
              <TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].taxableSupplies.cgst)}</TableCell>
              <TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].taxableSupplies.sgst)}</TableCell>
              <TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].taxableSupplies.igst)}</TableCell>
            </TableRow>
            <TableRow><TableCell>(b) Zero-rated</TableCell><TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].zeroRated.taxableValue)}</TableCell><TableCell className="text-right font-mono">—</TableCell><TableCell className="text-right font-mono">—</TableCell><TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].zeroRated.igst)}</TableCell></TableRow>
            <TableRow><TableCell>(c) Nil rated / Exempt</TableCell><TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].nilRated.taxableValue + s['3.1_OutwardSupplies'].exempt.taxableValue)}</TableCell><TableCell colSpan={3}></TableCell></TableRow>
            <TableRow><TableCell>(d) Non-GST</TableCell><TableCell className="text-right font-mono">{money(s['3.1_OutwardSupplies'].nonGst.taxableValue)}</TableCell><TableCell colSpan={3}></TableCell></TableRow>
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="3.2 — Inter-state to unregistered persons">
        <div className="text-sm">
          <div className="text-muted-foreground text-xs mb-1">Total taxable value to unregistered (inter-state)</div>
          <div className="text-2xl font-bold font-mono">{money(s['3.2_InterStateUnregistered'].totalTaxableValueToUnregistered)}</div>
        </div>
      </SectionCard>

      <SectionCard title="4 — Eligible ITC">
        <Table>
          <TableHeader><TableRow><TableHead></TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">IGST</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow><TableCell>Eligible</TableCell><TableCell className="text-right font-mono">{money(s['4_ITC'].eligible.cgst)}</TableCell><TableCell className="text-right font-mono">{money(s['4_ITC'].eligible.sgst)}</TableCell><TableCell className="text-right font-mono">{money(s['4_ITC'].eligible.igst)}</TableCell></TableRow>
            <TableRow><TableCell>Ineligible</TableCell><TableCell className="text-right font-mono">{money(s['4_ITC'].ineligible.cgst)}</TableCell><TableCell className="text-right font-mono">{money(s['4_ITC'].ineligible.sgst)}</TableCell><TableCell className="text-right font-mono">{money(s['4_ITC'].ineligible.igst)}</TableCell></TableRow>
            <TableRow className="font-semibold"><TableCell>Net ITC</TableCell><TableCell colSpan={3} className="text-right font-mono">{money(s['4_ITC'].netITC)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="5 — Inward supplies (composition / nil / non-GST)">
        <Table>
          <TableBody>
            <TableRow><TableCell>From composition dealer</TableCell><TableCell className="text-right font-mono">{money(s['5_InwardSupplies'].fromComposition)}</TableCell></TableRow>
            <TableRow><TableCell>Nil rated</TableCell><TableCell className="text-right font-mono">{money(s['5_InwardSupplies'].nilRated)}</TableCell></TableRow>
            <TableRow><TableCell>Non-GST</TableCell><TableCell className="text-right font-mono">{money(s['5_InwardSupplies'].nonGst)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="5.1 — Interest & late fee">
        <Table>
          <TableBody>
            <TableRow><TableCell>Interest</TableCell><TableCell className="text-right font-mono">{money(s['5.1_InterestLateFee'].interest)}</TableCell></TableRow>
            <TableRow><TableCell>Late fee</TableCell><TableCell className="text-right font-mono">{money(s['5.1_InterestLateFee'].lateFee)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="6.1 — Payment of tax">
        <Table>
          <TableBody>
            <TableRow><TableCell>Output tax</TableCell><TableCell className="text-right font-mono">{money(s['6.1_PaymentOfTax'].outputTax)}</TableCell></TableRow>
            <TableRow><TableCell>ITC utilised</TableCell><TableCell className="text-right font-mono">{money(s['6.1_PaymentOfTax'].itcUtilised)}</TableCell></TableRow>
            <TableRow className="font-semibold border-t-2 border-foreground/10">
              <TableCell>Net payable</TableCell>
              <TableCell className={`text-right font-mono ${s['6.1_PaymentOfTax'].netPayable > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {money(s['6.1_PaymentOfTax'].netPayable)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

function HsnView({ rows, totals }: { rows: HsnRow[]; totals: SectionTotals }) {
  return (
    <SectionCard
      title="Section 12 — HSN-wise summary"
      subtitle="Aggregated by HSN code + GST rate. Required for GSTR-1 filing."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>HSN</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">UQC</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Rate %</TableHead>
            <TableHead className="text-right">Taxable</TableHead>
            <TableHead className="text-right">CGST</TableHead>
            <TableHead className="text-right">SGST</TableHead>
            <TableHead className="text-right">IGST</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground italic">
                No sales in this period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono">{r.hsn}</TableCell>
                <TableCell className="max-w-60 truncate" title={r.description}>{r.description}</TableCell>
                <TableCell className="text-right text-xs">{r.uqc}</TableCell>
                <TableCell className="text-right">{num(r.quantity)}</TableCell>
                <TableCell className="text-right">{r.rate}%</TableCell>
                <TableCell className="text-right font-mono">{money(r.taxableValue)}</TableCell>
                <TableCell className="text-right font-mono">{money(r.cgst)}</TableCell>
                <TableCell className="text-right font-mono">{money(r.sgst)}</TableCell>
                <TableCell className="text-right font-mono">{money(r.igst)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(r.totalValue)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <SectionTotalsRow totals={totals} />
    </SectionCard>
  );
}

function InvoiceTable({
  rows, totals, showGstin = false,
}: {
  rows: Gstr1Row[]; totals: SectionTotals; showGstin?: boolean;
}) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            {showGstin && <TableHead>GSTIN</TableHead>}
            <TableHead>POS</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Taxable</TableHead>
            <TableHead className="text-right">CGST</TableHead>
            <TableHead className="text-right">SGST</TableHead>
            <TableHead className="text-right">IGST</TableHead>
            <TableHead className="text-right">Invoice value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showGstin ? 11 : 10} className="text-center text-muted-foreground italic">
                No invoices in this section.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.invoiceNumber}>
                <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                <TableCell className="text-xs">{new Date(r.invoiceDate).toLocaleDateString('en-IN')}</TableCell>
                <TableCell className="max-w-40 truncate" title={r.customerName}>{r.customerName}</TableCell>
                {showGstin && <TableCell className="font-mono text-xs">{r.gstin || '—'}</TableCell>}
                <TableCell>
                  <Badge variant={r.placeOfSupply === 'Inter-State' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {r.placeOfSupply}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{r.rate}%</TableCell>
                <TableCell className="text-right font-mono">{money(r.taxableValue)}</TableCell>
                <TableCell className="text-right font-mono">{money(r.cgst)}</TableCell>
                <TableCell className="text-right font-mono">{money(r.sgst)}</TableCell>
                <TableCell className="text-right font-mono">{money(r.igst)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(r.invoiceValue)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <SectionTotalsRow totals={totals} />
    </>
  );
}

function SectionTotalsRow({ totals }: { totals: SectionTotals }) {
  const has = (totals.taxableValue || 0) + (totals.totalTax || 0);
  if (!has) return null;
  return (
    <div className="border-t-2 border-foreground/20 mt-2 pt-2 px-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
      {typeof totals.count === 'number' && (
        <div><div className="text-muted-foreground">Count</div><div className="font-bold">{totals.count}</div></div>
      )}
      <div><div className="text-muted-foreground">Taxable</div><div className="font-bold font-mono">{money(totals.taxableValue || 0)}</div></div>
      <div><div className="text-muted-foreground">CGST</div><div className="font-bold font-mono">{money(totals.cgst || 0)}</div></div>
      <div><div className="text-muted-foreground">SGST</div><div className="font-bold font-mono">{money(totals.sgst || 0)}</div></div>
      <div><div className="text-muted-foreground">IGST</div><div className="font-bold font-mono">{money(totals.igst || 0)}</div></div>
      <div><div className="text-muted-foreground">Total tax</div><div className="font-bold font-mono">{money(totals.totalTax || 0)}</div></div>
    </div>
  );
}

function SectionCard({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          {title}
        </CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-sm text-muted-foreground italic py-6">{children}</div>;
}

// =================================================================
// GSTR-2A Reconciliation
// =================================================================

interface SupplierInvoice2A {
  supplierGstin: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceValue: number;
  placeOfSupply: string;
  reverseCharge: boolean;
  invoiceType: string;
  taxableValue: number;
  cgst: number; sgst: number; igst: number; cess: number;
  totalTax: number;
}
interface OurPurchaseLite {
  _id: string;
  poNumber: string;
  supplierGstin: string;
  supplierName: string;
  poDate: string;
  taxableValue: number;
  cgst: number; sgst: number; igst: number;
  total: number;
  totalTax: number;
  reverseCharge: boolean;
}
interface ReconcileResp {
  period: string;
  uploaded: { gstin: string; period: string; count: number };
  summary: {
    total2A: number; totalOurs: number;
    matched: number; mismatched: number; onlyIn2A: number; onlyInOurs: number;
    itc2A: number; itcOurs: number; itcDifference: number;
  };
  matched: { supplierInvoice: SupplierInvoice2A; ourPurchase: OurPurchaseLite; taxDifference: number }[];
  mismatched: { supplierInvoice: SupplierInvoice2A; ourPurchase: OurPurchaseLite; valueDifference: number; taxDifference: number }[];
  onlyIn2A: SupplierInvoice2A[];
  onlyInOurs: OurPurchaseLite[];
}

function ReconcileView({
  period,
  result,
  setResult,
}: {
  period: string;
  result: ReconcileResp | null;
  setResult: (r: ReconcileResp | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [filename, setFilename] = useState('');

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setLoading(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        toast.error('Could not parse JSON. Make sure the file is a valid GSTR-2A JSON download.');
        setLoading(false);
        return;
      }
      const r = await api.post<ReconcileResp>(`/gst/reconcile/2a/${period}`, payload);
      setResult(r);
      toast.success(`Reconciled ${r.summary.total2A} 2A invoices vs ${r.summary.totalOurs} of ours`);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>GSTR-2A Reconciliation</CardTitle>
          <CardDescription>
            Cross-check the supplier-side invoices the government has on record (your GSTR-2A)
            against your own purchase ledger. Free path — no GSP needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded p-3 text-sm">
            <div className="font-semibold mb-1">How to get the file:</div>
            <ol className="list-decimal ml-5 space-y-0.5 text-xs">
              <li>Login to <span className="font-mono">gst.gov.in</span></li>
              <li>Returns Dashboard → select financial year + month</li>
              <li>Find <b>GSTR-2A</b> → click <b>Download</b> → choose <b>JSON</b></li>
              <li>Upload that file below</li>
            </ol>
          </div>

          <div className="border-2 border-dashed rounded-md p-6 text-center hover:bg-muted/30 transition">
            <input
              type="file"
              accept=".json,application/json"
              id="gstr2a-upload"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <label htmlFor="gstr2a-upload" className="cursor-pointer">
              <Download className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <div className="font-medium">Upload GSTR-2A JSON</div>
              <div className="text-xs text-muted-foreground mt-1">
                {loading ? 'Parsing & reconciling…' : filename || `Period: ${period} · Click or drop a .json file here`}
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {result && <ReconcileResults data={result} />}
    </div>
  );
}

function ReconcileResults({ data }: { data: ReconcileResp }) {
  const itcDiffTone =
    Math.abs(data.summary.itcDifference) < 1 ? 'text-emerald-600' :
    data.summary.itcDifference > 0 ? 'text-red-600' : 'text-amber-600';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">In 2A</div><div className="text-2xl font-bold">{data.summary.total2A}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">In our books</div><div className="text-2xl font-bold">{data.summary.totalOurs}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">ITC per 2A</div><div className="text-xl font-bold font-mono">{money(data.summary.itc2A)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">ITC we&apos;ve claimed</div><div className={`text-xl font-bold font-mono ${itcDiffTone}`}>{money(data.summary.itcOurs)}<div className="text-[10px] font-normal">Δ {money(data.summary.itcDifference)}</div></div></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <BucketBadge label="Matched" count={data.summary.matched} tone="emerald" />
        <BucketBadge label="Mismatched" count={data.summary.mismatched} tone="amber" />
        <BucketBadge label="Only in 2A" count={data.summary.onlyIn2A} tone="orange" />
        <BucketBadge label="Only in our books" count={data.summary.onlyInOurs} tone="red" />
      </div>

      {data.mismatched.length > 0 && (
        <SectionCard title="⚠ Mismatched — same supplier, different amount" subtitle="Same GSTIN matched, but invoice values differ. Likely data-entry error on either side.">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Supplier</TableHead><TableHead>2A Invoice</TableHead><TableHead className="text-right">2A Value</TableHead><TableHead>Our PO</TableHead><TableHead className="text-right">Our Value</TableHead><TableHead className="text-right">Difference</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.mismatched.map((m, i) => (
                <TableRow key={i}>
                  <TableCell><div className="font-mono text-xs">{m.supplierInvoice.supplierGstin}</div><div className="text-[10px]">{m.ourPurchase.supplierName}</div></TableCell>
                  <TableCell className="font-mono text-xs">{m.supplierInvoice.invoiceNumber}</TableCell>
                  <TableCell className="text-right font-mono">{money(m.supplierInvoice.invoiceValue)}</TableCell>
                  <TableCell className="font-mono text-xs">{m.ourPurchase.poNumber}</TableCell>
                  <TableCell className="text-right font-mono">{money(m.ourPurchase.total)}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${m.valueDifference > 0 ? 'text-orange-600' : 'text-blue-600'}`}>{m.valueDifference > 0 ? '+' : ''}{money(m.valueDifference)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {data.onlyIn2A.length > 0 && (
        <SectionCard title="🟠 Only in 2A — missing in our books" subtitle="Supplier filed but we have no record. Either a missed bill, or this invoice was incorrectly tagged to your GSTIN.">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Supplier GSTIN</TableHead><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Total Tax</TableHead><TableHead className="text-right">Invoice Value</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.onlyIn2A.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{s.supplierGstin}</TableCell>
                  <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                  <TableCell className="text-xs">{s.invoiceDate ? new Date(s.invoiceDate).toLocaleDateString('en-IN') : '—'}</TableCell>
                  <TableCell className="text-right font-mono">{money(s.taxableValue)}</TableCell>
                  <TableCell className="text-right font-mono">{money(s.totalTax)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(s.invoiceValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {data.onlyInOurs.length > 0 && (
        <SectionCard title="🔴 Only in our books — supplier hasn't filed" subtitle="ITC isn't claimable until the supplier files their GSTR-1 and the invoice appears in your 2A. Follow up with the supplier.">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Supplier</TableHead><TableHead>Our PO</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Total Tax</TableHead><TableHead className="text-right">Invoice Value</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.onlyInOurs.map((p) => (
                <TableRow key={p._id}>
                  <TableCell><div className="font-medium">{p.supplierName}</div><div className="font-mono text-[10px] text-muted-foreground">{p.supplierGstin || '—'}</div></TableCell>
                  <TableCell className="font-mono text-xs">{p.poNumber}</TableCell>
                  <TableCell className="text-xs">{new Date(p.poDate).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell className="text-right font-mono">{money(p.taxableValue)}</TableCell>
                  <TableCell className="text-right font-mono">{money(p.totalTax)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(p.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {data.matched.length > 0 && (
        <SectionCard title={`✓ Matched (${data.matched.length})`} subtitle="Same supplier GSTIN, invoice value within ₹1. ITC is safely claimable.">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Supplier</TableHead><TableHead>2A Invoice</TableHead><TableHead>Our PO</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-right">Tax Δ</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.matched.map((m, i) => (
                <TableRow key={i}>
                  <TableCell><div className="font-mono text-xs">{m.supplierInvoice.supplierGstin}</div><div className="text-[10px]">{m.ourPurchase.supplierName}</div></TableCell>
                  <TableCell className="font-mono text-xs">{m.supplierInvoice.invoiceNumber}</TableCell>
                  <TableCell className="font-mono text-xs">{m.ourPurchase.poNumber}</TableCell>
                  <TableCell className="text-right font-mono">{money(m.ourPurchase.total)}</TableCell>
                  <TableCell className={`text-right font-mono ${Math.abs(m.taxDifference) < 1 ? '' : 'text-amber-600'}`}>
                    {Math.abs(m.taxDifference) < 1 ? '✓' : `${m.taxDifference > 0 ? '+' : ''}${money(m.taxDifference)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}
    </div>
  );
}

function BucketBadge({ label, count, tone }: { label: string; count: number; tone: 'emerald' | 'amber' | 'orange' | 'red' }) {
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300',
    orange: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950/30 dark:text-orange-300',
    red: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-300',
  }[tone];
  return (
    <Card className={cls}>
      <CardContent className="p-3 text-center">
        <div className="text-2xl font-bold">{count}</div>
        <div className="text-xs">{label}</div>
      </CardContent>
    </Card>
  );
}

// =================================================================
// GSTR-9 Annual return
// =================================================================

interface OutwardBucket { taxable: number; cgst?: number; sgst?: number; igst?: number; cess?: number; count: number }
interface ItcBucket { taxable: number; cgst?: number; sgst?: number; igst: number }
interface MonthlyRow { period: string; monthLabel: string; taxableValue: number; outputTax: number; itc: number; netPayable: number }
interface Gstr9Resp {
  financialYear: string;
  gstin: string;
  legalName: string;
  partII: {
    section4_taxableOutward: {
      A_b2c: OutwardBucket; B_b2b: OutwardBucket;
      C_exportWithPayment: OutwardBucket; D_sezWithPayment: OutwardBucket; E_deemedExport: OutwardBucket;
      G_inwardRcm: ItcBucket;
      I_creditNotes: OutwardBucket; J_debitNotes: OutwardBucket;
    };
    section5_nonTaxable: {
      A_exportWithoutPayment: OutwardBucket;
      B_sezWithoutPayment: OutwardBucket;
      D_exempt: OutwardBucket;
      E_nilRated: OutwardBucket;
      F_nonGst: OutwardBucket;
    };
  };
  partIII: {
    section6_itcAvailed: { B_inputs: ItcBucket; CD_rcm: ItcBucket; E_imports: { taxable: number; igst: number }; totalItc: number };
    section7_itcReversed: { purchaseReturns: ItcBucket; totalReversed: number };
    netItc: number;
  };
  partIV: {
    section9_taxPaid: {
      integratedTax: { payable: number; paidViaItc: number; paidInCash: number };
      centralTax: { payable: number; paidViaItc: number; paidInCash: number };
      stateTax: { payable: number; paidViaItc: number; paidInCash: number };
      totalPayable: number; totalCash: number; totalItcUsed: number;
    };
  };
  monthly: MonthlyRow[];
}

function currentFY(): string {
  const d = new Date();
  const y = d.getFullYear();
  const startYear = d.getMonth() < 3 ? y - 1 : y;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

function Gstr9View({
  data,
  setData,
}: {
  data: Gstr9Resp | null;
  setData: (d: Gstr9Resp | null) => void;
}) {
  const [fy, setFy] = useState(currentFY());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<Gstr9Resp>(`/gst/gstr9/${fy}`));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  // FY options: current + 4 previous
  const fyOptions: string[] = [];
  const startYear = Number(fy.split('-')[0]);
  for (let i = -4; i <= 1; i++) {
    const y = startYear + i;
    fyOptions.push(`${y}-${String(y + 1).slice(2)}`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>GSTR-9 — Annual Return</CardTitle>
              <CardDescription>
                Consolidates 12 months (Apr–Mar) of GSTR-1 + GSTR-3B activity into the annual form.
                Filed by businesses with turnover &gt; ₹2 Cr; voluntary below.
              </CardDescription>
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <Label className="text-[10px] uppercase">Financial Year</Label>
                <select
                  className="h-9 border rounded-md px-2 bg-background w-32"
                  value={fy}
                  onChange={(e) => setFy(e.target.value)}
                >
                  {fyOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {data && (
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <div><b>{data.legalName}</b> · GSTIN <span className="font-mono">{data.gstin || '—'}</span></div>
            <div>Period: 1 Apr {data.financialYear.split('-')[0]} → 31 Mar 20{data.financialYear.split('-')[1]}</div>
          </CardContent>
        )}
      </Card>

      {data && (
        <>
          {/* Top-line summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SumCard label="Total Output Tax" value={money(data.partIV.section9_taxPaid.totalPayable)} tone="purple" />
            <SumCard label="Net ITC Available" value={money(data.partIII.netItc)} tone="green" hint={data.partIII.section7_itcReversed.totalReversed > 0 ? `${money(data.partIII.section7_itcReversed.totalReversed)} reversed` : undefined} />
            <SumCard label="ITC Utilised" value={money(data.partIV.section9_taxPaid.totalItcUsed)} tone="blue" />
            <SumCard label="Cash Tax Paid" value={money(data.partIV.section9_taxPaid.totalCash)} tone="red" />
          </div>

          {/* Part II Section 4 + 5 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Part II · Outward Supplies</CardTitle>
              <CardDescription>Sections 4 (taxable) + 5 (non-taxable) — what you sold during the FY.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Section 4 — Taxable supplies</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                      <TableHead className="text-right">IGST</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <BucketRow label="A · Supplies to consumers (B2C)" b={data.partII.section4_taxableOutward.A_b2c} />
                    <BucketRow label="B · Supplies to registered (B2B)" b={data.partII.section4_taxableOutward.B_b2b} />
                    <BucketRow label="C · Exports (with payment of IGST)" b={data.partII.section4_taxableOutward.C_exportWithPayment} />
                    <BucketRow label="D · SEZ supplies (with payment)" b={data.partII.section4_taxableOutward.D_sezWithPayment} />
                    <BucketRow label="E · Deemed exports" b={data.partII.section4_taxableOutward.E_deemedExport} />
                    <TableRow>
                      <TableCell>G · Inward supplies on RCM (we pay)</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right font-mono">{money(data.partII.section4_taxableOutward.G_inwardRcm.taxable)}</TableCell>
                      <TableCell className="text-right font-mono">{money(data.partII.section4_taxableOutward.G_inwardRcm.cgst || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{money(data.partII.section4_taxableOutward.G_inwardRcm.sgst || 0)}</TableCell>
                      <TableCell className="text-right font-mono">{money(data.partII.section4_taxableOutward.G_inwardRcm.igst || 0)}</TableCell>
                    </TableRow>
                    <BucketRow label="I · Credit notes issued (reduces outward)" b={data.partII.section4_taxableOutward.I_creditNotes} negative />
                    <BucketRow label="J · Debit notes issued" b={data.partII.section4_taxableOutward.J_debitNotes} />
                  </TableBody>
                </Table>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1 mt-3">Section 5 — Non-taxable supplies</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <NonTaxableRow label="A · Exports without payment of tax (LUT)" b={data.partII.section5_nonTaxable.A_exportWithoutPayment} />
                    <NonTaxableRow label="B · Supplies to SEZ without payment" b={data.partII.section5_nonTaxable.B_sezWithoutPayment} />
                    <NonTaxableRow label="D · Exempt supplies" b={data.partII.section5_nonTaxable.D_exempt} />
                    <NonTaxableRow label="E · Nil-rated supplies" b={data.partII.section5_nonTaxable.E_nilRated} />
                    <NonTaxableRow label="F · Non-GST supplies" b={data.partII.section5_nonTaxable.F_nonGst} />
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Part III */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Part III · Input Tax Credit</CardTitle>
              <CardDescription>Sections 6 (availed) + 7 (reversed) — your purchase-side ITC for the FY.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <ItcRow label="6B · Inputs (regular B2B purchases)" b={data.partIII.section6_itcAvailed.B_inputs} />
                  <ItcRow label="6C+D · Inward on RCM" b={data.partIII.section6_itcAvailed.CD_rcm} />
                  <TableRow>
                    <TableCell>6E · Imports of goods</TableCell>
                    <TableCell className="text-right font-mono">{money(data.partIII.section6_itcAvailed.E_imports.taxable)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right font-mono">{money(data.partIII.section6_itcAvailed.E_imports.igst)}</TableCell>
                  </TableRow>
                  <ItcRow label="7 · ITC reversed (purchase returns / DN)" b={data.partIII.section7_itcReversed.purchaseReturns} negative />
                  <TableRow className="font-semibold border-t-2 border-foreground/20">
                    <TableCell>Net ITC available</TableCell>
                    <TableCell colSpan={3}></TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{money(data.partIII.netItc)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Part IV */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Part IV · Tax Paid (Section 9)</CardTitle>
              <CardDescription>Output tax payable, ITC offset, net cash paid — by tax head.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                    <TableHead className="text-right">Paid via ITC</TableHead>
                    <TableHead className="text-right">Paid in cash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell>Integrated Tax (IGST)</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.integratedTax.payable)}</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.integratedTax.paidViaItc)}</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.integratedTax.paidInCash)}</TableCell></TableRow>
                  <TableRow><TableCell>Central Tax (CGST)</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.centralTax.payable)}</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.centralTax.paidViaItc)}</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.centralTax.paidInCash)}</TableCell></TableRow>
                  <TableRow><TableCell>State Tax (SGST)</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.stateTax.payable)}</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.stateTax.paidViaItc)}</TableCell><TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.stateTax.paidInCash)}</TableCell></TableRow>
                  <TableRow className="font-semibold border-t-2 border-foreground/20">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.totalPayable)}</TableCell>
                    <TableCell className="text-right font-mono">{money(data.partIV.section9_taxPaid.totalItcUsed)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">{money(data.partIV.section9_taxPaid.totalCash)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Monthly breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly breakdown</CardTitle>
              <CardDescription>Each row should match what you filed in that month&apos;s GSTR-3B.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Taxable supply</TableHead>
                    <TableHead className="text-right">Output tax</TableHead>
                    <TableHead className="text-right">ITC</TableHead>
                    <TableHead className="text-right">Net payable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthly.map((m) => (
                    <TableRow key={m.period}>
                      <TableCell>{m.monthLabel}</TableCell>
                      <TableCell className="text-right font-mono">{money(m.taxableValue)}</TableCell>
                      <TableCell className="text-right font-mono">{money(m.outputTax)}</TableCell>
                      <TableCell className="text-right font-mono">{money(m.itc)}</TableCell>
                      <TableCell className={`text-right font-mono ${m.netPayable < 0 ? 'text-emerald-600' : ''}`}>{money(m.netPayable)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function BucketRow({ label, b, negative }: { label: string; b: OutwardBucket; negative?: boolean }) {
  const sign = negative ? -1 : 1;
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right">{b.count}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * b.taxable)}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * (b.cgst || 0))}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * (b.sgst || 0))}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * (b.igst || 0))}</TableCell>
    </TableRow>
  );
}

function NonTaxableRow({ label, b }: { label: string; b: OutwardBucket }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right">{b.count}</TableCell>
      <TableCell className="text-right font-mono">{money(b.taxable)}</TableCell>
    </TableRow>
  );
}

function ItcRow({ label, b, negative }: { label: string; b: ItcBucket; negative?: boolean }) {
  const sign = negative ? -1 : 1;
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * b.taxable)}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * (b.cgst || 0))}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * (b.sgst || 0))}</TableCell>
      <TableCell className="text-right font-mono">{money(sign * b.igst)}</TableCell>
    </TableRow>
  );
}

function SumCard({ label, value, tone, hint }: { label: string; value: string; tone?: 'purple' | 'green' | 'red' | 'blue'; hint?: string }) {
  const cls = tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : tone === 'blue' ? 'text-blue-600' : 'text-purple-600';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 font-mono ${cls}`}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
