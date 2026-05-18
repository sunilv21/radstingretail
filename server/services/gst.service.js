import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Store from '../models/Store.js';
import { AppError } from '../utils/response.js';

/**
 * GST aggregation service. Backs the GSTR-1, GSTR-3B and HSN summary screens.
 * Computes everything on demand from the immutable sales + purchases collections —
 * no caching here so every refresh reflects the current ledger state.
 *
 * GSTR-1 sections produced (per the Offline Utility schema):
 *   4A/4B/4C — B2B (taxable supplies to registered persons)
 *   5A/5B   — B2C Large (>₹2.5L, inter-state, unregistered)
 *   6A      — Exports (with/without payment of IGST)
 *   7       — B2C Small (consolidated, intra-state + small inter-state)
 *   8       — Nil rated / Exempt / Non-GST
 *   9A/9B/9C — Credit / debit notes (registered + unregistered)
 *   12      — HSN summary
 *   13      — Document issued summary (invoice ranges)
 */

const B2C_LARGE_THRESHOLD = 250000;
const round2 = (n) => Math.round(n * 100) / 100;

function toObjId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

// Indian financial year ('YYYY-YY' or 'YYYY-YYYY') → date range.
// FY 2025-26 = 2025-04-01 → 2026-03-31.
function fyToRange(fyStr) {
  const m = String(fyStr || '').match(/^(\d{4})(?:-(\d{2}|\d{4}))?$/);
  if (!m) throw new AppError('VALIDATION_ERROR', 'FY must be YYYY-YY (e.g. 2025-26)', 400);
  const startYear = Number(m[1]);
  const from = new Date(Date.UTC(startYear, 3, 1));
  const to = new Date(Date.UTC(startYear + 1, 3, 1));
  const label = `${startYear}-${String(startYear + 1).slice(2)}`;
  return { startYear, from, to, label };
}

function periodToRange(period) {
  // 'YYYY-MM' → [start, end-of-month) in IST
  const m = String(period || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new AppError('VALIDATION_ERROR', 'period must be YYYY-MM', 400);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new AppError('VALIDATION_ERROR', 'invalid month', 400);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { year, month, from, to };
}

function lineGst(it) {
  return {
    taxable: Number(it.taxableAmount || 0),
    cgst: Number(it.cgst || 0),
    sgst: Number(it.sgst || 0),
    igst: Number(it.igst || 0),
    rate: Number(it.gstRate || 0),
    hsn: it.productSnapshot?.hsnCode || it.hsnCode || '',
    qty: Number(it.quantity || 0),
    unit: it.unit || '',
    total: Number(it.totalAmount || 0),
  };
}

function saleTotals(sale) {
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  for (const it of sale.items || []) {
    const l = lineGst(it);
    taxable += l.taxable; cgst += l.cgst; sgst += l.sgst; igst += l.igst;
  }
  return {
    taxable: round2(taxable),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    totalTax: round2(cgst + sgst + igst),
    grandTotal: Number(sale.grandTotal || 0),
  };
}

function isInterState(sale, store) {
  // Authoritative: explicit placeOfSupply vs store state.
  const pos = String(sale.placeOfSupply || sale.customerSnapshot?.stateCode || '').trim();
  const ss = String(store?.stateCode || '').trim();
  if (pos && ss) return pos !== ss;
  // Legacy fallback for sales saved before placeOfSupply was added: infer
  // from IGST presence on any line.
  for (const it of sale.items || []) {
    if (Number(it.igst || 0) > 0) return true;
  }
  return false;
}

function gstr1BucketFor(sale, isInter, totals, b2cLargeThreshold = B2C_LARGE_THRESHOLD) {
  // Returns one of: 'b2b' | 'b2cl' | 'b2cs' | 'export' | 'cdnr' | 'cdnur' |
  //                 'nil' | 'exempt' | 'sez' | null (skip)
  const t = sale.invoiceType || 'regular';
  if (sale.status === 'returned') {
    return sale.customerSnapshot?.gstNumber ? 'cdnr' : 'cdnur';
  }
  if (t === 'export_with_payment' || t === 'export_without_payment') return 'export';
  if (t === 'sez_with_payment' || t === 'sez_without_payment' || t === 'deemed_export') return 'sez';
  if (t === 'nil_rated' || t === 'exempt' || t === 'non_gst') return t === 'nil_rated' ? 'nil' : t === 'exempt' ? 'exempt' : 'nonGst';
  // Regular taxable
  const gstin = sale.customerSnapshot?.gstNumber?.trim() || '';
  if (gstin) return 'b2b';
  if (isInter && totals.grandTotal > b2cLargeThreshold) return 'b2cl';
  return 'b2cs';
}

export const GSTService = {
  /** High-level monthly summary — what shows up on the GST hub page. */
  async summary({ storeId, period }) {
    const { from, to } = periodToRange(period);
    const [sales, purchases] = await Promise.all([
      Sale.find({ storeId, createdAt: { $gte: from, $lt: to }, status: { $ne: 'voided' } }).lean(),
      Purchase.find({ storeId, createdAt: { $gte: from, $lt: to } }).lean(),
    ]);

    let outTaxable = 0, outCgst = 0, outSgst = 0, outIgst = 0;
    for (const s of sales) {
      const t = saleTotals(s);
      outTaxable += t.taxable; outCgst += t.cgst; outSgst += t.sgst; outIgst += t.igst;
    }
    let inTaxable = 0, inCgst = 0, inSgst = 0, inIgst = 0;
    for (const p of purchases) {
      for (const it of p.items || []) {
        const recv = Number(it.receivedQty || 0);
        if (recv <= 0) continue; // only credit ITC for received goods
        const ratio = recv / Math.max(1, Number(it.orderedQty || recv));
        inTaxable += Number(it.taxableAmount || 0) * ratio;
        inCgst += Number(it.cgst || 0) * ratio;
        inSgst += Number(it.sgst || 0) * ratio;
        inIgst += Number(it.igst || 0) * ratio;
      }
    }
    const outputTax = round2(outCgst + outSgst + outIgst);
    const inputITC = round2(inCgst + inSgst + inIgst);
    return {
      period,
      sales: { count: sales.length, taxableValue: round2(outTaxable), cgst: round2(outCgst), sgst: round2(outSgst), igst: round2(outIgst), totalTax: outputTax },
      purchases: { count: purchases.length, taxableValue: round2(inTaxable), cgst: round2(inCgst), sgst: round2(inSgst), igst: round2(inIgst), totalTax: inputITC },
      netGSTPayable: round2(outputTax - inputITC),
    };
  },

  /** GSTR-1 — full 13-section breakdown of outward supplies. */
  async gstr1({ storeId, period }) {
    const { from, to } = periodToRange(period);
    const store = await Store.findById(storeId).lean();
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
    const b2cLargeThreshold = Number(store.settings?.b2cLargeThreshold ?? B2C_LARGE_THRESHOLD);

    const sales = await Sale.find({
      storeId,
      createdAt: { $gte: from, $lt: to },
      status: { $ne: 'voided' },
    })
      .sort({ createdAt: 1 })
      .lean();

    const b2b = []; // 4A — registered (with GSTIN)
    const b2cLarge = []; // 5A — inter-state, unregistered, > ₹2.5L
    const b2cSmall = new Map(); // 7 — consolidated by (state-rate)
    const exports_ = []; // 6A
    const sezDeemed = []; // 6B/6C — SEZ + deemed exports
    const nilExempt = { nil: 0, exempt: 0, nonGst: 0 };
    const cdnRegistered = []; // 9B — credit/debit notes to registered
    const cdnUnregistered = []; // 9B-UR
    const hsnAgg = new Map();

    let totalInvoices = 0;
    let firstInv = '', lastInv = '';

    for (const s of sales) {
      totalInvoices += 1;
      if (!firstInv) firstInv = s.invoiceNumber;
      lastInv = s.invoiceNumber;

      const totals = saleTotals(s);
      const gstin = s.customerSnapshot?.gstNumber?.trim() || '';
      const interState = isInterState(s, store);
      const bucket = gstr1BucketFor(s, interState, totals, b2cLargeThreshold);

      const baseRow = {
        invoiceNumber: s.invoiceNumber,
        invoiceDate: s.createdAt,
        customerName: s.customerSnapshot?.name || 'Walk-in',
        gstin: gstin || null,
        placeOfSupply: interState ? 'Inter-State' : 'Intra-State',
        invoiceType: s.invoiceType || 'regular',
        stateCode: s.placeOfSupply || s.customerSnapshot?.stateCode || '',
        invoiceValue: totals.grandTotal,
        taxableValue: totals.taxable,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        totalTax: totals.totalTax,
        rate: dominantRate(s),
      };

      if (bucket === 'cdnr') cdnRegistered.push({ ...baseRow, type: 'credit-note' });
      else if (bucket === 'cdnur') cdnUnregistered.push({ ...baseRow, type: 'credit-note' });
      else if (bucket === 'export') exports_.push(baseRow);
      else if (bucket === 'sez') sezDeemed.push(baseRow);
      else if (bucket === 'nil') nilExempt.nil = round2(nilExempt.nil + totals.taxable);
      else if (bucket === 'exempt') nilExempt.exempt = round2(nilExempt.exempt + totals.taxable);
      else if (bucket === 'nonGst') nilExempt.nonGst = round2(nilExempt.nonGst + totals.taxable);
      else if (bucket === 'b2b') b2b.push(baseRow);
      else if (bucket === 'b2cl') b2cLarge.push(baseRow);
      else if (bucket === 'b2cs') {
        const key = `${baseRow.placeOfSupply}|${baseRow.rate}`;
        const buc = b2cSmall.get(key) || {
          placeOfSupply: baseRow.placeOfSupply,
          rate: baseRow.rate,
          taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, count: 0,
        };
        buc.taxableValue = round2(buc.taxableValue + totals.taxable);
        buc.cgst = round2(buc.cgst + totals.cgst);
        buc.sgst = round2(buc.sgst + totals.sgst);
        buc.igst = round2(buc.igst + totals.igst);
        buc.totalTax = round2(buc.totalTax + totals.totalTax);
        buc.count += 1;
        b2cSmall.set(key, buc);
      }

      // HSN summary (section 12)
      for (const it of s.items || []) {
        const l = lineGst(it);
        const hsn = l.hsn || 'UNKNOWN';
        const key = `${hsn}|${l.rate}`;
        const row = hsnAgg.get(key) || {
          hsn, description: it.productSnapshot?.name || '', rate: l.rate,
          uqc: l.unit || 'NOS', quantity: 0, taxableValue: 0,
          cgst: 0, sgst: 0, igst: 0, totalValue: 0,
        };
        row.quantity = round2(row.quantity + l.qty);
        row.taxableValue = round2(row.taxableValue + l.taxable);
        row.cgst = round2(row.cgst + l.cgst);
        row.sgst = round2(row.sgst + l.sgst);
        row.igst = round2(row.igst + l.igst);
        row.totalValue = round2(row.totalValue + l.total);
        hsnAgg.set(key, row);
      }
    }

    const summaryFor = (rows) => rows.reduce(
      (acc, r) => ({
        count: (acc.count || 0) + 1,
        taxableValue: round2((acc.taxableValue || 0) + r.taxableValue),
        cgst: round2((acc.cgst || 0) + r.cgst),
        sgst: round2((acc.sgst || 0) + r.sgst),
        igst: round2((acc.igst || 0) + r.igst),
        totalTax: round2((acc.totalTax || 0) + r.totalTax),
        invoiceValue: round2((acc.invoiceValue || 0) + (r.invoiceValue || 0)),
      }),
      {},
    );

    return {
      period,
      gstin: store.gstNumber,
      sections: {
        '4A_B2B': { rows: b2b, totals: summaryFor(b2b) },
        '5A_B2CL': { rows: b2cLarge, totals: summaryFor(b2cLarge) },
        '6A_Exports': { rows: exports_, totals: summaryFor(exports_) },
        '6B_SEZ': { rows: sezDeemed, totals: summaryFor(sezDeemed) },
        '7_B2CS': { rows: Array.from(b2cSmall.values()), totals: summaryFor(Array.from(b2cSmall.values())) },
        '8_NilExempt': nilExempt,
        '9B_CDNR': { rows: cdnRegistered, totals: summaryFor(cdnRegistered) },
        '9B_CDNUR': { rows: cdnUnregistered, totals: summaryFor(cdnUnregistered) },
        '12_HSN': { rows: Array.from(hsnAgg.values()), totals: summaryFor(Array.from(hsnAgg.values())) },
        '13_Documents': {
          invoices: { from: firstInv, to: lastInv, total: totalInvoices, cancelled: 0 },
        },
      },
    };
  },

  /** GSTR-3B summary — 6 sections per the portal. */
  async gstr3b({ storeId, period }) {
    const { from, to } = periodToRange(period);
    const store = await Store.findById(storeId).lean();
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    const [sales, purchases] = await Promise.all([
      Sale.find({ storeId, createdAt: { $gte: from, $lt: to }, status: { $ne: 'voided' } }).lean(),
      Purchase.find({ storeId, createdAt: { $gte: from, $lt: to } }).lean(),
    ]);

    let outTaxable = 0, outCgst = 0, outSgst = 0, outIgst = 0;
    let interStateUnregB2C = 0;
    for (const s of sales) {
      const t = saleTotals(s);
      outTaxable += t.taxable; outCgst += t.cgst; outSgst += t.sgst; outIgst += t.igst;
      const gstin = s.customerSnapshot?.gstNumber?.trim() || '';
      if (!gstin && isInterState(s, store)) interStateUnregB2C += t.taxable;
    }

    let inTaxable = 0, inCgst = 0, inSgst = 0, inIgst = 0;
    let rcmTaxable = 0, rcmCgst = 0, rcmSgst = 0, rcmIgst = 0;
    for (const p of purchases) {
      const isRcm = !!p.reverseCharge;
      for (const it of p.items || []) {
        const recv = Number(it.receivedQty || 0);
        if (recv <= 0) continue;
        const ratio = recv / Math.max(1, Number(it.orderedQty || recv));
        const tax = Number(it.taxableAmount || 0) * ratio;
        const c = Number(it.cgst || 0) * ratio;
        const s = Number(it.sgst || 0) * ratio;
        const i = Number(it.igst || 0) * ratio;
        if (isRcm) {
          rcmTaxable += tax; rcmCgst += c; rcmSgst += s; rcmIgst += i;
        } else {
          inTaxable += tax; inCgst += c; inSgst += s; inIgst += i;
        }
      }
    }

    return {
      period,
      gstin: store.gstNumber,
      sections: {
        '3.1_OutwardSupplies': {
          taxableSupplies: { taxableValue: round2(outTaxable), cgst: round2(outCgst), sgst: round2(outSgst), igst: round2(outIgst) },
          zeroRated: { taxableValue: 0, igst: 0 },
          nilRated: { taxableValue: 0 },
          exempt: { taxableValue: 0 },
          nonGst: { taxableValue: 0 },
          // 3.1(d) — Inward supplies liable to reverse charge (we pay output GST on these).
          inwardReverseCharge: {
            taxableValue: round2(rcmTaxable),
            cgst: round2(rcmCgst),
            sgst: round2(rcmSgst),
            igst: round2(rcmIgst),
          },
        },
        '3.2_InterStateUnregistered': {
          totalTaxableValueToUnregistered: round2(interStateUnregB2C),
        },
        '4_ITC': {
          eligible: { cgst: round2(inCgst), sgst: round2(inSgst), igst: round2(inIgst), total: round2(inCgst + inSgst + inIgst) },
          // RCM ITC is also claimable since you've paid the GST yourself.
          reverseCharge: { cgst: round2(rcmCgst), sgst: round2(rcmSgst), igst: round2(rcmIgst), total: round2(rcmCgst + rcmSgst + rcmIgst) },
          ineligible: { cgst: 0, sgst: 0, igst: 0 },
          netITC: round2(inCgst + inSgst + inIgst + rcmCgst + rcmSgst + rcmIgst),
        },
        '5_InwardSupplies': {
          fromComposition: 0,
          nilRated: 0,
          nonGst: 0,
        },
        '5.1_InterestLateFee': { interest: 0, lateFee: 0 },
        '6.1_PaymentOfTax': {
          outputTax: round2(outCgst + outSgst + outIgst),
          itcUtilised: round2(inCgst + inSgst + inIgst),
          netPayable: round2((outCgst + outSgst + outIgst) - (inCgst + inSgst + inIgst)),
        },
      },
    };
  },

  /** HSN summary — for GSTR-1 section 12 (or standalone). */
  async hsnSummary({ storeId, period }) {
    const r1 = await GSTService.gstr1({ storeId, period });
    return {
      period,
      rows: r1.sections['12_HSN'].rows,
      totals: r1.sections['12_HSN'].totals,
    };
  },

  /**
   * Export GSTR-1 in the GST Offline Utility v3.2 JSON envelope shape.
   * Real filing flow: download this → upload to the portal's offline tool
   * → tool produces the final JSON → user uploads to gst.gov.in.
   * No GSP needed for this path.
   */
  async exportGstr1Json({ storeId, period }) {
    const r1 = await GSTService.gstr1({ storeId, period });
    const fp = String(period).replace('-', '').slice(2); // YYYY-MM → MMYYYY
    const monthYear = `${period.slice(5, 7)}${period.slice(0, 4)}`;

    const b2b = groupByGstin(r1.sections['4A_B2B'].rows);
    const b2cl = r1.sections['5A_BC2L']?.rows || r1.sections['5A_B2CL'].rows;
    const b2cs = r1.sections['7_B2CS'].rows.map((r) => ({
      sply_ty: r.placeOfSupply === 'Inter-State' ? 'INTER' : 'INTRA',
      rt: r.rate,
      typ: 'OE',
      txval: r.taxableValue,
      iamt: r.igst,
      camt: r.cgst,
      samt: r.sgst,
      csamt: 0,
    }));
    const hsn = r1.sections['12_HSN'].rows.map((r, i) => ({
      num: i + 1,
      hsn_sc: r.hsn,
      desc: r.description,
      uqc: r.uqc,
      qty: r.quantity,
      rt: r.rate,
      txval: r.taxableValue,
      iamt: r.igst,
      camt: r.cgst,
      samt: r.sgst,
      csamt: 0,
    }));

    return {
      gstin: r1.gstin,
      fp: monthYear,
      gt: 0,
      cur_gt: 0,
      version: 'GST3.2',
      hash: 'hash',
      b2b,
      b2cl,
      b2cs,
      hsn: { data: hsn },
    };
  },

  /**
   * GSTR-9 Annual return — full FY consolidation per the official form.
   * Sections covered:
   *   Part II   Section 4: Taxable outward supplies (B2B, B2C, Exports w/payment, SEZ, RCM-inward, CN/DN)
   *   Part II   Section 5: Non-taxable outward (Exports w/o payment, Exempt, Nil-rated, Non-GST)
   *   Part III  Section 6: ITC availed (regular inputs, RCM, imports)
   *   Part III  Section 7: ITC reversed (purchase returns)
   *   Part IV   Section 9: Tax paid (output tax, ITC offset, net cash)
   * Also returns a 12-row monthly breakdown for transparency.
   */
  async gstr9({ storeId, financialYear }) {
    const fy = fyToRange(financialYear);
    const store = await Store.findById(storeId).lean();
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    const [sales, purchases] = await Promise.all([
      Sale.find({ storeId, createdAt: { $gte: fy.from, $lt: fy.to } }).lean(),
      Purchase.find({ storeId, createdAt: { $gte: fy.from, $lt: fy.to } }).lean(),
    ]);

    // Outward bucketing per the GSTR-9 schedule
    const out = {
      b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, count: 0 },
      b2c: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, count: 0 },
      exportWithPayment: { taxable: 0, igst: 0, count: 0 },
      exportWithoutPayment: { taxable: 0, count: 0 },
      sezWithPayment: { taxable: 0, igst: 0, count: 0 },
      sezWithoutPayment: { taxable: 0, count: 0 },
      deemedExport: { taxable: 0, igst: 0, count: 0 },
      nilRated: { taxable: 0, count: 0 },
      exempt: { taxable: 0, count: 0 },
      nonGst: { taxable: 0, count: 0 },
      creditNotes: { taxable: 0, cgst: 0, sgst: 0, igst: 0, count: 0 },
      debitNotes: { taxable: 0, cgst: 0, sgst: 0, igst: 0, count: 0 },
    };

    for (const s of sales) {
      if (s.status === 'voided') continue;
      const t = saleTotals(s);
      const gstin = s.customerSnapshot?.gstNumber?.trim() || '';
      const itype = s.invoiceType || 'regular';

      if (s.status === 'returned') {
        out.creditNotes.taxable += t.taxable;
        out.creditNotes.cgst += t.cgst;
        out.creditNotes.sgst += t.sgst;
        out.creditNotes.igst += t.igst;
        out.creditNotes.count += 1;
        continue;
      }
      if (itype === 'export_with_payment') {
        out.exportWithPayment.taxable += t.taxable;
        out.exportWithPayment.igst += t.igst;
        out.exportWithPayment.count += 1;
      } else if (itype === 'export_without_payment') {
        out.exportWithoutPayment.taxable += t.taxable;
        out.exportWithoutPayment.count += 1;
      } else if (itype === 'sez_with_payment') {
        out.sezWithPayment.taxable += t.taxable;
        out.sezWithPayment.igst += t.igst;
        out.sezWithPayment.count += 1;
      } else if (itype === 'sez_without_payment') {
        out.sezWithoutPayment.taxable += t.taxable;
        out.sezWithoutPayment.count += 1;
      } else if (itype === 'deemed_export') {
        out.deemedExport.taxable += t.taxable;
        out.deemedExport.igst += t.igst;
        out.deemedExport.count += 1;
      } else if (itype === 'nil_rated') {
        out.nilRated.taxable += t.taxable;
        out.nilRated.count += 1;
      } else if (itype === 'exempt') {
        out.exempt.taxable += t.taxable;
        out.exempt.count += 1;
      } else if (itype === 'non_gst') {
        out.nonGst.taxable += t.taxable;
        out.nonGst.count += 1;
      } else if (gstin) {
        out.b2b.taxable += t.taxable;
        out.b2b.cgst += t.cgst;
        out.b2b.sgst += t.sgst;
        out.b2b.igst += t.igst;
        out.b2b.count += 1;
      } else {
        out.b2c.taxable += t.taxable;
        out.b2c.cgst += t.cgst;
        out.b2c.sgst += t.sgst;
        out.b2c.igst += t.igst;
        out.b2c.count += 1;
      }
    }

    // ITC bucketing
    const itcRegular = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    const itcRcm = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    const itcImports = { taxable: 0, igst: 0 };
    const itcReversed = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };

    for (const p of purchases) {
      const isReturn = p.status === 'returned';
      const isRcm = !!p.reverseCharge;
      const isImport = ['import_of_goods', 'import_of_services'].includes(p.invoiceType);

      for (const it of p.items || []) {
        const recv = Number(it.receivedQty || 0);
        if (recv <= 0 && !isReturn) continue;
        const ratio = isReturn
          ? 1
          : recv / Math.max(1, Number(it.orderedQty || recv));
        const tax = Number(it.taxableAmount || 0) * ratio;
        const c = Number(it.cgst || 0) * ratio;
        const s = Number(it.sgst || 0) * ratio;
        const i = Number(it.igst || 0) * ratio;

        if (isReturn) {
          itcReversed.taxable += tax;
          itcReversed.cgst += c;
          itcReversed.sgst += s;
          itcReversed.igst += i;
        } else if (isImport) {
          itcImports.taxable += tax;
          itcImports.igst += i;
        } else if (isRcm) {
          itcRcm.taxable += tax;
          itcRcm.cgst += c;
          itcRcm.sgst += s;
          itcRcm.igst += i;
        } else {
          itcRegular.taxable += tax;
          itcRegular.cgst += c;
          itcRegular.sgst += s;
          itcRegular.igst += i;
        }
      }
    }

    // Round all bucket numbers
    for (const obj of [out.b2b, out.b2c, out.creditNotes, out.debitNotes, itcRegular, itcRcm, itcReversed]) {
      for (const k of Object.keys(obj)) obj[k] = round2(obj[k]);
    }
    for (const obj of [out.exportWithPayment, out.exportWithoutPayment, out.sezWithPayment, out.sezWithoutPayment, out.deemedExport, out.nilRated, out.exempt, out.nonGst, itcImports]) {
      for (const k of Object.keys(obj)) obj[k] = round2(obj[k]);
    }

    // Section 9 — Tax paid roll-up by head, after ITC offset.
    const totalOutputCgst = out.b2b.cgst + out.b2c.cgst - out.creditNotes.cgst;
    const totalOutputSgst = out.b2b.sgst + out.b2c.sgst - out.creditNotes.sgst;
    const totalOutputIgst = out.b2b.igst + out.b2c.igst + out.exportWithPayment.igst + out.sezWithPayment.igst + out.deemedExport.igst - out.creditNotes.igst;
    // RCM inward acts as outward liability — we pay GST on these.
    const rcmOutCgst = itcRcm.cgst;
    const rcmOutSgst = itcRcm.sgst;
    const rcmOutIgst = itcRcm.igst;

    const totalItcCgst = itcRegular.cgst + itcRcm.cgst - itcReversed.cgst;
    const totalItcSgst = itcRegular.sgst + itcRcm.sgst - itcReversed.sgst;
    const totalItcIgst = itcRegular.igst + itcRcm.igst + itcImports.igst - itcReversed.igst;

    const offset = (output, itc) => {
      const used = Math.min(output, itc);
      return { paidViaItc: round2(used), paidInCash: round2(Math.max(0, output - itc)) };
    };
    const cgstPay = offset(totalOutputCgst + rcmOutCgst, totalItcCgst);
    const sgstPay = offset(totalOutputSgst + rcmOutSgst, totalItcSgst);
    const igstPay = offset(totalOutputIgst + rcmOutIgst, totalItcIgst);

    // Monthly breakdown — 12 rows of (period, taxable, output, ITC, net cash)
    const monthly = [];
    for (let i = 0; i < 12; i++) {
      const monthIdx = (3 + i) % 12;
      const yearOffset = i < 9 ? 0 : 1;
      const ms = new Date(Date.UTC(fy.startYear + yearOffset, monthIdx, 1));
      const me = new Date(Date.UTC(fy.startYear + yearOffset, monthIdx + 1, 1));
      let mTaxable = 0, mOutTax = 0, mItc = 0;
      for (const s of sales) {
        if (s.status === 'voided') continue;
        const d = new Date(s.createdAt);
        if (d < ms || d >= me) continue;
        const t = saleTotals(s);
        const sign = s.status === 'returned' ? -1 : 1;
        mTaxable += sign * t.taxable;
        mOutTax += sign * t.totalTax;
      }
      for (const p of purchases) {
        const d = new Date(p.createdAt);
        if (d < ms || d >= me) continue;
        const sign = p.status === 'returned' ? -1 : 1;
        for (const it of p.items || []) {
          const recv = Number(it.receivedQty || 0);
          if (recv <= 0 && p.status !== 'returned') continue;
          const ratio = p.status === 'returned' ? 1 : recv / Math.max(1, Number(it.orderedQty || recv));
          mItc += sign * (Number(it.cgst || 0) + Number(it.sgst || 0) + Number(it.igst || 0)) * ratio;
        }
      }
      monthly.push({
        period: `${fy.startYear + yearOffset}-${String(monthIdx + 1).padStart(2, '0')}`,
        monthLabel: ms.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        taxableValue: round2(mTaxable),
        outputTax: round2(mOutTax),
        itc: round2(mItc),
        netPayable: round2(mOutTax - mItc),
      });
    }

    return {
      financialYear: fy.label,
      gstin: store.gstNumber,
      legalName: store.name,
      partII: {
        section4_taxableOutward: {
          A_b2c: out.b2c,
          B_b2b: out.b2b,
          C_exportWithPayment: out.exportWithPayment,
          D_sezWithPayment: out.sezWithPayment,
          E_deemedExport: out.deemedExport,
          G_inwardRcm: itcRcm, // RCM appears as outward liability AND inward ITC
          I_creditNotes: out.creditNotes,
          J_debitNotes: out.debitNotes,
        },
        section5_nonTaxable: {
          A_exportWithoutPayment: out.exportWithoutPayment,
          B_sezWithoutPayment: out.sezWithoutPayment,
          D_exempt: out.exempt,
          E_nilRated: out.nilRated,
          F_nonGst: out.nonGst,
        },
      },
      partIII: {
        section6_itcAvailed: {
          B_inputs: itcRegular,
          CD_rcm: itcRcm,
          E_imports: itcImports,
          totalItc: round2(itcRegular.cgst + itcRegular.sgst + itcRegular.igst + itcRcm.cgst + itcRcm.sgst + itcRcm.igst + itcImports.igst),
        },
        section7_itcReversed: {
          purchaseReturns: itcReversed,
          totalReversed: round2(itcReversed.cgst + itcReversed.sgst + itcReversed.igst),
        },
        netItc: round2(
          itcRegular.cgst + itcRegular.sgst + itcRegular.igst +
          itcRcm.cgst + itcRcm.sgst + itcRcm.igst +
          itcImports.igst -
          itcReversed.cgst - itcReversed.sgst - itcReversed.igst,
        ),
      },
      partIV: {
        section9_taxPaid: {
          integratedTax: { payable: round2(totalOutputIgst + rcmOutIgst), ...igstPay },
          centralTax: { payable: round2(totalOutputCgst + rcmOutCgst), ...cgstPay },
          stateTax: { payable: round2(totalOutputSgst + rcmOutSgst), ...sgstPay },
          totalPayable: round2(totalOutputCgst + totalOutputSgst + totalOutputIgst + rcmOutCgst + rcmOutSgst + rcmOutIgst),
          totalCash: round2(cgstPay.paidInCash + sgstPay.paidInCash + igstPay.paidInCash),
          totalItcUsed: round2(cgstPay.paidViaItc + sgstPay.paidViaItc + igstPay.paidViaItc),
        },
      },
      monthly,
    };
  },

  /**
   * Reconcile uploaded GSTR-2A JSON against our purchases for the same period.
   * Returns four buckets: matched, mismatched, only-in-2A, only-in-our-books.
   */
  async reconcileGstr2a({ storeId, period, payload }) {
    const parsed = parseGstr2aPayload(payload);
    const ours = await ourReceivedPurchases({ storeId, period });

    // Mutable copy — items are removed as they get matched.
    const remaining = ours.map((p) => ({ ...p }));
    const matched = [];
    const mismatched = [];
    const onlyIn2A = [];

    for (const sup of parsed.invoices) {
      // Exact-amount match first (best case)
      let idx = remaining.findIndex(
        (o) =>
          o.supplierGstin && o.supplierGstin === sup.supplierGstin &&
          Math.abs(o.total - sup.invoiceValue) < RECON_TOLERANCE,
      );
      if (idx >= 0) {
        matched.push({
          supplierInvoice: sup,
          ourPurchase: remaining[idx],
          taxDifference: round2(sup.totalTax - remaining[idx].totalTax),
        });
        remaining.splice(idx, 1);
        continue;
      }
      // Same GSTIN but value differs → mismatched
      idx = remaining.findIndex((o) => o.supplierGstin && o.supplierGstin === sup.supplierGstin);
      if (idx >= 0) {
        mismatched.push({
          supplierInvoice: sup,
          ourPurchase: remaining[idx],
          valueDifference: round2(sup.invoiceValue - remaining[idx].total),
          taxDifference: round2(sup.totalTax - remaining[idx].totalTax),
        });
        remaining.splice(idx, 1);
        continue;
      }
      // Supplier not in our books at all
      onlyIn2A.push(sup);
    }

    const onlyInOurs = remaining;

    const sumTax = (arr, k) => round2(arr.reduce((s, x) => s + (k(x) || 0), 0));
    const itc2A = sumTax(parsed.invoices, (i) => i.totalTax);
    const itcOurs = sumTax(ours, (p) => p.totalTax);

    return {
      period,
      uploaded: { gstin: parsed.gstin, period: parsed.period, count: parsed.invoices.length },
      summary: {
        total2A: parsed.invoices.length,
        totalOurs: ours.length,
        matched: matched.length,
        mismatched: mismatched.length,
        onlyIn2A: onlyIn2A.length,
        onlyInOurs: onlyInOurs.length,
        itc2A,
        itcOurs,
        itcDifference: round2(itcOurs - itc2A),
      },
      matched,
      mismatched,
      onlyIn2A,
      onlyInOurs,
    };
  },
};

// =============================================================
// GSTR-2A Reconciliation
// =============================================================
//
// Flow: merchant downloads GSTR-2A JSON from gst.gov.in (free, manual),
// uploads it here. We parse the b2b array (supplier-side invoices that the
// government has on record) and compare against our Purchase collection.
//
// Three outcomes per invoice:
//  - Matched: same supplier GSTIN, invoice value within ₹1 tolerance
//  - Mismatched: same GSTIN, different invoice value
//  - Only in 2A: supplier filed but we have no record (missed bill or wrong vendor)
//  - Only in our books: we recorded but supplier hasn't filed yet (ITC not claimable)
//
// Limitation: we don't yet capture supplier-invoice-number on the GRN (planned
// in a later slice), so matching falls back to GSTIN + total-value pairing.
// =============================================================

const RECON_TOLERANCE = 1.0; // ₹1 — covers paise rounding

function parseDdMmYyyy(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

export function parseGstr2aPayload(input) {
  if (!input) throw new AppError('VALIDATION_ERROR', 'Empty 2A payload', 400);
  // Accept either the raw envelope { gstin, fp, b2b: [...] } or the
  // wrapped { data: {...} } that the offline utility sometimes emits.
  const root = input.b2b ? input : input.data || input;
  const b2b = Array.isArray(root.b2b) ? root.b2b : [];
  if (!b2b.length) {
    throw new AppError(
      'GSTR2A_EMPTY',
      'No b2b invoices found in this file. Make sure you uploaded the GSTR-2A JSON, not GSTR-1 or some other return.',
      400,
    );
  }

  const flat = [];
  for (const supplier of b2b) {
    const ctin = String(supplier.ctin || '').toUpperCase();
    for (const inv of supplier.inv || []) {
      let txval = 0, cgst = 0, sgst = 0, igst = 0, cess = 0;
      for (const item of inv.itms || []) {
        const d = item.itm_det || {};
        txval += Number(d.txval || 0);
        cgst += Number(d.camt || 0);
        sgst += Number(d.samt || 0);
        igst += Number(d.iamt || 0);
        cess += Number(d.csamt || 0);
      }
      flat.push({
        supplierGstin: ctin,
        invoiceNumber: String(inv.inum || ''),
        invoiceDate: parseDdMmYyyy(inv.idt),
        invoiceValue: Number(inv.val || 0),
        placeOfSupply: inv.pos || '',
        reverseCharge: String(inv.rchrg || '').toUpperCase() === 'Y',
        invoiceType: inv.inv_typ || 'R',
        taxableValue: round2(txval),
        cgst: round2(cgst),
        sgst: round2(sgst),
        igst: round2(igst),
        cess: round2(cess),
        totalTax: round2(cgst + sgst + igst + cess),
      });
    }
  }
  return {
    gstin: root.gstin || '',
    period: root.fp ? `${String(root.fp).slice(2)}-${String(root.fp).slice(0, 2)}` : '',
    invoices: flat,
  };
}

async function ourReceivedPurchases({ storeId, period }) {
  const { from, to } = periodToRange(period);
  const purchases = await Purchase.find({
    storeId,
    createdAt: { $gte: from, $lt: to },
    status: { $in: ['received', 'partial', 'closed'] },
  }).lean();

  return purchases.map((p) => {
    let taxable = 0, cgst = 0, sgst = 0, igst = 0, total = 0;
    for (const it of p.items || []) {
      const recv = Number(it.receivedQty || 0);
      if (recv <= 0) continue;
      const ratio = recv / Math.max(1, Number(it.orderedQty || recv));
      taxable += Number(it.taxableAmount || 0) * ratio;
      cgst += Number(it.cgst || 0) * ratio;
      sgst += Number(it.sgst || 0) * ratio;
      igst += Number(it.igst || 0) * ratio;
      total += Number(it.totalAmount || 0) * ratio;
    }
    return {
      _id: p._id,
      poNumber: p.poNumber,
      supplierId: p.supplierId,
      supplierGstin: (p.supplierSnapshot?.gstNumber || '').toUpperCase(),
      supplierName: p.supplierSnapshot?.name || '',
      poDate: p.createdAt,
      reverseCharge: !!p.reverseCharge,
      taxableValue: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2(igst),
      total: round2(total),
      totalTax: round2(cgst + sgst + igst),
    };
  });
}

function dominantRate(sale) {
  // Pick the GST rate that covers most of the invoice value — used for B2C-Small bucketing.
  const tally = new Map();
  for (const it of sale.items || []) {
    const r = Number(it.gstRate || 0);
    tally.set(r, (tally.get(r) || 0) + Number(it.taxableAmount || 0));
  }
  let best = 0, bestVal = -1;
  for (const [r, v] of tally) if (v > bestVal) { best = r; bestVal = v; }
  return best;
}

function groupByGstin(rows) {
  const byGstin = new Map();
  for (const r of rows) {
    const g = r.gstin || 'UNKNOWN';
    const bucket = byGstin.get(g) || { ctin: g, inv: [] };
    bucket.inv.push({
      inum: r.invoiceNumber,
      idt: new Date(r.invoiceDate).toLocaleDateString('en-GB').replace(/\//g, '-'),
      val: r.invoiceValue,
      pos: r.placeOfSupply === 'Inter-State' ? '99' : '07',
      rchrg: 'N',
      inv_typ: 'R',
      itms: [
        {
          num: 1,
          itm_det: {
            txval: r.taxableValue,
            rt: r.rate,
            camt: r.cgst,
            samt: r.sgst,
            iamt: r.igst,
            csamt: 0,
          },
        },
      ],
    });
    byGstin.set(g, bucket);
  }
  return Array.from(byGstin.values());
}
