/**
 * Backfill outstanding balances + plant dual-identity B2B parties so
 * the Party Settlement page (Dashboard → Party Settlement) has real
 * candidates to net off.
 *
 *   node server/scripts/seed-party-settlement.js [admin-email]
 *
 * The page works like this:
 *
 *   1. Lists customers with outstandingBalance > 0  (we are owed money)
 *   2. Lists suppliers with outstandingBalance > 0  (we owe money)
 *   3. Matches a customer ↔ supplier pair by GSTIN (preferred) or phone
 *      — the same legal entity acts as both for many B2B accounts.
 *   4. Suggests a settlement = min(receivable, payable). Vendor confirms
 *      → posts a contra voucher: Dr Sundry Creditors, Cr Sundry Debtors,
 *      and decrements both party balances atomically.
 *
 * After this seed:
 *   - Existing credit sales bump customer.outstandingBalance.
 *   - Existing unpaid / partial POs bump supplier.outstandingBalance.
 *   - 8 brand-new "B2B partner" pairs (same GSTIN + phone on customer
 *     AND supplier rows) are inserted with mock outstanding on both
 *     sides — the matched-candidates list is guaranteed populated.
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
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';

const TARGET_EMAIL = (process.argv[2] || 'admin@example.com').toLowerCase();
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

function gstinFor(stateCode) {
  const letters = () =>
    Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[rand(24)]).join('');
  const digits = () =>
    Array.from({ length: 4 }, () => '0123456789'[rand(10)]).join('');
  return `${stateCode}${letters()}${digits()}A1Z${'0123456789'[rand(10)]}`;
}
function phone() {
  return ['98', '99', '97', '96'][rand(4)] +
    Array.from({ length: 8 }, () => rand(10)).join('');
}

await connectDB();

const admin = await TenantAdmin.findOne({ email: TARGET_EMAIL });
const org = await Organization.findById(admin.organizationId);
const store = await Store.findOne({
  organizationId: org._id,
  type: 'store',
  isActive: { $ne: false },
});
const sid = store._id;
console.log(`Seeding party-settlement data into ${org.name} → ${store.name}`);

// ===================================================================
// 1. Backfill customer.outstandingBalance from existing credit sales
// ===================================================================
console.log('\n[1/3] customer outstanding from credit sales …');
const creditSales = await Sale.aggregate([
  { $match: { storeId: sid, paymentStatus: 'credit', status: 'completed' } },
  { $group: { _id: '$customerId', owed: { $sum: '$grandTotal' } } },
]);
let custBumped = 0;
const custOps = [];
for (const row of creditSales) {
  if (!row._id) continue; // walk-in credit sales have no customer record
  custOps.push({
    updateOne: {
      filter: { _id: row._id, storeId: sid },
      update: { $set: { outstandingBalance: +row.owed.toFixed(2) } },
    },
  });
  custBumped++;
}
if (custOps.length > 0) await Customer.bulkWrite(custOps, { ordered: false });
console.log(`  set outstanding on ${custBumped} customers from credit sales`);

// ===================================================================
// 2. Backfill supplier.outstandingBalance from unpaid/partial POs
// ===================================================================
console.log('\n[2/3] supplier outstanding from unpaid POs …');
const unpaidPOs = await Purchase.aggregate([
  {
    $match: {
      storeId: sid,
      status: { $in: ['received', 'partial', 'closed'] },
      paymentStatus: { $in: ['unpaid', 'partial'] },
    },
  },
  {
    $group: {
      _id: '$supplierId',
      owed: { $sum: { $subtract: ['$grandTotal', { $ifNull: ['$amountPaid', 0] }] } },
    },
  },
]);
let supBumped = 0;
const supOps = [];
for (const row of unpaidPOs) {
  if (!row._id) continue;
  supOps.push({
    updateOne: {
      filter: { _id: row._id, storeId: sid },
      update: { $set: { outstandingBalance: +row.owed.toFixed(2) } },
    },
  });
  supBumped++;
}
if (supOps.length > 0) await Supplier.bulkWrite(supOps, { ordered: false });
console.log(`  set outstanding on ${supBumped} suppliers from unpaid POs`);

// ===================================================================
// 3. Plant 8 dual-identity B2B partners (Customer + Supplier rows
//    sharing GSTIN + phone, both with outstanding balances).
//    These are the parties that the Settlement page will match up
//    and offer to net off.
// ===================================================================
console.log('\n[3/3] dual-identity B2B partners …');

const PARTNERS = [
  { name: 'Bharat Wholesale Co.', stateCode: '27' },
  { name: 'Mahalaxmi Traders', stateCode: '07' },
  { name: 'Shree Krishna Distributors', stateCode: '29' },
  { name: 'Sai Industries', stateCode: '33' },
  { name: 'Hindustan Marketing', stateCode: '24' },
  { name: 'New Delhi Sales Corp.', stateCode: '07' },
  { name: 'Punjab Brothers', stateCode: '03' },
  { name: 'Royal Enterprises', stateCode: '23' },
];

let plantedCount = 0;
for (const p of PARTNERS) {
  const gstin = gstinFor(p.stateCode);
  const ph = phone();
  // Receivable = we sold them stock on credit; Payable = we bought
  // raw stock from them. Realistic numbers — vary so the suggested
  // settlements aren't all identical.
  const receivable = pick([12500, 28750, 45000, 65000, 92000, 125000]);
  const payable = pick([18000, 35000, 52500, 78000, 110000, 95000]);

  // Skip if a customer with this GSTIN already exists (idempotency).
  const exists = await Customer.findOne({ storeId: sid, gstNumber: gstin }).lean();
  if (exists) continue;

  await Customer.create({
    storeId: sid,
    name: `${p.name}`,
    phone: ph,
    email: `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
    gstNumber: gstin,
    stateCode: p.stateCode,
    address: `Industrial Area, ${p.stateCode === '27' ? 'Mumbai' : p.stateCode === '29' ? 'Bengaluru' : 'Delhi NCR'}`,
    creditLimit: 500000,
    outstandingBalance: receivable,
    isActive: true,
  });

  await Supplier.create({
    storeId: sid,
    name: `${p.name}`, // intentionally same name + GSTIN
    phone: ph,
    email: `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
    gstNumber: gstin,
    stateCode: p.stateCode,
    address: `Industrial Area, ${p.stateCode === '27' ? 'Mumbai' : p.stateCode === '29' ? 'Bengaluru' : 'Delhi NCR'}`,
    outstandingBalance: payable,
    isActive: true,
  });

  plantedCount++;
}
console.log(`  planted ${plantedCount} dual-identity partners (customer ↔ supplier with same GSTIN + phone)`);

// ===================================================================
// SUMMARY — show what the Party Settlement page will display
// ===================================================================
console.log('\n=== seed complete ===');

// Replicate the matching logic to preview what the page will show.
const [allCust, allSup] = await Promise.all([
  Customer.find({ storeId: sid, outstandingBalance: { $gt: 0 } }).lean(),
  Supplier.find({ storeId: sid, outstandingBalance: { $gt: 0 } }).lean(),
]);
console.log(`customers with outstanding > 0: ${allCust.length}`);
console.log(`suppliers with outstanding > 0: ${allSup.length}`);

const norm = (v) => String(v || '').trim().toLowerCase();
const supByGstin = new Map();
const supByPhone = new Map();
for (const s of allSup) {
  if (s.gstNumber) supByGstin.set(norm(s.gstNumber), s);
  if (s.phone) supByPhone.set(norm(s.phone), s);
}
let matched = 0;
let totalSettlable = 0;
for (const c of allCust) {
  let s = null;
  if (c.gstNumber && supByGstin.has(norm(c.gstNumber))) s = supByGstin.get(norm(c.gstNumber));
  else if (c.phone && supByPhone.has(norm(c.phone))) s = supByPhone.get(norm(c.phone));
  if (!s) continue;
  matched++;
  totalSettlable += Math.min(Number(c.outstandingBalance), Number(s.outstandingBalance));
}
console.log(`matched candidate pairs: ${matched}`);
console.log(`total settlable (sum of min(receivable, payable)): ₹${totalSettlable.toLocaleString('en-IN')}`);

await mongoose.disconnect();
process.exit(0);
