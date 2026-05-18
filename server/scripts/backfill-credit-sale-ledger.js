/**
 * One-shot backfill: re-point existing credit-sale ledger entries from
 * the `Sundry Debtors` control account ID to the actual customer's _id.
 *
 *   node server/scripts/backfill-credit-sale-ledger.js [admin-email]
 *
 * Why: the LedgerEngine used to write the credit-sale debit with
 * `accountId = Sundry Debtors._id`. The /customers/:id/ledger view
 * filters by `accountId === customerId`, so the original sale debit
 * never showed up in the per-party ledger — only the offsetting
 * settlement credit did. After settlement the per-party balance went
 * negative because the corresponding positive entry was filed under
 * the control account instead.
 *
 * The engine has been fixed going forward; this script rewrites the
 * historical entries so the per-party ledgers and outstanding balances
 * reconcile.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(envRoot, '.env.local') });
dotenv.config({ path: path.join(envRoot, '.env') });

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import TenantAdmin from '../models/TenantAdmin.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import Account from '../models/Account.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Sale from '../models/Sale.js';

const TARGET_EMAIL = (process.argv[2] || 'admin@example.com').toLowerCase();

await connectDB();

const admin = await TenantAdmin.findOne({ email: TARGET_EMAIL });
const org = await Organization.findById(admin.organizationId);
const store = await Store.findOne({
  organizationId: org._id,
  type: 'store',
  isActive: { $ne: false },
});
const sid = store._id;
console.log(`Backfilling ledger for ${org.name} → ${store.name}`);

// Find the Sundry Debtors control account id for this store.
const sundryDebtors = await Account.findOne({ storeId: sid, name: 'Sundry Debtors' }).lean();
if (!sundryDebtors) {
  console.error('Sundry Debtors account not found — run seed-accounting.js first.');
  process.exit(1);
}
const controlId = String(sundryDebtors._id);
console.log(`Sundry Debtors control account: ${controlId}`);

// Walk every sale-derived debit ledger entry that points at the
// control account. For each, look up the sale and re-point to the
// customer if the sale has one.
const sales = await Sale.find({ storeId: sid })
  .select({ _id: 1, customerId: 1, invoiceNumber: 1 })
  .lean();
const saleById = new Map(sales.map((s) => [String(s._id), s]));
console.log(`scanning ${sales.length} sales`);

const candidates = await LedgerEntry.find({
  storeId: sid,
  referenceType: 'sale',
  entryType: 'debit',
  accountType: 'receivable',
  accountId: sundryDebtors._id,
}).lean();
console.log(`candidate entries on the control account: ${candidates.length}`);

const ops = [];
let withCustomer = 0;
let walkIn = 0;
for (const entry of candidates) {
  const sale = saleById.get(String(entry.referenceId));
  if (!sale) continue;
  if (!sale.customerId) {
    walkIn++;
    continue;
  }
  ops.push({
    updateOne: {
      filter: { _id: entry._id },
      update: { $set: { accountId: sale.customerId } },
    },
  });
  withCustomer++;
}
console.log(`will rewrite ${withCustomer} entries · keep ${walkIn} walk-in (no customer link)`);

if (ops.length > 0) {
  const r = await LedgerEntry.bulkWrite(ops, { ordered: false });
  console.log(`bulkWrite: matched=${r.matchedCount} modified=${r.modifiedCount}`);
}

// =====================================================================
// Opening-balance reconciliation
// =====================================================================
// Some parties (the dual-identity B2B pairs planted by
// seed-party-settlement.js) had their outstandingBalance set directly
// on the customer/supplier doc without a backing ledger entry. When a
// settlement is posted on those, the Cr lands but no Dr offsets it →
// per-party ledger goes negative. Plant a single "Opening balance"
// entry per party so the ledger reconciles to the doc's outstanding.
console.log('\n[opening-balance reconciliation]');

// Mongoose models pulled lazily so this section can be a separate
// pass without re-reading the ones we already have.
const Customer = (await import('../models/Customer.js')).default;
const Supplier = (await import('../models/Supplier.js')).default;

async function planOpeningEntries({ Model, accountType, narrationPrefix, openingDirection }) {
  // openingDirection: 'debit' for receivables (customers owe us),
  //                   'credit' for payables (we owe them).
  //
  // Reconcile EVERY party (not just outstanding > 0) — settled-to-zero
  // parties may have orphan Cr/Dr entries from settlements that need
  // an offsetting opening Dr/Cr to keep the per-party ledger at zero.
  // If outstanding is zero AND there are no entries, nothing to do.
  const parties = await Model.find({ storeId: sid }).lean();
  const inserts = [];
  for (const p of parties) {
    const ledgerSum = await LedgerEntry.aggregate([
      { $match: { storeId: sid, accountId: p._id } },
      {
        $group: {
          _id: null,
          dr: { $sum: { $cond: [{ $eq: ['$entryType', 'debit'] }, '$amount', 0] } },
          cr: { $sum: { $cond: [{ $eq: ['$entryType', 'credit'] }, '$amount', 0] } },
        },
      },
    ]);
    const dr = ledgerSum[0]?.dr || 0;
    const cr = ledgerSum[0]?.cr || 0;
    const expected = Number(p.outstandingBalance) || 0;
    // For receivables (customer): expected = Dr - Cr
    // For payables   (supplier): expected = Cr - Dr
    const actual = openingDirection === 'debit' ? dr - cr : cr - dr;
    const diff = +(expected - actual).toFixed(2);
    // Skip noise (rounding) and parties already in sync.
    if (Math.abs(diff) <= 0.01) continue;
    // diff > 0  → ledger is short on opening side, plant Dr (cust) / Cr (sup)
    // diff < 0  → ledger has excess, plant the OPPOSITE side
    const direction = diff > 0 ? openingDirection : (openingDirection === 'debit' ? 'credit' : 'debit');
    inserts.push({
      storeId: sid,
      entryType: direction,
      accountType,
      accountId: p._id,
      amount: Math.abs(diff),
      referenceType: 'manual',
      narration: `${narrationPrefix} (opening balance reconciliation)`,
      isAutoGenerated: true,
      createdBy: admin._id,
      createdAt: p.createdAt || new Date(),
    });
  }
  if (inserts.length > 0) {
    await LedgerEntry.insertMany(inserts, { ordered: false });
  }
  return inserts.length;
}

const cOpen = await planOpeningEntries({
  Model: Customer,
  accountType: 'receivable',
  narrationPrefix: 'Customer opening receivable',
  openingDirection: 'debit',
});
const sOpen = await planOpeningEntries({
  Model: Supplier,
  accountType: 'payable',
  narrationPrefix: 'Supplier opening payable',
  openingDirection: 'credit',
});
console.log(`  customer opening entries planted: ${cOpen}`);
console.log(`  supplier opening entries planted: ${sOpen}`);

// Sanity check: pick a customer that has settlements + sales and
// recompute their running balance from the (now corrected) ledger.
const sample = await LedgerEntry.aggregate([
  { $match: { storeId: sid, accountType: 'receivable' } },
  { $group: {
      _id: '$accountId',
      dr: { $sum: { $cond: [{ $eq: ['$entryType', 'debit'] }, '$amount', 0] } },
      cr: { $sum: { $cond: [{ $eq: ['$entryType', 'credit'] }, '$amount', 0] } },
      n: { $sum: 1 },
    } },
  { $match: { cr: { $gt: 0 } } }, // customers who had settlements applied
  { $sort: { n: -1 } },
  { $limit: 5 },
]);
console.log('\nspot check — customers with settlement entries:');
for (const row of sample) {
  if (String(row._id) === controlId) continue; // ignore residual control-account entries
  const balance = row.dr - row.cr;
  console.log(`  customer ${row._id}: ${row.n} entries · Dr ₹${row.dr.toFixed(2)} · Cr ₹${row.cr.toFixed(2)} · balance ₹${balance.toFixed(2)} ${balance < 0 ? '⚠ NEGATIVE' : ''}`);
}

await mongoose.disconnect();
process.exit(0);
