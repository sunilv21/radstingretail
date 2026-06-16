/**
 * Nightly data-integrity scanner (roadmap §25).
 *
 * READ-ONLY. Verifies the correctness invariants the whole platform rests on,
 * across every tenant, and exits non-zero if anything is off — so it can run
 * as a nightly cron / CI gate and page someone before a customer notices.
 *
 * Checks per store:
 *   1. Ledger totals      — Σ debits == Σ credits.
 *   2. Per-voucher balance — every (referenceType, referenceId) group balances
 *                            (catches a single bad posting even if the store
 *                            total nets out by coincidence).
 *   3. Sales → ledger      — every completed sale has ledger entries.
 *   4. Stock vs movements  — product.stock == newStock of its latest movement.
 *   5. Purchases → stock    — received POs have matching 'in' stock movements.
 *
 * Usage:
 *   node server/scripts/integrity-scan.js                 # all stores
 *   node server/scripts/integrity-scan.js --store <id>    # one store
 *   node server/scripts/integrity-scan.js --json          # machine-readable
 *   node server/scripts/integrity-scan.js --limit 50      # cap examples shown
 *
 * Exit code: 0 = clean, 1 = issues found, 2 = bad usage / connection error.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import Store from '../models/Store.js';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';
import LedgerEntry from '../models/LedgerEntry.js';
import StockMovement from '../models/StockMovement.js';

function flag(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const ONE_STORE = flag('--store');
const AS_JSON = process.argv.includes('--json');
const EXAMPLE_LIMIT = Number(flag('--limit') || 20);
const EPS = 0.01;

if (ONE_STORE && !mongoose.isValidObjectId(ONE_STORE)) {
  console.error(`--store "${ONE_STORE}" is not a valid ObjectId`);
  process.exit(2);
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Accumulates findings for one store. */
function makeReport(store) {
  return {
    storeId: String(store._id),
    storeName: store.name,
    issues: [],
    add(check, detail, examples = []) {
      this.issues.push({ check, detail, examples: examples.slice(0, EXAMPLE_LIMIT) });
    },
  };
}

// ---- Check 1: ledger totals balance --------------------------------------
async function checkLedgerTotals(storeId, report) {
  const rows = await LedgerEntry.aggregate([
    { $match: { storeId } },
    { $group: { _id: '$entryType', total: { $sum: '$amount' } } },
  ]);
  const debit = round2(rows.find((r) => r._id === 'debit')?.total || 0);
  const credit = round2(rows.find((r) => r._id === 'credit')?.total || 0);
  if (Math.abs(debit - credit) > EPS) {
    report.add('ledger_totals', `Σ debits ₹${debit} ≠ Σ credits ₹${credit} (diff ₹${round2(debit - credit)})`);
  }
}

// ---- Check 2: every voucher (reference group) balances -------------------
async function checkVoucherBalance(storeId, report) {
  const bad = await LedgerEntry.aggregate([
    { $match: { storeId, referenceId: { $ne: null } } },
    {
      $group: {
        _id: { ref: '$referenceId', type: '$referenceType' },
        debit: { $sum: { $cond: [{ $eq: ['$entryType', 'debit'] }, '$amount', 0] } },
        credit: { $sum: { $cond: [{ $eq: ['$entryType', 'credit'] }, '$amount', 0] } },
      },
    },
    { $project: { debit: 1, credit: 1, diff: { $abs: { $subtract: ['$debit', '$credit'] } } } },
    { $match: { diff: { $gt: EPS } } },
    { $limit: 200 },
  ]);
  if (bad.length) {
    report.add(
      'voucher_balance',
      `${bad.length} reference group(s) where debits ≠ credits`,
      bad.map((b) => `${b._id.type}:${b._id.ref} Dr ${round2(b.debit)} / Cr ${round2(b.credit)}`),
    );
  }
}

// ---- Check 3: completed sales have ledger entries ------------------------
async function checkSalesHaveLedger(storeId, report) {
  const saleIds = await Sale.find({ storeId, status: 'completed' }).distinct('_id');
  if (!saleIds.length) return;
  const withLedger = new Set(
    (await LedgerEntry.find({ storeId, referenceType: 'sale' }).distinct('referenceId')).map(String),
  );
  const missing = saleIds.filter((id) => !withLedger.has(String(id)));
  if (missing.length) {
    report.add(
      'sales_missing_ledger',
      `${missing.length} completed sale(s) with no ledger entries`,
      missing.map(String),
    );
  }
}

// ---- Check 4: product stock matches its latest movement ------------------
async function checkStockVsMovements(storeId, report) {
  const latest = await StockMovement.aggregate([
    { $match: { storeId } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$productId', newStock: { $first: '$newStock' } } },
  ]);
  const latestByProduct = new Map(latest.map((m) => [String(m._id), m.newStock]));
  const products = await Product.find({ storeId }).select({ name: 1, sku: 1, stock: 1 }).lean();
  const mismatches = [];
  for (const p of products) {
    const last = latestByProduct.get(String(p._id));
    // No movement at all → opening stock set directly; only flag if non-zero
    // AND we'd expect movements. We treat "has movements but newStock != stock"
    // as the real corruption signal.
    if (last === undefined) continue;
    if (typeof last === 'number' && round2(last) !== round2(p.stock)) {
      mismatches.push(`${p.name} [${p.sku}] stock=${p.stock} but last movement newStock=${last}`);
    }
  }
  if (mismatches.length) {
    report.add('stock_vs_movements', `${mismatches.length} product(s) where stock ≠ latest movement`, mismatches);
  }
}

// ---- Check 5: received purchases have 'in' stock movements ---------------
async function checkPurchasesHaveStock(storeId, report) {
  const receivedPos = await Purchase.find({
    storeId,
    status: { $in: ['received', 'partial', 'closed'] },
  })
    .select({ poNumber: 1 })
    .lean();
  if (!receivedPos.length) return;
  const withStockIn = new Set(
    (
      await StockMovement.find({ storeId, type: 'in', referenceType: 'purchase' }).distinct('referenceId')
    ).map(String),
  );
  const missing = receivedPos.filter((po) => !withStockIn.has(String(po._id)));
  if (missing.length) {
    report.add(
      'purchases_missing_stock',
      `${missing.length} received PO(s) with no stock-in movement`,
      missing.map((po) => po.poNumber || String(po._id)),
    );
  }
}

async function scanStore(store) {
  const report = makeReport(store);
  const storeId = store._id;
  await checkLedgerTotals(storeId, report);
  await checkVoucherBalance(storeId, report);
  await checkSalesHaveLedger(storeId, report);
  await checkStockVsMovements(storeId, report);
  await checkPurchasesHaveStock(storeId, report);
  return report;
}

// ---- Run -----------------------------------------------------------------
await connectDB();

const stores = ONE_STORE
  ? await Store.find({ _id: ONE_STORE })
  : await Store.find({}).select({ name: 1 });

const reports = [];
for (const store of stores) {
  reports.push(await scanStore(store));
}

const storesWithIssues = reports.filter((r) => r.issues.length > 0);
const totalIssues = storesWithIssues.reduce((s, r) => s + r.issues.length, 0);

if (AS_JSON) {
  console.log(JSON.stringify({ scannedAt: new Date().toISOString(), stores: reports.length, totalIssues, storesWithIssues }, null, 2));
} else {
  console.log(`\nIntegrity scan — ${reports.length} store(s) checked\n${'='.repeat(48)}`);
  if (totalIssues === 0) {
    console.log('✓ All checks passed — ledger balanced, stock consistent, no orphaned documents.');
  } else {
    for (const r of storesWithIssues) {
      console.log(`\n✗ ${r.storeName} (${r.storeId}) — ${r.issues.length} issue(s):`);
      for (const issue of r.issues) {
        console.log(`  • [${issue.check}] ${issue.detail}`);
        for (const ex of issue.examples) console.log(`      - ${ex}`);
        if (issue.examples.length === EXAMPLE_LIMIT) console.log('      … (truncated)');
      }
    }
    console.log(`\n${totalIssues} issue(s) across ${storesWithIssues.length} store(s).`);
  }
}

await mongoose.disconnect();
process.exit(totalIssues === 0 ? 0 : 1);
