import type { Sale, StoreInfo } from './types';
// QR rendering uses `react-dom/server` + `qrcode.react`. Both are loaded
// lazily inside `qrSvg()` so a bundler quirk on one specific Next.js entry
// can't take down the entire print pipeline — printing falls back to "no
// QR" instead of crashing the click handler.

// =============================================================================
// Print helpers — bill / tax-invoice rendering for both 80mm thermal and A4
// formats. Both templates are GST-aware: when `store.gstRegistered === false`
// they fall back to a Bill-of-Supply layout with no tax columns. When the
// sale carries e-invoice data (IRN, Ack No, signed QR), it's rendered into
// the A4 layout per NIC schema v1.1 requirements.
// =============================================================================

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Safe 2-dp formatter — never throws if input is undefined/null/NaN. */
const fix2 = (n: unknown) => (Number(n) || 0).toFixed(2);

const formatAddress = (store?: StoreInfo | null) => {
  if (!store?.address) return '';
  const a = store.address;
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
};

function storeLogoTag(store?: StoreInfo | null) {
  if (!store?.logoUrl || !store.logoUrl.trim()) return '';
  return `<img src="${esc(store.logoUrl)}" alt="${esc(store.name)}" style="max-height:60px;max-width:200px;object-fit:contain;" />`;
}

/**
 * Document-title resolver. Drives the headline of every invoice:
 *  - BILL OF SUPPLY   — branch is not GST-registered, no tax components.
 *  - CREDIT NOTE      — sale is a return.
 *  - EXPORT INVOICE   — invoiceType is one of the two export variants.
 *  - SEZ INVOICE      — supply to a Special Economic Zone.
 *  - TAX INVOICE      — default for GST-registered branches.
 */
function resolveDocTitle(sale: Sale, store?: StoreInfo | null): string {
  if (sale.status === 'returned') return 'CREDIT NOTE';
  if (store && store.gstRegistered === false) return 'BILL OF SUPPLY';
  const it = sale.invoiceType;
  if (it === 'export_with_payment' || it === 'export_without_payment') return 'EXPORT INVOICE';
  if (it === 'sez_with_payment' || it === 'sez_without_payment') return 'SEZ INVOICE';
  if (it === 'deemed_export') return 'DEEMED EXPORT INVOICE';
  return 'TAX INVOICE';
}

/**
 * Compute the supply context that determines tax-column layout.
 * - intraState: CGST + SGST printed (store state === buyer state).
 * - interState: IGST printed instead.
 * - billOfSupply: no tax printed at all (unregistered branch).
 */
function supplyContext(sale: Sale, store?: StoreInfo | null) {
  const billOfSupply = !!(store && store.gstRegistered === false);
  const buyerState =
    (sale.customerSnapshot?.stateCode || '').trim() ||
    sale.placeOfSupply ||
    '';
  const storeState = (store?.stateCode || '').trim();
  const intraState = !!storeState && !!buyerState && storeState === buyerState;
  // No GST-bearing buyer state info → treat as intra-state (POS walk-in
  // defaults to store's own state). Matches the §8.3 fallback.
  const effectiveIntra = billOfSupply ? false : buyerState ? intraState : true;
  return { billOfSupply, intraState: effectiveIntra };
}

/**
 * Render the signed e-invoice QR as inline SVG markup. Returns empty when no
 *  payload, when the QR library / react-dom-server pair fails to resolve in
 *  the current bundle, or for any other reason — printing must never break
 *  because the QR couldn't be drawn.
 *
 * Resolves the two deps via `require()` inside a try/catch so a Turbopack /
 * Webpack hiccup on `react-dom/server` doesn't blow up `printInvoice` at
 * the click-handler call site.
 */
function qrSvg(value: string, size = 96): string {
  if (!value) return '';
  try {
    // Resolved lazily via dynamic require so that any of these failing
    // returns '' instead of throwing. The dependency tree is fine in
    // theory but bundler issues in dev (renderToStaticMarkup turning into
    // a stub, etc.) shouldn't prevent the bill from printing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rds = require('react-dom/server');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reactPkg = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qrPkg = require('qrcode.react');
    const renderToStaticMarkup = rds?.renderToStaticMarkup;
    const createElement = reactPkg?.createElement;
    const QRCodeSVG = qrPkg?.QRCodeSVG;
    if (
      typeof renderToStaticMarkup !== 'function' ||
      typeof createElement !== 'function' ||
      typeof QRCodeSVG === 'undefined'
    ) {
      return '';
    }
    return renderToStaticMarkup(
      createElement(QRCodeSVG, { value, size, level: 'M', marginSize: 0 }),
    );
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[print-invoice] QR generation skipped:', err);
    }
    return '';
  }
}

// ---------- Thermal 80mm receipt ---------------------------------------------
export function thermalInvoiceHtml(sale: Sale, store?: StoreInfo | null): string {
  const dt = new Date(sale.createdAt);
  const docTitle = resolveDocTitle(sale, store);
  const { billOfSupply, intraState } = supplyContext(sale, store);
  const rcm = sale.invoiceType === 'reverse_charge';

  const itemsRows = sale.items
    .map(
      (it) => `
    <tr>
      <td style="padding:1px 2px;vertical-align:top;">
        <div>${esc(it.productSnapshot?.name)}</div>
        <div style="font-size:9px;color:#555;">
          HSN ${esc(it.productSnapshot?.hsnCode)}${
            !billOfSupply ? ` &middot; GST ${it.gstRate}%` : ''
          }${it.warrantyMonths ? ' &middot; ' + it.warrantyMonths + 'm warranty' : ''}
        </div>
      </td>
      <td style="padding:1px 2px;text-align:right;">${it.quantity}</td>
      <td style="padding:1px 2px;text-align:right;">${fix2(it.sellingPrice)}</td>
      <td style="padding:1px 2px;text-align:right;">${fix2(it.totalAmount)}</td>
    </tr>`,
    )
    .join('');

  const payments = (sale.payments || [])
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between;"><span style="text-transform:uppercase;">${esc(p.mode)}</span><span>${money(p.amount)}</span></div>`,
    )
    .join('');

  // Aggregate the tax row so we can split CGST/SGST vs IGST even on a
  // narrow thermal print. Skipped entirely for a bill of supply.
  const cgstTotal = sale.items.reduce((s, it) => s + Number(it.cgst || 0), 0);
  const sgstTotal = sale.items.reduce((s, it) => s + Number(it.sgst || 0), 0);
  const igstTotal = sale.items.reduce((s, it) => s + Number(it.igst || 0), 0);

  const eInvoiceBlock =
    sale.eInvoice?.irn && !billOfSupply
      ? `
  <div class="sep"></div>
  <div style="font-size:9px;line-height:1.3;">
    <div class="row"><span>IRN</span><span style="word-break:break-all;text-align:right;max-width:55mm;">${esc(sale.eInvoice.irn)}</span></div>
    ${sale.eInvoice.ackNo ? `<div class="row"><span>Ack No</span><span>${esc(sale.eInvoice.ackNo)}</span></div>` : ''}
    ${sale.eInvoice.ackDate ? `<div class="row"><span>Ack Date</span><span>${esc(sale.eInvoice.ackDate)}</span></div>` : ''}
  </div>`
      : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(sale.invoiceNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.35; }
  .sep { border-top: 1px dashed #666; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 10px; text-align: left; border-bottom: 1px dashed #666; padding: 2px; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .bold { font-weight: 700; }
  .center { text-align: center; }
  .total { font-weight: 700; font-size: 13px; border-top: 1px dashed #666; padding-top: 3px; margin-top: 3px; }
  .warranty { border: 1px dashed #999; padding: 3px; margin: 4px 0; }
</style>
</head>
<body>
  <div class="center" style="margin-bottom:4px;">
    ${storeLogoTag(store)}
    <div class="bold" style="font-size:13px;text-transform:uppercase;">${esc(store?.name || '')}</div>
    <div style="font-size:10px;">${esc(formatAddress(store))}</div>
    ${
      store?.gstNumber && !billOfSupply
        ? `<div style="font-size:10px;">GSTIN: ${esc(store.gstNumber)}${store.stateCode ? ` &middot; State: ${esc(store.stateCode)}` : ''}</div>`
        : ''
    }
    ${store?.phone ? `<div style="font-size:10px;">Ph: ${esc(store.phone)}</div>` : ''}
    <div class="bold" style="font-size:11px;margin-top:2px;">${docTitle}${sale.hasWarranty ? ' (WARRANTY)' : ''}</div>
    ${rcm ? '<div style="font-size:9px;">Reverse charge applicable</div>' : ''}
  </div>
  <div class="sep"></div>
  <div class="row"><span>Invoice:</span><span class="bold">${esc(sale.invoiceNumber)}</span></div>
  <div class="row"><span>Date:</span><span>${dt.toLocaleString('en-IN')}</span></div>
  <div class="row"><span>Customer:</span><span>${esc(sale.customerSnapshot?.name || 'Walk-in')}</span></div>
  ${sale.customerSnapshot?.phone ? `<div class="row"><span>Phone:</span><span>${esc(sale.customerSnapshot.phone)}</span></div>` : ''}
  ${
    sale.customerSnapshot?.gstNumber && !billOfSupply
      ? `<div class="row"><span>Buyer GSTIN:</span><span>${esc(sale.customerSnapshot.gstNumber)}</span></div>`
      : ''
  }
  ${
    !billOfSupply && (sale.placeOfSupply || sale.customerSnapshot?.stateCode)
      ? `<div class="row"><span>Place of supply:</span><span>${esc(sale.placeOfSupply || sale.customerSnapshot?.stateCode || '')}</span></div>`
      : ''
  }
  <div class="sep"></div>
  <table>
    <thead>
      <tr><th>Item</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amt</th></tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <div class="sep"></div>
  <div class="row"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
  ${
    sale.totalDiscount > 0
      ? `<div class="row"><span>Discount</span><span>-${money(sale.totalDiscount)}</span></div>`
      : ''
  }
  ${
    !billOfSupply
      ? intraState
        ? `<div class="row"><span>CGST</span><span>${money(cgstTotal)}</span></div>
           <div class="row"><span>SGST</span><span>${money(sgstTotal)}</span></div>`
        : `<div class="row"><span>IGST</span><span>${money(igstTotal)}</span></div>`
      : ''
  }
  ${
    sale.roundOff !== 0
      ? `<div class="row"><span>Round-off</span><span>${fix2(sale.roundOff)}</span></div>`
      : ''
  }
  <div class="row total"><span>TOTAL</span><span>${money(sale.grandTotal)}</span></div>
  ${eInvoiceBlock}
  ${
    sale.eWayBill?.ewbNumber
      ? `<div class="sep"></div>
         <div style="font-size:9px;">
           <div class="row"><span>EWB No</span><span>${esc(sale.eWayBill.ewbNumber)}</span></div>
           ${sale.eWayBill.ewbDate ? `<div class="row"><span>EWB Date</span><span>${esc(sale.eWayBill.ewbDate)}</span></div>` : ''}
         </div>`
      : ''
  }
  <div class="sep"></div>
  ${payments}
  ${
    sale.change > 0
      ? `<div class="row bold"><span>Change</span><span>${money(sale.change)}</span></div>`
      : ''
  }
  <div class="center" style="margin-top:8px;font-size:10px;border-top:1px dashed #666;padding-top:4px;">
    ${
      store?.settings?.invoiceFooter && store.settings.invoiceFooter.trim()
        ? esc(store.settings.invoiceFooter).replace(/\n/g, '<br/>')
        : 'Thank you for your purchase!<br/><span style="font-size:9px;">*** Goods once sold cannot be returned ***</span>'
    }
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

// ---------- A4 GST invoice (e-invoice ready) ---------------------------------
export function a4InvoiceHtml(sale: Sale, store?: StoreInfo | null): string {
  const dt = new Date(sale.createdAt);
  const docTitle = resolveDocTitle(sale, store);
  const { billOfSupply, intraState } = supplyContext(sale, store);
  const rcm = sale.invoiceType === 'reverse_charge';

  // Two-row header structure:
  //  - Row 1 (top): static cells span both rows via rowspan; CGST + SGST (or
  //    IGST) span 2 sub-columns via colspan, grouping rate + amount under
  //    one parent header.
  //  - Row 2 (sub): only the sub-headers (%, Amount) for each tax bucket.
  // Bill of Supply collapses all of this to a single header row.
  const itemsHeader = billOfSupply
    ? `<tr>
         <th rowspan="2">#</th>
         <th rowspan="2">Item</th>
         <th rowspan="2" class="r">Qty</th>
         <th rowspan="2" class="r">Rate</th>
         <th rowspan="2" class="r">Base</th>
         <th rowspan="2" class="r">Disc</th>
         <th rowspan="2" class="r">Taxable</th>
         <th rowspan="2" class="r">Total</th>
       </tr>`
    : intraState
      ? `<tr>
           <th rowspan="2">#</th>
           <th rowspan="2">Item</th>
           <th rowspan="2" class="r">Qty</th>
           <th rowspan="2" class="r">Rate</th>
           <th rowspan="2" class="r">Base</th>
           <th rowspan="2" class="r">Disc</th>
           <th rowspan="2" class="r">Taxable</th>
           <th colspan="2" class="c group">CGST</th>
           <th colspan="2" class="c group">SGST</th>
           <th rowspan="2" class="r">Total</th>
         </tr>
         <tr class="sub">
           <th class="r">%</th><th class="r">Amount</th>
           <th class="r">%</th><th class="r">Amount</th>
         </tr>`
      : `<tr>
           <th rowspan="2">#</th>
           <th rowspan="2">Item</th>
           <th rowspan="2" class="r">Qty</th>
           <th rowspan="2" class="r">Rate</th>
           <th rowspan="2" class="r">Base</th>
           <th rowspan="2" class="r">Disc</th>
           <th rowspan="2" class="r">Taxable</th>
           <th colspan="2" class="c group">IGST</th>
           <th rowspan="2" class="r">Total</th>
         </tr>
         <tr class="sub">
           <th class="r">%</th><th class="r">Amount</th>
         </tr>`;

  const itemsRows = sale.items
    .map((it, idx) => {
      const halfRate = Number(it.gstRate || 0) / 2;
      // Tax cells line up under the parent CGST/SGST headers. The first
      // sub-column gets a left border so the grouping is visually obvious.
      const taxCells = billOfSupply
        ? ''
        : intraState
          ? `<td class="r group-l">${halfRate}%</td><td class="r">${money(it.cgst)}</td>
             <td class="r group-l">${halfRate}%</td><td class="r">${money(it.sgst)}</td>`
          : `<td class="r group-l">${it.gstRate}%</td><td class="r">${money(it.igst)}</td>`;
      return `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <div class="b">${esc(it.productSnapshot?.name)}</div>
        <div class="muted">SKU ${esc(it.productSnapshot?.sku)}${billOfSupply ? '' : ` &middot; HSN ${esc(it.productSnapshot?.hsnCode)}`}</div>
      </td>
      <td class="r">${it.quantity} ${esc(it.unit)}</td>
      <td class="r">${money(it.sellingPrice)}</td>
      <td class="r">${money(it.basePrice)}</td>
      <td class="r">${it.discountAmount > 0 ? '-' + money(it.discountAmount) : '-'}</td>
      <td class="r">${money(it.taxableAmount)}</td>
      ${taxCells}
      <td class="r b">${money(it.totalAmount)}</td>
    </tr>`;
    })
    .join('');

  // HSN summary table — group by HSN, sum taxable + per-rate taxes. Mandatory
  // for GSTR-1 §12 reconciliation. Suppressed for Bill of Supply.
  const hsnSummaryRows = (() => {
    if (billOfSupply) return '';
    const byHsn = new Map<
      string,
      {
        hsn: string;
        qty: number;
        taxable: number;
        cgst: number;
        sgst: number;
        igst: number;
        total: number;
      }
    >();
    for (const it of sale.items) {
      const key = it.productSnapshot?.hsnCode || '—';
      const row = byHsn.get(key) ?? {
        hsn: key,
        qty: 0,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0,
      };
      row.qty += Number(it.quantity || 0);
      row.taxable += Number(it.taxableAmount || 0);
      row.cgst += Number(it.cgst || 0);
      row.sgst += Number(it.sgst || 0);
      row.igst += Number(it.igst || 0);
      row.total += Number(it.totalAmount || 0);
      byHsn.set(key, row);
    }
    if (byHsn.size === 0) return '';
    // Compute totals row so the HSN table footer matches grand totals.
    const totals = Array.from(byHsn.values()).reduce(
      (s, r) => ({
        qty: s.qty + r.qty,
        taxable: s.taxable + r.taxable,
        cgst: s.cgst + r.cgst,
        sgst: s.sgst + r.sgst,
        igst: s.igst + r.igst,
        total: s.total + r.total,
      }),
      { qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    );

    const rows = Array.from(byHsn.values())
      .sort((a, b) => a.hsn.localeCompare(b.hsn))
      .map(
        (r) => `
      <tr>
        <td>${esc(r.hsn)}</td>
        <td class="r">${r.qty}</td>
        <td class="r">${money(r.taxable)}</td>
        ${intraState
          ? `<td class="r group-l">${money(r.cgst)}</td><td class="r">${money(r.sgst)}</td>`
          : `<td class="r group-l">${money(r.igst)}</td>`}
        <td class="r b">${money(r.total)}</td>
      </tr>`,
      )
      .join('');

    // Two-row header: HSN/Qty/Taxable/Total span both rows; CGST/SGST (or
    // IGST) is one grouped parent column. Same visual language as the items
    // table so the operator's eyes don't have to re-anchor.
    const header = intraState
      ? `<tr>
           <th rowspan="2">HSN / SAC</th>
           <th rowspan="2" class="r">Qty</th>
           <th rowspan="2" class="r">Taxable</th>
           <th colspan="2" class="c group">Tax</th>
           <th rowspan="2" class="r">Total</th>
         </tr>
         <tr class="sub">
           <th class="r">CGST</th><th class="r">SGST</th>
         </tr>`
      : `<tr>
           <th rowspan="2">HSN / SAC</th>
           <th rowspan="2" class="r">Qty</th>
           <th rowspan="2" class="r">Taxable</th>
           <th rowspan="2" class="r">IGST</th>
           <th rowspan="2" class="r">Total</th>
         </tr>`;

    return `
    <section class="hsn">
      <h3 class="section-h">HSN / SAC summary</h3>
      <table class="grouped">
        <thead>${header}</thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="totals-row">
            <td class="b">Total</td>
            <td class="r b">${totals.qty}</td>
            <td class="r b">${money(totals.taxable)}</td>
            ${intraState
              ? `<td class="r b group-l">${money(totals.cgst)}</td><td class="r b">${money(totals.sgst)}</td>`
              : `<td class="r b group-l">${money(totals.igst)}</td>`}
            <td class="r b">${money(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </section>`;
  })();

  // Per-tax totals for the right-hand summary table.
  const cgstTotal = sale.items.reduce((s, it) => s + Number(it.cgst || 0), 0);
  const sgstTotal = sale.items.reduce((s, it) => s + Number(it.sgst || 0), 0);
  const igstTotal = sale.items.reduce((s, it) => s + Number(it.igst || 0), 0);

  const warrantyBlock =
    sale.hasWarranty && sale.warranties && sale.warranties.length > 0
      ? `
  <section class="warranty-box">
    <div class="warranty-title">
      <span class="warranty-icon">✓</span> Warranty Details
    </div>
    <table class="warranty-table">
      <thead>
        <tr>
          <th>Product</th>
          <th class="r">Qty</th>
          <th>SKU</th>
          <th>Warranty period</th>
          <th>Starts</th>
          <th>Valid until</th>
        </tr>
      </thead>
      <tbody>
        ${sale.warranties
          .map(
            (w) => `
        <tr>
          <td class="b">${esc(w.productName)}</td>
          <td class="r">${w.quantity}</td>
          <td>${esc(w.sku)}</td>
          <td>${w.warrantyMonths} months</td>
          <td>${new Date(w.startsAt).toLocaleDateString('en-IN')}</td>
          <td class="b">${new Date(w.expiresAt).toLocaleDateString('en-IN')}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="muted" style="margin-top:8px;">
      This invoice is proof of warranty. Please retain it until the warranty period ends.
      For any claim, customer must present this invoice along with ID proof.
    </div>
  </section>`
      : '';

  const payments = (sale.payments || [])
    .map(
      (p) => `
    <tr>
      <td style="text-transform:uppercase;">${esc(p.mode)}</td>
      <td>${esc(p.reference || '-')}</td>
      <td class="r">${money(p.amount)}</td>
    </tr>`,
    )
    .join('');

  const totalInWords = numberToIndianWords(sale.grandTotal);

  // E-invoice block — IRN + Ack + signed QR. Only renders if IRN exists and
  // the branch is GST-registered (e-invoice doesn't apply to BoS).
  const eInvoice = sale.eInvoice;
  const eInvoiceQr = eInvoice?.signedQr ? qrSvg(eInvoice.signedQr, 110) : '';
  const eInvoiceBlock =
    eInvoice?.irn && !billOfSupply
      ? `
    <section class="einvoice">
      <div class="einvoice-text">
        <h3 class="section-h">e-Invoice</h3>
        <div><span class="muted">IRN:</span> <span style="word-break:break-all;">${esc(eInvoice.irn)}</span></div>
        ${eInvoice.ackNo ? `<div><span class="muted">Ack No:</span> <b>${esc(eInvoice.ackNo)}</b></div>` : ''}
        ${eInvoice.ackDate ? `<div><span class="muted">Ack Date:</span> ${esc(eInvoice.ackDate)}</div>` : ''}
        ${eInvoice.status === 'cancelled' ? `<div style="color:#b91c1c;font-weight:700;">CANCELLED${eInvoice.cancelledAt ? ' on ' + esc(eInvoice.cancelledAt) : ''}</div>` : ''}
      </div>
      ${
        eInvoiceQr
          ? `<div class="einvoice-qr">${eInvoiceQr}<div class="muted" style="text-align:center;margin-top:2px;">Signed QR (NIC)</div></div>`
          : ''
      }
    </section>`
      : '';

  // E-way bill block — rendered between items and totals when present.
  const eWayBill = sale.eWayBill;
  const eWayBillBlock =
    eWayBill?.ewbNumber && !billOfSupply
      ? `
    <section class="ewb">
      <h3 class="section-h">e-Way Bill</h3>
      <div class="ewb-grid">
        <div><span class="muted">EWB No:</span> <b>${esc(eWayBill.ewbNumber)}</b></div>
        ${eWayBill.ewbDate ? `<div><span class="muted">Date:</span> ${esc(eWayBill.ewbDate)}</div>` : ''}
        ${eWayBill.validUpto ? `<div><span class="muted">Valid till:</span> ${esc(eWayBill.validUpto)}</div>` : ''}
        ${eWayBill.vehicleNumber ? `<div><span class="muted">Vehicle:</span> ${esc(eWayBill.vehicleNumber)}</div>` : ''}
        ${eWayBill.transportMode ? `<div><span class="muted">Mode:</span> ${esc(eWayBill.transportMode)}</div>` : ''}
        ${eWayBill.transporterId ? `<div><span class="muted">Transporter ID:</span> ${esc(eWayBill.transporterId)}</div>` : ''}
      </div>
    </section>`
      : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(sale.invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; line-height: 1.4; }
  .doc { max-width: 190mm; margin: 0 auto; }
  header.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
    border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  header.top .store { display: flex; gap: 10px; align-items: flex-start; }
  header.top .store img { max-height: 60px; max-width: 120px; object-fit: contain; }
  header.top h1 { font-size: 20px; margin: 0; line-height: 1.1; }
  header.top .muted { color: #555; }
  header.top .right { text-align: right; }
  header.top .invoice-title { font-size: 20px; font-weight: 700; letter-spacing: 1px; }
  header.top .invoice-sub { font-size: 9px; color: #666; letter-spacing: 0.5px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .box { border: 1px solid #bbb; border-radius: 4px; padding: 8px; }
  .box h3 { margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
  .box .b { font-weight: 700; font-size: 12px; }
  .pos-line { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px;
    padding: 6px 8px; background: #f8fafc; border-left: 3px solid #475569; font-size: 10px; }
  .pos-line b { color: #111; }
  table { width: 100%; border-collapse: collapse; }
  .items, .hsn, .ewb, .einvoice, .payments { border: 1px solid #bbb; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
  .items th, .hsn th, .payments th { background: #f3f4f6; text-align: left; padding: 6px; border-bottom: 1px solid #bbb;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #333; }
  .items td, .hsn td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  .items tbody tr:last-child td, .hsn tbody tr:last-child td { border-bottom: none; }
  .r { text-align: right; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .muted { color: #666; font-size: 10px; }
  /* Two-row grouped table — parent CGST/SGST/IGST header above %/Amount.
     The .group class marks the parent th so we can give it a bottom divider
     and a vertical border that separates the group from neighbouring columns.
     The .group-l class is applied to the first sub-cell (and the
     corresponding td) so the grouping is visible even when rows are dense. */
  table.grouped thead tr.sub th { background: #fafafa; font-weight: 600; padding: 4px 6px;
    border-top: 1px solid #ddd; }
  table.grouped th.group { border-left: 1px solid #ddd; border-right: 1px solid #ddd;
    padding: 4px 6px; }
  table.grouped td.group-l, table.grouped th.group ~ th.group { border-left: 1px solid #eee; }
  table.grouped tfoot .totals-row td { background: #f8fafc; border-top: 2px solid #475569;
    padding: 6px; }
  .section-h { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #555;
    padding: 6px 8px; background: #f3f4f6; border-bottom: 1px solid #bbb; }
  .hsn table, .payments table { width: 100%; }
  .hsn td { font-size: 10px; }
  .summary { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 10px; }
  .summary .words { border: 1px solid #bbb; border-radius: 4px; padding: 8px; }
  .summary .totals table td { padding: 4px 6px; }
  .summary .totals .grand td { border-top: 2px solid #111; font-weight: 700; font-size: 13px; }
  .warranty-box { border: 2px solid #d97706; border-radius: 6px; padding: 10px; margin-bottom: 10px;
    background: #fff7ed; }
  .warranty-title { font-weight: 700; color: #9a3412; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .warranty-icon { display: inline-block; width: 16px; height: 16px; border-radius: 50%;
    background: #d97706; color: white; text-align: center; line-height: 16px; font-size: 11px; }
  .warranty-table th { background: #fed7aa; padding: 4px 6px; text-align: left; font-size: 10px;
    border-bottom: 1px solid #d97706; }
  .warranty-table td { padding: 4px 6px; border-bottom: 1px solid #fed7aa; }
  .payments table td { padding: 3px 6px; }
  .einvoice { display: flex; align-items: flex-start; gap: 12px; padding: 8px; flex-wrap: wrap; }
  .einvoice .einvoice-text { flex: 1; min-width: 0; font-size: 10px; line-height: 1.5; }
  .einvoice .einvoice-text > div { word-break: break-word; }
  .einvoice .einvoice-qr svg { display: block; }
  .ewb-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 12px; padding: 8px; font-size: 10px; }
  .ewb-grid > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  footer.bottom { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 24px; }
  footer.bottom .terms { font-size: 10px; color: #555; }
  footer.bottom .sign { border-top: 1px solid #111; padding-top: 6px; text-align: center; margin-top: 60px; }
</style>
</head>
<body>
  <div class="doc">
    <header class="top">
      <div class="store">
        ${storeLogoTag(store)}
        <div>
          <h1>${esc(store?.name || 'Store')}</h1>
          <div class="muted">${esc(formatAddress(store))}</div>
          ${store?.phone ? `<div class="muted">Phone: ${esc(store.phone)}</div>` : ''}
          ${store?.email ? `<div class="muted">Email: ${esc(store.email)}</div>` : ''}
          ${
            store?.gstNumber && !billOfSupply
              ? `<div class="muted">GSTIN: <b>${esc(store.gstNumber)}</b>${store.stateCode ? ` &middot; State code: <b>${esc(store.stateCode)}</b>` : ''}</div>`
              : store?.stateCode
                ? `<div class="muted">State code: <b>${esc(store.stateCode)}</b></div>`
                : ''
          }
        </div>
      </div>
      <div class="right">
        <div class="invoice-title">${docTitle}</div>
        ${sale.hasWarranty ? '<div class="muted">(with warranty)</div>' : ''}
        ${billOfSupply ? '<div class="invoice-sub">(supplier not registered under GST)</div>' : ''}
        ${rcm ? '<div class="invoice-sub" style="color:#b91c1c;">Tax payable on REVERSE CHARGE basis</div>' : ''}
        <div style="margin-top:6px;"><b>${esc(sale.invoiceNumber)}</b></div>
        <div class="muted">${dt.toLocaleDateString('en-IN')} ${dt.toLocaleTimeString('en-IN')}</div>
      </div>
    </header>

    ${
      !billOfSupply && (sale.placeOfSupply || sale.customerSnapshot?.stateCode)
        ? `<div class="pos-line">
             <span><span class="muted">Place of Supply:</span> <b>${esc(sale.placeOfSupply || sale.customerSnapshot?.stateCode || '')}</b></span>
             <span><span class="muted">Reverse charge:</span> <b>${rcm ? 'YES' : 'NO'}</b></span>
             ${
               sale.invoiceType && sale.invoiceType !== 'regular'
                 ? `<span><span class="muted">Type:</span> <b style="text-transform:uppercase;">${esc(sale.invoiceType.replace(/_/g, ' '))}</b></span>`
                 : ''
             }
           </div>`
        : ''
    }

    <section class="meta">
      <div class="box">
        <h3>Billed to</h3>
        <div class="b">${esc(sale.customerSnapshot?.name || 'Walk-in Customer')}</div>
        ${sale.customerSnapshot?.phone ? `<div>Phone: ${esc(sale.customerSnapshot.phone)}</div>` : ''}
        ${sale.customerSnapshot?.address ? `<div>${esc(sale.customerSnapshot.address)}</div>` : ''}
        ${
          sale.customerSnapshot?.gstNumber && !billOfSupply
            ? `<div>GSTIN: <b>${esc(sale.customerSnapshot.gstNumber)}</b></div>`
            : ''
        }
        ${
          sale.customerSnapshot?.stateCode && !billOfSupply
            ? `<div>State code: <b>${esc(sale.customerSnapshot.stateCode)}</b></div>`
            : ''
        }
      </div>
      <div class="box">
        <h3>Payment</h3>
        <div>Status: <b style="text-transform:uppercase;">${esc(sale.paymentStatus)}</b></div>
        <div>Amount paid: <b>${money(sale.amountPaid || 0)}</b></div>
        ${sale.change > 0 ? `<div>Change: <b>${money(sale.change)}</b></div>` : ''}
      </div>
    </section>

    <section class="items">
      <table class="grouped">
        <thead>
          ${itemsHeader}
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </section>

    <section class="summary">
      <div class="words">
        <div class="muted" style="text-transform:uppercase;font-size:9px;letter-spacing:0.5px;">Amount in words</div>
        <div class="b" style="margin-top:2px;">${esc(totalInWords)}</div>
      </div>
      <div class="totals">
        <table>
          <tr><td>Subtotal</td><td class="r">${money(sale.subtotal)}</td></tr>
          ${sale.totalDiscount > 0 ? `<tr><td>Discount</td><td class="r">-${money(sale.totalDiscount)}</td></tr>` : ''}
          ${
            !billOfSupply
              ? intraState
                ? `<tr><td>CGST</td><td class="r">${money(cgstTotal)}</td></tr>
                   <tr><td>SGST</td><td class="r">${money(sgstTotal)}</td></tr>`
                : `<tr><td>IGST</td><td class="r">${money(igstTotal)}</td></tr>`
              : ''
          }
          ${sale.roundOff !== 0 ? `<tr><td>Round-off</td><td class="r">${fix2(sale.roundOff)}</td></tr>` : ''}
          <tr class="grand"><td>GRAND TOTAL</td><td class="r">${money(sale.grandTotal)}</td></tr>
        </table>
      </div>
    </section>

    ${hsnSummaryRows}

    ${eInvoiceBlock}

    ${eWayBillBlock}

    ${warrantyBlock}

    <section class="payments">
      <h3 class="section-h">Payment details</h3>
      <table>
        <thead>
          <tr><th>Mode</th><th>Reference</th><th class="r">Amount</th></tr>
        </thead>
        <tbody>${payments}</tbody>
      </table>
    </section>

    <footer class="bottom">
      <div class="terms">
        <b>Terms &amp; Conditions</b>
        ${
          store?.settings?.invoiceFooter && store.settings.invoiceFooter.trim()
            ? `<div style="margin-top:4px;white-space:pre-wrap;">${esc(store.settings.invoiceFooter)}</div>`
            : `<ol style="margin:4px 0 0 16px;padding:0;">
                 <li>Goods once sold will not be taken back or exchanged unless defective.</li>
                 <li>Warranty claims (if applicable) require this invoice to be produced.</li>
                 <li>All disputes are subject to local jurisdiction.</li>
                 <li>E.&amp;O.E. &mdash; Errors and omissions excepted.</li>
                 ${billOfSupply ? '<li>Supplier is not registered under GST; this is a bill of supply.</li>' : ''}
               </ol>`
        }
      </div>
      <div>
        <div class="sign">For ${esc(store?.name || 'Store')}<br/><span class="muted">Authorised signatory</span></div>
      </div>
    </footer>
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

// ---------- Number to Indian English words (for amount-in-words) -------------
function numberToIndianWords(n: number): string {
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  const rupeeWords = inWords(rupees);
  const paiseWords = paise > 0 ? ' and ' + inWords(paise) + ' Paise' : '';
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}
function inWords(num: number): string {
  if (num === 0) return 'Zero';
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function twoDigit(n: number): string {
    if (n < 20) return a[n];
    return (b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '')).trim();
  }
  function threeDigit(n: number): string {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const p = h ? a[h] + ' Hundred' : '';
    const s = r ? twoDigit(r) : '';
    return [p, s].filter(Boolean).join(' ');
  }
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  return [
    crore ? twoDigit(crore) + ' Crore' : '',
    lakh ? twoDigit(lakh) + ' Lakh' : '',
    thousand ? twoDigit(thousand) + ' Thousand' : '',
    rest ? threeDigit(rest) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

// ---------- iframe-based print (works reliably across browsers) -------------
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

  // Clean up after the print dialog closes or after a safety timeout.
  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };
  const win = iframe.contentWindow;
  if (win) {
    win.onafterprint = cleanup;
    // Safety net: some browsers never fire onafterprint
    setTimeout(cleanup, 30000);
  } else {
    setTimeout(cleanup, 30000);
  }
}

export function printInvoice(sale: Sale, store?: StoreInfo | null, format?: 'auto' | 'thermal' | 'a4') {
  // Top-level try/catch — any malformed sale, broken bundler import, or
  // browser API blip turns into a console.error with rich context instead
  // of an unhandled exception in the React onClick path. The click handler
  // stays clean and the user sees an alert that points at the console.
  try {
    if (!sale) {
      throw new Error('printInvoice called with no sale');
    }
    // Defensive shim — every downstream string-template touches sale.items;
    // if the upstream caller forgot to pass a fully-hydrated sale, we'd
    // otherwise crash on `.map` / `.reduce`. Use a shallow copy so we never
    // try to mutate a potentially-frozen prop, which would throw in strict
    // mode and look like a "print failed" without context.
    const safeSale: Sale = Array.isArray(sale.items)
      ? sale
      : { ...sale, items: [] };
    const chosen = format ?? (safeSale.hasWarranty ? 'a4' : 'thermal');
    const html = chosen === 'a4' ? a4InvoiceHtml(safeSale, store) : thermalInvoiceHtml(safeSale, store);
    const copies = Math.max(1, Math.min(5, Number(store?.settings?.printCopies ?? 1)));
    if (copies <= 1) {
      printHtml(html);
      return;
    }
    // Inline-stamp N copies into a single print document, page-break between
    // each — feels like one job at the printer rather than N popups.
    printHtml(stampMultipleCopies(html, copies));
  } catch (err) {
    // Surface useful detail in BOTH the message string (so it shows in any
    // console UI even when object expansion is collapsed) and a structured
    // second arg (so dev tools can drill in).
    const e = err as { message?: string; stack?: string; name?: string };
    const msg = e?.message || String(err) || 'unknown error';
    const name = e?.name || 'Error';
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error(
        `[print-invoice] ${name}: ${msg} (invoice=${sale?.invoiceNumber || 'n/a'}, format=${format || 'auto'})`,
        { error: err, stack: e?.stack, sale, store },
      );
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(
        `Couldn't print this bill — ${msg}. Invoice: ${sale?.invoiceNumber || '(unknown)'}.`,
      );
    }
  }
}

// Wraps each copy of the invoice body in a div that forces a hard page break.
// We slice the original HTML's <body>…</body> contents to avoid breaking the
// outer document scaffolding (single <html>, <head>, <script>).
function stampMultipleCopies(originalHtml: string, copies: number): string {
  const bodyOpen = originalHtml.indexOf('<body>');
  const bodyClose = originalHtml.lastIndexOf('</body>');
  if (bodyOpen < 0 || bodyClose < 0) return originalHtml;
  const before = originalHtml.slice(0, bodyOpen + '<body>'.length);
  const inner = originalHtml.slice(bodyOpen + '<body>'.length, bodyClose);
  const after = originalHtml.slice(bodyClose);
  // Drop any auto-print <script> from `inner` so it only fires once at the end.
  const innerNoScript = inner.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const labelOf = (i: number) => {
    if (copies === 1) return '';
    if (i === 0) return 'ORIGINAL';
    if (i === copies - 1 && copies > 2) return 'OFFICE COPY';
    return i === 1 ? 'DUPLICATE' : `COPY ${i + 1}`;
  };
  const stamped = Array.from({ length: copies })
    .map((_, i) => {
      const label = labelOf(i);
      const watermark = label
        ? `<div style="text-align:right;font-size:9px;color:#888;letter-spacing:1px;margin:0 8px 4px 0;">${label}</div>`
        : '';
      const breaker = i < copies - 1
        ? '<div style="page-break-after:always;"></div>'
        : '';
      return `<div class="copy-${i}">${watermark}${innerNoScript}${breaker}</div>`;
    })
    .join('');
  // Re-append a single auto-print script after all copies are laid out.
  const printScript = `<script>window.onload=function(){window.focus();window.print();};</script>`;
  return `${before}${stamped}${printScript}${after}`;
}
