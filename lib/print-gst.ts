import type { StoreInfo } from './types';

/**
 * GST return report → A4 PDF via the browser's print dialog.
 *
 * Same iframe-print pattern as `lib/print-invoice.ts` — we build a fully
 * styled HTML document, drop it into an off-screen iframe, and call
 * `window.print()`. The user picks "Save as PDF" from the destination
 * dropdown and gets a real PDF, no extra dependency.
 *
 * Single export bundles the whole filing pack in page-break order:
 *   1. Cover (store + period)
 *   2. Summary KPIs
 *   3. GSTR-1 section-by-section
 *   4. GSTR-3B
 *   5. HSN-wise summary
 */

export interface Gstr1Row {
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
export interface Gstr1B2csRow {
  placeOfSupply: string;
  rate: number;
  taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number;
  count: number;
}
export interface HsnRow {
  hsn: string; description: string; rate: number; uqc: string; quantity: number;
  taxableValue: number; cgst: number; sgst: number; igst: number; totalValue: number;
}
export interface SectionTotals {
  count?: number;
  taxableValue?: number;
  cgst?: number; sgst?: number; igst?: number; totalTax?: number;
  invoiceValue?: number;
}

export interface Gstr1Resp {
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

export interface Gstr3bResp {
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

export interface SummaryResp {
  period: string;
  sales: { count: number; taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number };
  purchases: { count: number; taxableValue: number; cgst: number; sgst: number; igst: number; totalTax: number };
  netGSTPayable: number;
}

// 2A reconciliation
export interface SupplierInvoice2A {
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
export interface OurPurchaseLite {
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
export interface ReconcileResp {
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

// GSTR-9 Annual return
export interface Gstr9OutwardBucket { taxable: number; cgst?: number; sgst?: number; igst?: number; cess?: number; count: number }
export interface Gstr9ItcBucket { taxable: number; cgst?: number; sgst?: number; igst: number }
export interface Gstr9MonthlyRow { period: string; monthLabel: string; taxableValue: number; outputTax: number; itc: number; netPayable: number }
export interface Gstr9Resp {
  financialYear: string;
  gstin: string;
  legalName: string;
  partII: {
    section4_taxableOutward: {
      A_b2c: Gstr9OutwardBucket; B_b2b: Gstr9OutwardBucket;
      C_exportWithPayment: Gstr9OutwardBucket; D_sezWithPayment: Gstr9OutwardBucket; E_deemedExport: Gstr9OutwardBucket;
      G_inwardRcm: Gstr9ItcBucket;
      I_creditNotes: Gstr9OutwardBucket; J_debitNotes: Gstr9OutwardBucket;
    };
    section5_nonTaxable: {
      A_exportWithoutPayment: Gstr9OutwardBucket;
      B_sezWithoutPayment: Gstr9OutwardBucket;
      D_exempt: Gstr9OutwardBucket;
      E_nilRated: Gstr9OutwardBucket;
      F_nonGst: Gstr9OutwardBucket;
    };
  };
  partIII: {
    section6_itcAvailed: { B_inputs: Gstr9ItcBucket; CD_rcm: Gstr9ItcBucket; E_imports: { taxable: number; igst: number }; totalItc: number };
    section7_itcReversed: { purchaseReturns: Gstr9ItcBucket; totalReversed: number };
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
  monthly: Gstr9MonthlyRow[];
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const numberStr = (n: number) => Number(n || 0).toLocaleString('en-IN');

function formatAddress(store?: StoreInfo | null): string {
  if (!store?.address) return '';
  const a = store.address;
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
}

function periodLabel(period: string): string {
  // 'YYYY-MM' → 'March 2026'
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
}

function logoTag(store?: StoreInfo | null): string {
  if (!store?.logoUrl?.trim()) return '';
  return `<img src="${esc(store.logoUrl)}" alt="${esc(store.name || 'Logo')}" style="max-height:54px;max-width:170px;object-fit:contain;" />`;
}

function totalsStrip(totals: SectionTotals): string {
  const has = (totals.taxableValue || 0) + (totals.totalTax || 0);
  if (!has && !totals.count) return '';
  return `
    <tr class="totals">
      ${typeof totals.count === 'number' ? `<td colspan="2"><b>Totals (${totals.count})</b></td>` : '<td colspan="2"><b>Totals</b></td>'}
      <td class="r"><b>${money(totals.taxableValue || 0)}</b></td>
      <td class="r"><b>${money(totals.cgst || 0)}</b></td>
      <td class="r"><b>${money(totals.sgst || 0)}</b></td>
      <td class="r"><b>${money(totals.igst || 0)}</b></td>
      <td class="r"><b>${money(totals.totalTax || 0)}</b></td>
    </tr>`;
}

function gstr1InvoiceTable(rows: Gstr1Row[], totals: SectionTotals, showGstin = false): string {
  if (rows.length === 0) {
    return '<div class="empty">No entries in this section.</div>';
  }
  const head = `
    <tr>
      <th>Invoice #</th>
      <th>Date</th>
      <th>Customer${showGstin ? ' (GSTIN)' : ''}</th>
      <th class="r">Taxable</th>
      <th class="r">CGST</th>
      <th class="r">SGST</th>
      <th class="r">IGST</th>
      <th class="r">Invoice value</th>
    </tr>`;
  const body = rows
    .map(
      (r) => `
    <tr>
      <td>${esc(r.invoiceNumber)}</td>
      <td>${new Date(r.invoiceDate).toLocaleDateString('en-IN')}</td>
      <td>${esc(r.customerName)}${showGstin && r.gstin ? `<div class="muted">${esc(r.gstin)}</div>` : ''}</td>
      <td class="r">${money(r.taxableValue)}</td>
      <td class="r">${money(r.cgst)}</td>
      <td class="r">${money(r.sgst)}</td>
      <td class="r">${money(r.igst)}</td>
      <td class="r"><b>${money(r.invoiceValue)}</b></td>
    </tr>`,
    )
    .join('');
  // Adapt totals strip to 8 columns by adjusting colspan:
  const totalsRow = `
    <tr class="totals">
      <td colspan="3"><b>Totals (${totals.count ?? rows.length})</b></td>
      <td class="r"><b>${money(totals.taxableValue || 0)}</b></td>
      <td class="r"><b>${money(totals.cgst || 0)}</b></td>
      <td class="r"><b>${money(totals.sgst || 0)}</b></td>
      <td class="r"><b>${money(totals.igst || 0)}</b></td>
      <td class="r"><b>${money(totals.invoiceValue || 0)}</b></td>
    </tr>`;
  return `<table class="data"><thead>${head}</thead><tbody>${body}${totalsRow}</tbody></table>`;
}

function gstr1B2csTable(rows: Gstr1B2csRow[], totals: SectionTotals): string {
  if (rows.length === 0) {
    return '<div class="empty">No B2C-Small invoices in this period.</div>';
  }
  const body = rows
    .map(
      (r) => `
    <tr>
      <td>${esc(r.placeOfSupply)}</td>
      <td class="r">${r.rate}%</td>
      <td class="r">${r.count}</td>
      <td class="r">${money(r.taxableValue)}</td>
      <td class="r">${money(r.cgst)}</td>
      <td class="r">${money(r.sgst)}</td>
      <td class="r">${money(r.igst)}</td>
      <td class="r"><b>${money(r.totalTax)}</b></td>
    </tr>`,
    )
    .join('');
  const head = `
    <tr>
      <th>Place of supply</th>
      <th class="r">Rate</th>
      <th class="r">Count</th>
      <th class="r">Taxable</th>
      <th class="r">CGST</th>
      <th class="r">SGST</th>
      <th class="r">IGST</th>
      <th class="r">Total tax</th>
    </tr>`;
  const totalsRow = totalsStrip(totals);
  return `<table class="data"><thead>${head}</thead><tbody>${body}${totalsRow}</tbody></table>`;
}

function hsnTable(rows: HsnRow[], totals: SectionTotals): string {
  if (rows.length === 0) {
    return '<div class="empty">No sales in this period — HSN summary is empty.</div>';
  }
  const body = rows
    .map(
      (r) => `
    <tr>
      <td>${esc(r.hsn)}</td>
      <td>${esc(r.description)}</td>
      <td>${esc(r.uqc)}</td>
      <td class="r">${numberStr(r.quantity)}</td>
      <td class="r">${r.rate}%</td>
      <td class="r">${money(r.taxableValue)}</td>
      <td class="r">${money(r.cgst)}</td>
      <td class="r">${money(r.sgst)}</td>
      <td class="r">${money(r.igst)}</td>
      <td class="r"><b>${money(r.totalValue)}</b></td>
    </tr>`,
    )
    .join('');
  const head = `
    <tr>
      <th>HSN</th><th>Description</th><th>UQC</th>
      <th class="r">Qty</th><th class="r">Rate</th>
      <th class="r">Taxable</th><th class="r">CGST</th>
      <th class="r">SGST</th><th class="r">IGST</th>
      <th class="r">Total</th>
    </tr>`;
  const totalsRow = `
    <tr class="totals">
      <td colspan="5"><b>Totals (${totals.count ?? rows.length})</b></td>
      <td class="r"><b>${money(totals.taxableValue || 0)}</b></td>
      <td class="r"><b>${money(totals.cgst || 0)}</b></td>
      <td class="r"><b>${money(totals.sgst || 0)}</b></td>
      <td class="r"><b>${money(totals.igst || 0)}</b></td>
      <td class="r"><b>${money((totals.taxableValue || 0) + (totals.totalTax || 0))}</b></td>
    </tr>`;
  return `<table class="data"><thead>${head}</thead><tbody>${body}${totalsRow}</tbody></table>`;
}

function gstr3bSection(data: Gstr3bResp): string {
  const s = data.sections;
  return `
    <h3>3.1 — Outward supplies and inward supplies on reverse charge</h3>
    <table class="data">
      <thead>
        <tr>
          <th>Nature</th><th class="r">Taxable value</th><th class="r">IGST</th>
          <th class="r">CGST</th><th class="r">SGST</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>(a) Outward taxable supplies</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].taxableSupplies.taxableValue)}</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].taxableSupplies.igst)}</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].taxableSupplies.cgst)}</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].taxableSupplies.sgst)}</td>
        </tr>
        <tr>
          <td>(b) Outward zero-rated supplies</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].zeroRated.taxableValue)}</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].zeroRated.igst)}</td>
          <td class="r">—</td><td class="r">—</td>
        </tr>
        <tr>
          <td>(c) Other outward supplies (nil/exempt)</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].nilRated.taxableValue + s['3.1_OutwardSupplies'].exempt.taxableValue)}</td>
          <td class="r">—</td><td class="r">—</td><td class="r">—</td>
        </tr>
        <tr>
          <td>(d) Non-GST outward supplies</td>
          <td class="r">${money(s['3.1_OutwardSupplies'].nonGst.taxableValue)}</td>
          <td class="r">—</td><td class="r">—</td><td class="r">—</td>
        </tr>
      </tbody>
    </table>

    <h3>3.2 — Inter-state supplies to unregistered persons</h3>
    <table class="data">
      <tbody>
        <tr>
          <td>Total taxable value to unregistered persons (inter-state)</td>
          <td class="r"><b>${money(s['3.2_InterStateUnregistered'].totalTaxableValueToUnregistered)}</b></td>
        </tr>
      </tbody>
    </table>

    <h3>4 — Eligible ITC</h3>
    <table class="data">
      <thead>
        <tr><th>Nature</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">IGST</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>(A) Eligible</td>
          <td class="r">${money(s['4_ITC'].eligible.cgst)}</td>
          <td class="r">${money(s['4_ITC'].eligible.sgst)}</td>
          <td class="r">${money(s['4_ITC'].eligible.igst)}</td>
        </tr>
        <tr>
          <td>(B) Ineligible</td>
          <td class="r">${money(s['4_ITC'].ineligible.cgst)}</td>
          <td class="r">${money(s['4_ITC'].ineligible.sgst)}</td>
          <td class="r">${money(s['4_ITC'].ineligible.igst)}</td>
        </tr>
        <tr class="totals">
          <td><b>(C) Net ITC available</b></td>
          <td colspan="3" class="r"><b>${money(s['4_ITC'].netITC)}</b></td>
        </tr>
      </tbody>
    </table>

    <h3>5 — Inward supplies (composition / nil rated / non-GST)</h3>
    <table class="data">
      <tbody>
        <tr><td>From composition dealer</td><td class="r">${money(s['5_InwardSupplies'].fromComposition)}</td></tr>
        <tr><td>Nil rated</td><td class="r">${money(s['5_InwardSupplies'].nilRated)}</td></tr>
        <tr><td>Non-GST</td><td class="r">${money(s['5_InwardSupplies'].nonGst)}</td></tr>
      </tbody>
    </table>

    <h3>5.1 — Interest &amp; late fee</h3>
    <table class="data">
      <tbody>
        <tr><td>Interest</td><td class="r">${money(s['5.1_InterestLateFee'].interest)}</td></tr>
        <tr><td>Late fee</td><td class="r">${money(s['5.1_InterestLateFee'].lateFee)}</td></tr>
      </tbody>
    </table>

    <h3>6.1 — Payment of tax</h3>
    <table class="data">
      <tbody>
        <tr><td>Output tax</td><td class="r">${money(s['6.1_PaymentOfTax'].outputTax)}</td></tr>
        <tr><td>ITC utilised</td><td class="r">${money(s['6.1_PaymentOfTax'].itcUtilised)}</td></tr>
        <tr class="totals">
          <td><b>Net payable</b></td>
          <td class="r ${s['6.1_PaymentOfTax'].netPayable > 0 ? 'red' : 'green'}"><b>${money(s['6.1_PaymentOfTax'].netPayable)}</b></td>
        </tr>
      </tbody>
    </table>
  `;
}

function reconcileSection(rec: ReconcileResp): string {
  const sup = rec.summary;
  const supplierLine = (s: SupplierInvoice2A) => `
    <tr>
      <td class="mono">${esc(s.supplierGstin)}</td>
      <td class="mono">${esc(s.invoiceNumber)}</td>
      <td>${s.invoiceDate ? new Date(s.invoiceDate).toLocaleDateString('en-IN') : '—'}</td>
      <td class="r">${money(s.taxableValue)}</td>
      <td class="r">${money(s.cgst)}</td>
      <td class="r">${money(s.sgst)}</td>
      <td class="r">${money(s.igst)}</td>
      <td class="r"><b>${money(s.invoiceValue)}</b></td>
    </tr>`;
  const ourLine = (p: OurPurchaseLite) => `
    <tr>
      <td>${esc(p.supplierName)}<div class="muted small mono">${esc(p.supplierGstin || '—')}</div></td>
      <td class="mono">${esc(p.poNumber)}</td>
      <td>${new Date(p.poDate).toLocaleDateString('en-IN')}</td>
      <td class="r">${money(p.taxableValue)}</td>
      <td class="r">${money(p.cgst)}</td>
      <td class="r">${money(p.sgst)}</td>
      <td class="r">${money(p.igst)}</td>
      <td class="r"><b>${money(p.total)}</b></td>
    </tr>`;
  const supHead = `<thead><tr>
      <th>Supplier GSTIN</th><th>Invoice #</th><th>Date</th>
      <th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th>
      <th class="r">IGST</th><th class="r">Invoice value</th>
    </tr></thead>`;
  const ourHead = `<thead><tr>
      <th>Supplier</th><th>Our PO</th><th>Date</th>
      <th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th>
      <th class="r">IGST</th><th class="r">Total</th>
    </tr></thead>`;

  return `
    <h3>Summary</h3>
    <table class="data">
      <tbody>
        <tr><td>In 2A (supplier-side)</td><td class="r"><b>${sup.total2A}</b></td>
            <td>ITC per 2A</td><td class="r"><b>${money(sup.itc2A)}</b></td></tr>
        <tr><td>In our books</td><td class="r"><b>${sup.totalOurs}</b></td>
            <td>ITC we&rsquo;ve claimed</td><td class="r"><b>${money(sup.itcOurs)}</b></td></tr>
        <tr><td>Matched</td><td class="r green"><b>${sup.matched}</b></td>
            <td>ITC difference (Δ)</td><td class="r"><b class="${Math.abs(sup.itcDifference) < 1 ? 'green' : sup.itcDifference > 0 ? 'red' : ''}">${money(sup.itcDifference)}</b></td></tr>
        <tr><td>Mismatched</td><td class="r"><b>${sup.mismatched}</b></td>
            <td>Only in 2A</td><td class="r"><b>${sup.onlyIn2A}</b></td></tr>
        <tr><td>Only in our books</td><td class="r"><b>${sup.onlyInOurs}</b></td>
            <td>Uploaded period</td><td class="r mono">${esc(rec.uploaded.period || '—')}</td></tr>
      </tbody>
    </table>

    <h3>Mismatched (${rec.mismatched.length})</h3>
    ${rec.mismatched.length === 0 ? '<div class="empty">No mismatches.</div>' : `
    <table class="data">
      <thead><tr>
        <th>Supplier GSTIN</th><th>2A Invoice</th><th class="r">2A value</th>
        <th>Our PO</th><th class="r">Our value</th><th class="r">Δ Value</th><th class="r">Δ Tax</th>
      </tr></thead>
      <tbody>
        ${rec.mismatched.map((m) => `
          <tr>
            <td class="mono">${esc(m.supplierInvoice.supplierGstin)}</td>
            <td class="mono">${esc(m.supplierInvoice.invoiceNumber)}</td>
            <td class="r">${money(m.supplierInvoice.invoiceValue)}</td>
            <td class="mono">${esc(m.ourPurchase.poNumber)}</td>
            <td class="r">${money(m.ourPurchase.total)}</td>
            <td class="r"><b>${money(m.valueDifference)}</b></td>
            <td class="r">${money(m.taxDifference)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}

    <h3>Only in 2A — missing from our books (${rec.onlyIn2A.length})</h3>
    ${rec.onlyIn2A.length === 0 ? '<div class="empty">Nothing.</div>' : `
    <table class="data">${supHead}<tbody>${rec.onlyIn2A.map(supplierLine).join('')}</tbody></table>`}

    <h3>Only in our books — supplier hasn&rsquo;t filed (${rec.onlyInOurs.length})</h3>
    ${rec.onlyInOurs.length === 0 ? '<div class="empty">Nothing.</div>' : `
    <table class="data">${ourHead}<tbody>${rec.onlyInOurs.map(ourLine).join('')}</tbody></table>`}

    <h3>Matched (${rec.matched.length})</h3>
    ${rec.matched.length === 0 ? '<div class="empty">No matched invoices.</div>' : `
    <table class="data">
      <thead><tr>
        <th>Supplier GSTIN</th><th>2A Invoice</th><th>Our PO</th>
        <th class="r">Value</th><th class="r">Δ Tax</th>
      </tr></thead>
      <tbody>
        ${rec.matched.map((m) => `
          <tr>
            <td class="mono">${esc(m.supplierInvoice.supplierGstin)}</td>
            <td class="mono">${esc(m.supplierInvoice.invoiceNumber)}</td>
            <td class="mono">${esc(m.ourPurchase.poNumber)}</td>
            <td class="r">${money(m.ourPurchase.total)}</td>
            <td class="r ${Math.abs(m.taxDifference) < 1 ? 'green' : 'red'}">${money(m.taxDifference)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`}
  `;
}

function gstr9Section(d: Gstr9Resp): string {
  const s4 = d.partII.section4_taxableOutward;
  const s5 = d.partII.section5_nonTaxable;
  const s6 = d.partIII.section6_itcAvailed;
  const tax = d.partIV.section9_taxPaid;
  const bucketRow = (label: string, b: Gstr9OutwardBucket, negative = false) => {
    const sgn = negative ? -1 : 1;
    return `
    <tr>
      <td>${esc(label)}</td>
      <td class="r">${b.count}</td>
      <td class="r">${money(sgn * b.taxable)}</td>
      <td class="r">${money(sgn * (b.cgst || 0))}</td>
      <td class="r">${money(sgn * (b.sgst || 0))}</td>
      <td class="r">${money(sgn * (b.igst || 0))}</td>
    </tr>`;
  };
  const itcRow = (label: string, b: Gstr9ItcBucket, negative = false) => {
    const sgn = negative ? -1 : 1;
    return `
    <tr>
      <td>${esc(label)}</td>
      <td class="r">${money(sgn * b.taxable)}</td>
      <td class="r">${money(sgn * (b.cgst || 0))}</td>
      <td class="r">${money(sgn * (b.sgst || 0))}</td>
      <td class="r">${money(sgn * b.igst)}</td>
    </tr>`;
  };
  return `
    <p class="muted small"><b>${esc(d.legalName)}</b> · GSTIN <span class="mono">${esc(d.gstin || '—')}</span> · FY ${esc(d.financialYear)}</p>

    <h3>Part II · Section 4 — Taxable outward supplies</h3>
    <table class="data">
      <thead><tr>
        <th>Type</th><th class="r">Count</th><th class="r">Taxable</th>
        <th class="r">CGST</th><th class="r">SGST</th><th class="r">IGST</th>
      </tr></thead>
      <tbody>
        ${bucketRow('A · B2C', s4.A_b2c)}
        ${bucketRow('B · B2B', s4.B_b2b)}
        ${bucketRow('C · Exports (with payment of IGST)', s4.C_exportWithPayment)}
        ${bucketRow('D · SEZ supplies (with payment)', s4.D_sezWithPayment)}
        ${bucketRow('E · Deemed exports', s4.E_deemedExport)}
        <tr>
          <td>G · Inward supplies on RCM (we pay)</td>
          <td class="r">—</td>
          <td class="r">${money(s4.G_inwardRcm.taxable)}</td>
          <td class="r">${money(s4.G_inwardRcm.cgst || 0)}</td>
          <td class="r">${money(s4.G_inwardRcm.sgst || 0)}</td>
          <td class="r">${money(s4.G_inwardRcm.igst || 0)}</td>
        </tr>
        ${bucketRow('I · Credit notes issued', s4.I_creditNotes, true)}
        ${bucketRow('J · Debit notes issued', s4.J_debitNotes)}
      </tbody>
    </table>

    <h3>Part II · Section 5 — Non-taxable outward supplies</h3>
    <table class="data">
      <thead><tr><th>Type</th><th class="r">Count</th><th class="r">Value</th></tr></thead>
      <tbody>
        <tr><td>A · Exports without payment of tax (LUT)</td><td class="r">${s5.A_exportWithoutPayment.count}</td><td class="r">${money(s5.A_exportWithoutPayment.taxable)}</td></tr>
        <tr><td>B · SEZ supplies without payment</td><td class="r">${s5.B_sezWithoutPayment.count}</td><td class="r">${money(s5.B_sezWithoutPayment.taxable)}</td></tr>
        <tr><td>D · Exempt supplies</td><td class="r">${s5.D_exempt.count}</td><td class="r">${money(s5.D_exempt.taxable)}</td></tr>
        <tr><td>E · Nil rated supplies</td><td class="r">${s5.E_nilRated.count}</td><td class="r">${money(s5.E_nilRated.taxable)}</td></tr>
        <tr><td>F · Non-GST supplies</td><td class="r">${s5.F_nonGst.count}</td><td class="r">${money(s5.F_nonGst.taxable)}</td></tr>
      </tbody>
    </table>

    <h3>Part III · ITC availed &amp; reversed</h3>
    <table class="data">
      <thead><tr>
        <th>Source</th><th class="r">Taxable</th><th class="r">CGST</th>
        <th class="r">SGST</th><th class="r">IGST</th>
      </tr></thead>
      <tbody>
        ${itcRow('6B · Inputs (regular B2B purchases)', s6.B_inputs)}
        ${itcRow('6C+D · Inward on RCM', s6.CD_rcm)}
        <tr>
          <td>6E · Imports of goods</td>
          <td class="r">${money(s6.E_imports.taxable)}</td>
          <td class="r">—</td><td class="r">—</td>
          <td class="r">${money(s6.E_imports.igst)}</td>
        </tr>
        ${itcRow('7 · ITC reversed (purchase returns / DN)', d.partIII.section7_itcReversed.purchaseReturns, true)}
        <tr class="totals">
          <td><b>Net ITC available</b></td>
          <td colspan="3"></td>
          <td class="r green"><b>${money(d.partIII.netItc)}</b></td>
        </tr>
      </tbody>
    </table>

    <h3>Part IV · Section 9 — Tax paid</h3>
    <table class="data">
      <thead><tr>
        <th>Tax</th><th class="r">Payable</th>
        <th class="r">Paid via ITC</th><th class="r">Paid in cash</th>
      </tr></thead>
      <tbody>
        <tr><td>Integrated Tax (IGST)</td>
          <td class="r">${money(tax.integratedTax.payable)}</td>
          <td class="r">${money(tax.integratedTax.paidViaItc)}</td>
          <td class="r">${money(tax.integratedTax.paidInCash)}</td></tr>
        <tr><td>Central Tax (CGST)</td>
          <td class="r">${money(tax.centralTax.payable)}</td>
          <td class="r">${money(tax.centralTax.paidViaItc)}</td>
          <td class="r">${money(tax.centralTax.paidInCash)}</td></tr>
        <tr><td>State Tax (SGST)</td>
          <td class="r">${money(tax.stateTax.payable)}</td>
          <td class="r">${money(tax.stateTax.paidViaItc)}</td>
          <td class="r">${money(tax.stateTax.paidInCash)}</td></tr>
        <tr class="totals">
          <td><b>Total</b></td>
          <td class="r"><b>${money(tax.totalPayable)}</b></td>
          <td class="r"><b>${money(tax.totalItcUsed)}</b></td>
          <td class="r red"><b>${money(tax.totalCash)}</b></td>
        </tr>
      </tbody>
    </table>

    <h3>Monthly breakdown</h3>
    <table class="data">
      <thead><tr>
        <th>Month</th><th class="r">Taxable</th><th class="r">Output tax</th>
        <th class="r">ITC</th><th class="r">Net payable</th>
      </tr></thead>
      <tbody>
        ${d.monthly.map((m) => `
          <tr>
            <td>${esc(m.monthLabel)}</td>
            <td class="r">${money(m.taxableValue)}</td>
            <td class="r">${money(m.outputTax)}</td>
            <td class="r">${money(m.itc)}</td>
            <td class="r ${m.netPayable < 0 ? 'green' : ''}">${money(m.netPayable)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

export function buildGstReportHtml(args: {
  period: string;
  store: StoreInfo | null;
  summary: SummaryResp | null;
  gstr1: Gstr1Resp | null;
  gstr3b: Gstr3bResp | null;
  reconcile?: ReconcileResp | null;
  gstr9?: Gstr9Resp | null;
}): string {
  const { period, store, summary, gstr1, gstr3b, reconcile, gstr9 } = args;
  const generatedAt = new Date().toLocaleString('en-IN');
  const gstin = gstr1?.gstin || gstr3b?.gstin || store?.gstNumber || '';

  // Cover + summary
  const cover = `
    <section class="cover">
      <header class="cover-header">
        <div class="brand">
          ${logoTag(store)}
          <div>
            <h1>${esc(store?.name || 'Store')}</h1>
            <div class="muted">${esc(formatAddress(store))}</div>
            ${store?.phone ? `<div class="muted">Phone: ${esc(store.phone)}</div>` : ''}
            ${gstin ? `<div class="muted">GSTIN: <b>${esc(gstin)}</b></div>` : ''}
          </div>
        </div>
        <div class="meta">
          <div class="muted">Generated ${esc(generatedAt)}</div>
        </div>
      </header>
      <h2 class="report-title">GST Return Report</h2>
      <div class="period">Period: <b>${esc(periodLabel(period))}</b></div>
      ${
        summary
          ? `
        <div class="kpi-grid">
          <div class="kpi"><div class="lbl">Output GST (sales)</div><div class="val purple">${money(summary.sales.totalTax)}</div><div class="hint">${summary.sales.count} invoices · ${money(summary.sales.taxableValue)} taxable</div></div>
          <div class="kpi"><div class="lbl">Input ITC (purchases)</div><div class="val green">${money(summary.purchases.totalTax)}</div><div class="hint">${summary.purchases.count} GRNs · ${money(summary.purchases.taxableValue)} taxable</div></div>
          <div class="kpi"><div class="lbl">Net GST payable</div><div class="val ${summary.netGSTPayable > 0 ? 'red' : 'green'}">${money(summary.netGSTPayable)}</div><div class="hint">${summary.netGSTPayable > 0 ? 'Payable to government' : 'ITC carry-forward'}</div></div>
          <div class="kpi"><div class="lbl">GSTIN</div><div class="val mono small">${esc(gstin || '—')}</div><div class="hint">Period ${esc(period)}</div></div>
        </div>
      `
          : ''
      }
    </section>
  `;

  // GSTR-1 sections
  const gstr1Pages = gstr1
    ? `
    <section class="page-break"></section>
    <section>
      <h2>GSTR-1 · Outward Supplies</h2>
      <p class="muted small">Period ${esc(periodLabel(period))} · GSTIN ${esc(gstin || '—')}</p>

      <h3>4A — B2B (registered customers)</h3>
      ${gstr1InvoiceTable(gstr1.sections['4A_B2B'].rows, gstr1.sections['4A_B2B'].totals, true)}

      <h3>5A — B2C Large (inter-state, &gt; ₹2.5L)</h3>
      ${gstr1InvoiceTable(gstr1.sections['5A_B2CL'].rows, gstr1.sections['5A_B2CL'].totals)}

      <h3>6A — Exports</h3>
      ${gstr1InvoiceTable(gstr1.sections['6A_Exports'].rows, gstr1.sections['6A_Exports'].totals)}

      <h3>7 — B2C Small (consolidated)</h3>
      ${gstr1B2csTable(gstr1.sections['7_B2CS'].rows, gstr1.sections['7_B2CS'].totals)}

      <h3>8 — Nil rated / Exempt / Non-GST</h3>
      <table class="data">
        <tbody>
          <tr><td>Nil rated</td><td class="r">${money(gstr1.sections['8_NilExempt'].nil)}</td></tr>
          <tr><td>Exempt</td><td class="r">${money(gstr1.sections['8_NilExempt'].exempt)}</td></tr>
          <tr><td>Non-GST</td><td class="r">${money(gstr1.sections['8_NilExempt'].nonGst)}</td></tr>
        </tbody>
      </table>

      <h3>9B — Credit/Debit Notes (Registered)</h3>
      ${gstr1InvoiceTable(gstr1.sections['9B_CDNR'].rows, gstr1.sections['9B_CDNR'].totals, true)}

      <h3>9B — Credit/Debit Notes (Unregistered)</h3>
      ${gstr1InvoiceTable(gstr1.sections['9B_CDNUR'].rows, gstr1.sections['9B_CDNUR'].totals)}

      <h3>13 — Documents issued</h3>
      <table class="data">
        <tbody>
          <tr><td>First invoice</td><td class="r mono">${esc(gstr1.sections['13_Documents'].invoices.from || '—')}</td></tr>
          <tr><td>Last invoice</td><td class="r mono">${esc(gstr1.sections['13_Documents'].invoices.to || '—')}</td></tr>
          <tr><td>Total invoices</td><td class="r"><b>${gstr1.sections['13_Documents'].invoices.total}</b></td></tr>
          <tr><td>Cancelled</td><td class="r"><b>${gstr1.sections['13_Documents'].invoices.cancelled}</b></td></tr>
        </tbody>
      </table>
    </section>
  `
    : '';

  // GSTR-3B
  const gstr3bPage = gstr3b
    ? `
    <section class="page-break"></section>
    <section>
      <h2>GSTR-3B · Monthly Summary</h2>
      <p class="muted small">Period ${esc(periodLabel(period))} · GSTIN ${esc(gstin || '—')}</p>
      ${gstr3bSection(gstr3b)}
    </section>
  `
    : '';

  // HSN summary
  const hsnPage = gstr1
    ? `
    <section class="page-break"></section>
    <section>
      <h2>Section 12 · HSN-wise Summary</h2>
      <p class="muted small">Aggregated by HSN code + GST rate. Required for GSTR-1 filing.</p>
      ${hsnTable(gstr1.sections['12_HSN'].rows, gstr1.sections['12_HSN'].totals)}
    </section>
  `
    : '';

  // GSTR-2A reconciliation (only if user uploaded a 2A file)
  const reconcilePage = reconcile
    ? `
    <section class="page-break"></section>
    <section>
      <h2>GSTR-2A Reconciliation</h2>
      <p class="muted small">Period ${esc(periodLabel(period))} · Compared against uploaded GSTR-2A</p>
      ${reconcileSection(reconcile)}
    </section>
  `
    : '';

  // GSTR-9 Annual return (only if loaded)
  const gstr9Page = gstr9
    ? `
    <section class="page-break"></section>
    <section>
      <h2>GSTR-9 · Annual Return</h2>
      ${gstr9Section(gstr9)}
    </section>
  `
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>GST Returns — ${esc(periodLabel(period))} — ${esc(store?.name || '')}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 10px; line-height: 1.4; }
  .doc { max-width: 190mm; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0; line-height: 1.1; }
  h2 { font-size: 15px; margin: 18px 0 8px 0; padding-bottom: 4px; border-bottom: 1.5px solid #111; }
  h3 { font-size: 12px; margin: 14px 0 4px 0; color: #333; }
  p { margin: 4px 0; }
  .muted { color: #666; }
  .small { font-size: 9px; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .r { text-align: right; }
  .red { color: #b91c1c; }
  .green { color: #047857; }
  .purple { color: #6d28d9; }

  .cover-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
    border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { display: flex; gap: 10px; align-items: flex-start; }
  .meta { text-align: right; }
  .report-title { font-size: 22px; margin: 16px 0 4px 0; border: 0; padding: 0; }
  .period { font-size: 12px; margin-bottom: 14px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
  .kpi { border: 1px solid #ddd; border-radius: 4px; padding: 8px; }
  .kpi .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
  .kpi .val { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .kpi .val.small { font-size: 11px; word-break: break-all; }
  .kpi .hint { font-size: 9px; color: #666; margin-top: 2px; }

  table.data { width: 100%; border-collapse: collapse; margin-bottom: 6px;
    border: 1px solid #d4d4d4; border-radius: 3px; }
  table.data th { background: #f3f4f6; text-align: left; padding: 5px 6px; border-bottom: 1px solid #d4d4d4;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: #333; }
  table.data td { padding: 4px 6px; border-bottom: 1px solid #ececec; vertical-align: top; }
  table.data tr:last-child td { border-bottom: 0; }
  table.data tr.totals td { background: #fafafa; border-top: 1.5px solid #111; font-size: 10px; }
  .empty { color: #888; font-style: italic; padding: 6px 4px; font-size: 10px; }

  .page-break { page-break-after: always; height: 0; visibility: hidden; }
  @media print {
    .page-break { display: block; }
  }
</style>
</head>
<body>
  <div class="doc">
    ${cover}
    ${gstr1Pages}
    ${gstr3bPage}
    ${hsnPage}
    ${reconcilePage}
    ${gstr9Page}
  </div>

  <script>
    window.onload = function() {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;
}

// ---------- iframe-based print (mirrors lib/print-invoice.ts) ----------
function printHtml(html: string) {
  if (typeof window === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };
  const win = iframe.contentWindow;
  if (win) {
    win.onafterprint = cleanup;
    setTimeout(cleanup, 60_000);
  } else {
    setTimeout(cleanup, 60_000);
  }
}

export function exportGstReportPdf(args: {
  period: string;
  store: StoreInfo | null;
  summary: SummaryResp | null;
  gstr1: Gstr1Resp | null;
  gstr3b: Gstr3bResp | null;
  reconcile?: ReconcileResp | null;
  gstr9?: Gstr9Resp | null;
}): void {
  const html = buildGstReportHtml(args);
  printHtml(html);
}

// =================================================================
// CSV export — every section as a separate block in one .csv file
// =================================================================

const csvEscape = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Quote if contains comma, quote, newline, or leading/trailing whitespace.
  if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const csvRow = (cells: unknown[]): string => cells.map(csvEscape).join(',');

const csvBlock = (title: string, header: string[], rows: unknown[][]): string => {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  if (rows.length === 0) {
    lines.push('# (no data)');
    lines.push('');
    return lines.join('\n');
  }
  lines.push(csvRow(header));
  for (const r of rows) lines.push(csvRow(r));
  lines.push('');
  return lines.join('\n');
};

export function buildGstReportCsv(args: {
  period: string;
  store: StoreInfo | null;
  summary: SummaryResp | null;
  gstr1: Gstr1Resp | null;
  gstr3b: Gstr3bResp | null;
  reconcile?: ReconcileResp | null;
  gstr9?: Gstr9Resp | null;
}): string {
  const { period, store, summary, gstr1, gstr3b, reconcile, gstr9 } = args;
  const blocks: string[] = [];
  const gstin = gstr1?.gstin || gstr3b?.gstin || store?.gstNumber || '';

  blocks.push(`# GST Return Report`);
  blocks.push(`# Store: ${store?.name ?? ''}`);
  blocks.push(`# GSTIN: ${gstin}`);
  blocks.push(`# Period: ${periodLabel(period)} (${period})`);
  blocks.push(`# Generated: ${new Date().toLocaleString('en-IN')}`);
  blocks.push('');

  if (summary) {
    blocks.push(csvBlock(
      'Summary',
      ['Metric', 'Count', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total tax'],
      [
        ['Sales (output GST)', summary.sales.count, summary.sales.taxableValue, summary.sales.cgst, summary.sales.sgst, summary.sales.igst, summary.sales.totalTax],
        ['Purchases (input ITC)', summary.purchases.count, summary.purchases.taxableValue, summary.purchases.cgst, summary.purchases.sgst, summary.purchases.igst, summary.purchases.totalTax],
        ['Net GST payable', '', '', '', '', '', summary.netGSTPayable],
      ],
    ));
  }

  if (gstr1) {
    const s = gstr1.sections;
    const invHead = ['Invoice #', 'Date', 'Customer', 'GSTIN', 'Place of supply', 'Rate %', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total tax', 'Invoice value'];
    const invRows = (rows: Gstr1Row[]) =>
      rows.map((r) => [r.invoiceNumber, r.invoiceDate, r.customerName, r.gstin || '', r.placeOfSupply, r.rate, r.taxableValue, r.cgst, r.sgst, r.igst, r.totalTax, r.invoiceValue]);

    blocks.push(csvBlock('GSTR-1 · 4A · B2B (registered)', invHead, invRows(s['4A_B2B'].rows)));
    blocks.push(csvBlock('GSTR-1 · 5A · B2C Large (inter-state, > ₹2.5L)', invHead, invRows(s['5A_B2CL'].rows)));
    blocks.push(csvBlock('GSTR-1 · 6A · Exports', invHead, invRows(s['6A_Exports'].rows)));

    blocks.push(csvBlock(
      'GSTR-1 · 7 · B2C Small (consolidated)',
      ['Place of supply', 'Rate %', 'Invoice count', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total tax'],
      s['7_B2CS'].rows.map((r) => [r.placeOfSupply, r.rate, r.count, r.taxableValue, r.cgst, r.sgst, r.igst, r.totalTax]),
    ));

    blocks.push(csvBlock(
      'GSTR-1 · 8 · Nil rated / Exempt / Non-GST',
      ['Type', 'Value'],
      [
        ['Nil rated', s['8_NilExempt'].nil],
        ['Exempt', s['8_NilExempt'].exempt],
        ['Non-GST', s['8_NilExempt'].nonGst],
      ],
    ));

    blocks.push(csvBlock('GSTR-1 · 9B · Credit/Debit Notes (Registered)', invHead, invRows(s['9B_CDNR'].rows)));
    blocks.push(csvBlock('GSTR-1 · 9B · Credit/Debit Notes (Unregistered)', invHead, invRows(s['9B_CDNUR'].rows)));

    blocks.push(csvBlock(
      'GSTR-1 · 12 · HSN-wise summary',
      ['HSN', 'Description', 'UQC', 'Quantity', 'Rate %', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total value'],
      s['12_HSN'].rows.map((r) => [r.hsn, r.description, r.uqc, r.quantity, r.rate, r.taxableValue, r.cgst, r.sgst, r.igst, r.totalValue]),
    ));

    blocks.push(csvBlock(
      'GSTR-1 · 13 · Documents issued',
      ['Field', 'Value'],
      [
        ['First invoice', s['13_Documents'].invoices.from],
        ['Last invoice', s['13_Documents'].invoices.to],
        ['Total invoices', s['13_Documents'].invoices.total],
        ['Cancelled', s['13_Documents'].invoices.cancelled],
      ],
    ));
  }

  if (gstr3b) {
    const s = gstr3b.sections;
    blocks.push(csvBlock(
      'GSTR-3B · 3.1 · Outward supplies',
      ['Nature', 'Taxable value', 'IGST', 'CGST', 'SGST'],
      [
        ['(a) Outward taxable supplies', s['3.1_OutwardSupplies'].taxableSupplies.taxableValue, s['3.1_OutwardSupplies'].taxableSupplies.igst, s['3.1_OutwardSupplies'].taxableSupplies.cgst, s['3.1_OutwardSupplies'].taxableSupplies.sgst],
        ['(b) Zero-rated', s['3.1_OutwardSupplies'].zeroRated.taxableValue, s['3.1_OutwardSupplies'].zeroRated.igst, '', ''],
        ['(c) Nil/Exempt', s['3.1_OutwardSupplies'].nilRated.taxableValue + s['3.1_OutwardSupplies'].exempt.taxableValue, '', '', ''],
        ['(d) Non-GST', s['3.1_OutwardSupplies'].nonGst.taxableValue, '', '', ''],
      ],
    ));
    blocks.push(csvBlock(
      'GSTR-3B · 3.2 · Inter-state supplies to unregistered',
      ['Field', 'Value'],
      [['Total taxable value', s['3.2_InterStateUnregistered'].totalTaxableValueToUnregistered]],
    ));
    blocks.push(csvBlock(
      'GSTR-3B · 4 · Eligible ITC',
      ['Nature', 'CGST', 'SGST', 'IGST'],
      [
        ['(A) Eligible', s['4_ITC'].eligible.cgst, s['4_ITC'].eligible.sgst, s['4_ITC'].eligible.igst],
        ['(B) Ineligible', s['4_ITC'].ineligible.cgst, s['4_ITC'].ineligible.sgst, s['4_ITC'].ineligible.igst],
        ['(C) Net ITC', '', '', s['4_ITC'].netITC],
      ],
    ));
    blocks.push(csvBlock(
      'GSTR-3B · 6.1 · Payment of tax',
      ['Field', 'Value'],
      [
        ['Output tax', s['6.1_PaymentOfTax'].outputTax],
        ['ITC utilised', s['6.1_PaymentOfTax'].itcUtilised],
        ['Net payable', s['6.1_PaymentOfTax'].netPayable],
      ],
    ));
  }

  if (reconcile) {
    const sup = reconcile.summary;
    blocks.push(csvBlock(
      'GSTR-2A Reconciliation · Summary',
      ['Field', 'Value'],
      [
        ['In 2A (count)', sup.total2A],
        ['In our books (count)', sup.totalOurs],
        ['Matched', sup.matched],
        ['Mismatched', sup.mismatched],
        ['Only in 2A', sup.onlyIn2A],
        ['Only in our books', sup.onlyInOurs],
        ['ITC per 2A', sup.itc2A],
        ['ITC we claimed', sup.itcOurs],
        ['ITC difference', sup.itcDifference],
      ],
    ));
    blocks.push(csvBlock(
      '2A · Mismatched',
      ['Supplier GSTIN', '2A Invoice', '2A Value', 'Our PO', 'Our Value', 'Δ Value', 'Δ Tax'],
      reconcile.mismatched.map((m) => [
        m.supplierInvoice.supplierGstin, m.supplierInvoice.invoiceNumber, m.supplierInvoice.invoiceValue,
        m.ourPurchase.poNumber, m.ourPurchase.total, m.valueDifference, m.taxDifference,
      ]),
    ));
    blocks.push(csvBlock(
      '2A · Only in 2A (missing from our books)',
      ['Supplier GSTIN', 'Invoice #', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'Invoice value'],
      reconcile.onlyIn2A.map((s) => [s.supplierGstin, s.invoiceNumber, s.invoiceDate || '', s.taxableValue, s.cgst, s.sgst, s.igst, s.invoiceValue]),
    ));
    blocks.push(csvBlock(
      '2A · Only in our books (supplier hasn\'t filed)',
      ['Supplier', 'Supplier GSTIN', 'Our PO', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
      reconcile.onlyInOurs.map((p) => [p.supplierName, p.supplierGstin, p.poNumber, p.poDate, p.taxableValue, p.cgst, p.sgst, p.igst, p.total]),
    ));
    blocks.push(csvBlock(
      '2A · Matched',
      ['Supplier GSTIN', '2A Invoice', 'Our PO', 'Value', 'Δ Tax'],
      reconcile.matched.map((m) => [m.supplierInvoice.supplierGstin, m.supplierInvoice.invoiceNumber, m.ourPurchase.poNumber, m.ourPurchase.total, m.taxDifference]),
    ));
  }

  if (gstr9) {
    const s4 = gstr9.partII.section4_taxableOutward;
    const s5 = gstr9.partII.section5_nonTaxable;
    const s6 = gstr9.partIII.section6_itcAvailed;
    const tax = gstr9.partIV.section9_taxPaid;
    const buc = (b: Gstr9OutwardBucket) => [b.count, b.taxable, b.cgst || 0, b.sgst || 0, b.igst || 0];
    const itc = (b: Gstr9ItcBucket) => [b.taxable, b.cgst || 0, b.sgst || 0, b.igst];

    blocks.push(csvBlock(
      `GSTR-9 · FY ${gstr9.financialYear} · Header`,
      ['Field', 'Value'],
      [
        ['Legal name', gstr9.legalName],
        ['GSTIN', gstr9.gstin],
        ['Financial year', gstr9.financialYear],
      ],
    ));

    blocks.push(csvBlock(
      'GSTR-9 · Section 4 · Taxable outward supplies',
      ['Type', 'Count', 'Taxable', 'CGST', 'SGST', 'IGST'],
      [
        ['A · B2C', ...buc(s4.A_b2c)],
        ['B · B2B', ...buc(s4.B_b2b)],
        ['C · Exports (with payment)', ...buc(s4.C_exportWithPayment)],
        ['D · SEZ (with payment)', ...buc(s4.D_sezWithPayment)],
        ['E · Deemed exports', ...buc(s4.E_deemedExport)],
        ['G · Inward on RCM', '', s4.G_inwardRcm.taxable, s4.G_inwardRcm.cgst || 0, s4.G_inwardRcm.sgst || 0, s4.G_inwardRcm.igst || 0],
        ['I · Credit notes (negative)', ...buc(s4.I_creditNotes)],
        ['J · Debit notes', ...buc(s4.J_debitNotes)],
      ],
    ));

    blocks.push(csvBlock(
      'GSTR-9 · Section 5 · Non-taxable outward supplies',
      ['Type', 'Count', 'Value'],
      [
        ['A · Exports without payment (LUT)', s5.A_exportWithoutPayment.count, s5.A_exportWithoutPayment.taxable],
        ['B · SEZ without payment', s5.B_sezWithoutPayment.count, s5.B_sezWithoutPayment.taxable],
        ['D · Exempt', s5.D_exempt.count, s5.D_exempt.taxable],
        ['E · Nil rated', s5.E_nilRated.count, s5.E_nilRated.taxable],
        ['F · Non-GST', s5.F_nonGst.count, s5.F_nonGst.taxable],
      ],
    ));

    blocks.push(csvBlock(
      'GSTR-9 · ITC availed and reversed',
      ['Source', 'Taxable', 'CGST', 'SGST', 'IGST'],
      [
        ['6B · Inputs', ...itc(s6.B_inputs)],
        ['6C+D · Inward on RCM', ...itc(s6.CD_rcm)],
        ['6E · Imports of goods', s6.E_imports.taxable, '', '', s6.E_imports.igst],
        ['7 · Reversed (purchase returns)', ...itc(gstr9.partIII.section7_itcReversed.purchaseReturns)],
        ['Net ITC available', '', '', '', gstr9.partIII.netItc],
      ],
    ));

    blocks.push(csvBlock(
      'GSTR-9 · Section 9 · Tax paid',
      ['Tax', 'Payable', 'Paid via ITC', 'Paid in cash'],
      [
        ['IGST', tax.integratedTax.payable, tax.integratedTax.paidViaItc, tax.integratedTax.paidInCash],
        ['CGST', tax.centralTax.payable, tax.centralTax.paidViaItc, tax.centralTax.paidInCash],
        ['SGST', tax.stateTax.payable, tax.stateTax.paidViaItc, tax.stateTax.paidInCash],
        ['Total', tax.totalPayable, tax.totalItcUsed, tax.totalCash],
      ],
    ));

    blocks.push(csvBlock(
      'GSTR-9 · Monthly breakdown',
      ['Period', 'Month', 'Taxable supply', 'Output tax', 'ITC', 'Net payable'],
      gstr9.monthly.map((m) => [m.period, m.monthLabel, m.taxableValue, m.outputTax, m.itc, m.netPayable]),
    ));
  }

  // Excel-friendly: prepend a UTF-8 BOM so ₹ and other non-ASCII characters
  // open correctly when double-clicked from Windows Explorer.
  return '﻿' + blocks.join('\n');
}

export function exportGstReportCsv(args: {
  period: string;
  store: StoreInfo | null;
  summary: SummaryResp | null;
  gstr1: Gstr1Resp | null;
  gstr3b: Gstr3bResp | null;
  reconcile?: ReconcileResp | null;
  gstr9?: Gstr9Resp | null;
}): void {
  const csv = buildGstReportCsv(args);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gst-${args.period}-${(args.store?.name || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
