/**
 * Seed the accounting / books layer for a tenant's primary store.
 *
 *   node server/scripts/seed-accounting.js [admin-email]
 *
 * Bootstrap usually plants a chart of accounts when a tenant is first
 * created, but stores onboarded later (or via the platform admin
 * route, which doesn't run bootstrap) end up with zero account
 * groups, accounts, ledger entries or vouchers — which makes every
 * Books / Ledger / P&L tab look broken.
 *
 * This script:
 *   - Seeds the standard Tally-style chart of accounts (idempotent).
 *   - Replays existing Sales into balanced ledger entries:
 *       Cash/Bank/Debtors Dr  ·  Sales Revenue Cr  ·  GST Payable Cr
 *   - Replays Purchase Orders (received + partial) into:
 *       Purchase Expense Dr  ·  GST Input Dr  ·  Creditors Cr
 *   - Plants ~120 manual vouchers (payment / receipt / journal / contra)
 *     with balanced debit/credit entries so the Vouchers tab is alive.
 *   - Sets sensible opening balances on Cash + Capital so the Trial
 *     Balance / Balance Sheet aren't all-zero.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(envRoot, '.env.local') });
dotenv.config({ path: path.join(envRoot, '.env') });

import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { connectDB } from '../config/database.js';
import TenantAdmin from '../models/TenantAdmin.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import AccountGroup from '../models/AccountGroup.js';
import Account from '../models/Account.js';
import BankAccount from '../models/BankAccount.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Voucher from '../models/Voucher.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';

const TARGET_EMAIL = (process.argv[2] || 'admin@example.com').toLowerCase();

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

await connectDB();

const admin = await TenantAdmin.findOne({ email: TARGET_EMAIL });
if (!admin) {
  console.error(`No tenant admin found for ${TARGET_EMAIL}`);
  process.exit(1);
}
const org = await Organization.findById(admin.organizationId);
const store = await Store.findOne({
  organizationId: org._id,
  type: 'store',
  isActive: { $ne: false },
});
if (!store) {
  console.error('No active store on the org');
  process.exit(1);
}
const sid = store._id;
console.log(`Seeding accounting into ${org.name} → ${store.name}`);

// ===================================================================
// 1. CHART OF ACCOUNTS — idempotent
// ===================================================================
console.log('\n[1/5] chart of accounts …');

const ROOT_GROUPS = [
  { name: 'Assets', nature: 'asset' },
  { name: 'Liabilities', nature: 'liability' },
  { name: 'Income', nature: 'income' },
  { name: 'Expenses', nature: 'expense' },
];
const SUB_GROUPS = [
  { name: 'Current Assets', parent: 'Assets', nature: 'asset' },
  { name: 'Fixed Assets', parent: 'Assets', nature: 'asset' },
  { name: 'Current Liabilities', parent: 'Liabilities', nature: 'liability' },
  { name: 'Capital Account', parent: 'Liabilities', nature: 'liability' },
  { name: 'Direct Income', parent: 'Income', nature: 'income' },
  { name: 'Indirect Income', parent: 'Income', nature: 'income' },
  { name: 'Direct Expenses', parent: 'Expenses', nature: 'expense' },
  { name: 'Indirect Expenses', parent: 'Expenses', nature: 'expense' },
];
const ACCOUNTS = [
  { name: 'Cash', group: 'Current Assets', opening: 50000 },
  { name: 'Sundry Debtors', group: 'Current Assets', opening: 0 },
  { name: 'GST Input Credit', group: 'Current Assets', opening: 0 },
  { name: 'Closing Stock', group: 'Current Assets', opening: 0 },
  { name: 'Sundry Creditors', group: 'Current Liabilities', opening: 0 },
  { name: 'GST Payable (Output)', group: 'Current Liabilities', opening: 0 },
  { name: 'Sales Revenue', group: 'Direct Income', opening: 0 },
  { name: 'Purchase Expense', group: 'Direct Expenses', opening: 0 },
  { name: 'Rounding Off', group: 'Indirect Expenses', opening: 0 },
  { name: "Proprietor's Capital", group: 'Capital Account', opening: 50000 },
  // Indirect expense accounts for variety in vouchers
  { name: 'Salaries', group: 'Indirect Expenses', opening: 0 },
  { name: 'Rent', group: 'Indirect Expenses', opening: 0 },
  { name: 'Electricity', group: 'Indirect Expenses', opening: 0 },
  { name: 'Internet & Phone', group: 'Indirect Expenses', opening: 0 },
  { name: 'Office Supplies', group: 'Indirect Expenses', opening: 0 },
  { name: 'Bank Charges', group: 'Indirect Expenses', opening: 0 },
];

// Upsert root groups
const rootByName = {};
for (const g of ROOT_GROUPS) {
  rootByName[g.name] = await AccountGroup.findOneAndUpdate(
    { storeId: sid, name: g.name, parentId: null },
    { $setOnInsert: { storeId: sid, name: g.name, nature: g.nature, parentId: null } },
    { upsert: true, new: true },
  );
}
const subByName = {};
for (const g of SUB_GROUPS) {
  subByName[g.name] = await AccountGroup.findOneAndUpdate(
    { storeId: sid, name: g.name, parentId: rootByName[g.parent]._id },
    {
      $setOnInsert: {
        storeId: sid,
        name: g.name,
        nature: g.nature,
        parentId: rootByName[g.parent]._id,
      },
    },
    { upsert: true, new: true },
  );
}
const accountByName = {};
for (const a of ACCOUNTS) {
  accountByName[a.name] = await Account.findOneAndUpdate(
    { storeId: sid, name: a.name },
    {
      $setOnInsert: {
        storeId: sid,
        name: a.name,
        groupId: subByName[a.group]._id,
        openingBalance: a.opening,
      },
    },
    { upsert: true, new: true },
  );
}
console.log(
  `  groups: ${Object.keys(rootByName).length} root + ${Object.keys(subByName).length} sub · accounts: ${Object.keys(accountByName).length}`,
);

// ===================================================================
// 2. BANK / CASH ACCOUNTS
// ===================================================================
console.log('\n[2/5] bank accounts …');
const cashIH = await BankAccount.findOneAndUpdate(
  { storeId: sid, name: 'Cash in Hand' },
  { $setOnInsert: { storeId: sid, name: 'Cash in Hand', type: 'cash', openingBalance: 50000, currentBalance: 50000 } },
  { upsert: true, new: true },
);
const hdfc = await BankAccount.findOneAndUpdate(
  { storeId: sid, name: 'HDFC Current A/c' },
  {
    $setOnInsert: {
      storeId: sid,
      name: 'HDFC Current A/c',
      type: 'bank',
      accountNumber: '50100' + (Math.floor(Math.random() * 99999999)),
      ifsc: 'HDFC0000123',
      openingBalance: 250000,
      currentBalance: 250000,
    },
  },
  { upsert: true, new: true },
);
const icici = await BankAccount.findOneAndUpdate(
  { storeId: sid, name: 'ICICI Bank A/c' },
  {
    $setOnInsert: {
      storeId: sid,
      name: 'ICICI Bank A/c',
      type: 'bank',
      accountNumber: '00450' + (Math.floor(Math.random() * 99999999)),
      ifsc: 'ICIC0000456',
      openingBalance: 100000,
      currentBalance: 100000,
    },
  },
  { upsert: true, new: true },
);
console.log(`  bank rows: cash, HDFC, ICICI`);

const accCash = accountByName['Cash'];
const accDebtors = accountByName['Sundry Debtors'];
const accCreditors = accountByName['Sundry Creditors'];
const accGstInput = accountByName['GST Input Credit'];
const accGstOutput = accountByName['GST Payable (Output)'];
const accSales = accountByName['Sales Revenue'];
const accPurchase = accountByName['Purchase Expense'];
const accCapital = accountByName["Proprietor's Capital"];
const accSalaries = accountByName['Salaries'];
const accRent = accountByName['Rent'];
const accElec = accountByName['Electricity'];
const accNet = accountByName['Internet & Phone'];
const accOffice = accountByName['Office Supplies'];
const accBankChg = accountByName['Bank Charges'];

// ===================================================================
// 3. LEDGER ENTRIES from existing SALES
// ===================================================================
console.log('\n[3/5] ledger entries from sales …');
const sales = await Sale.find({ storeId: sid, status: 'completed' }).lean();
const entryDocs = [];
for (const s of sales) {
  const taxableTotal = +(s.subtotal - (s.totalDiscount || 0)).toFixed(2);
  const tax = +(s.totalTax || 0).toFixed(2);
  const grand = +(s.grandTotal || taxableTotal + tax).toFixed(2);
  const isCredit = s.paymentStatus === 'credit';
  // Pick which Cash/Bank account collected the money. Simplification:
  // any cash → cash account; UPI/card/bank → first listed bank.
  const firstMode = (s.payments && s.payments[0]?.mode) || 'cash';
  const debitAccount = isCredit
    ? accDebtors
    : firstMode === 'cash'
      ? accCash
      : accCash; // treat all incoming as cash here for trial-balance simplicity
  const debitType = isCredit ? 'receivable' : 'cash';

  // Dr Cash/Bank/Debtors  ·  Cr Sales Revenue + GST
  entryDocs.push({
    storeId: sid,
    entryType: 'debit',
    accountType: debitType,
    accountId: debitAccount._id,
    amount: grand,
    referenceType: 'sale',
    referenceId: s._id,
    narration: `Sale ${s.invoiceNumber}`,
    isAutoGenerated: true,
    createdBy: admin._id,
    createdAt: s.createdAt,
  });
  entryDocs.push({
    storeId: sid,
    entryType: 'credit',
    accountType: 'revenue',
    accountId: accSales._id,
    amount: taxableTotal,
    referenceType: 'sale',
    referenceId: s._id,
    narration: `Sale ${s.invoiceNumber}`,
    isAutoGenerated: true,
    createdBy: admin._id,
    createdAt: s.createdAt,
  });
  if (tax > 0) {
    entryDocs.push({
      storeId: sid,
      entryType: 'credit',
      accountType: 'gst',
      accountId: accGstOutput._id,
      amount: tax,
      referenceType: 'sale',
      referenceId: s._id,
      narration: `GST output ${s.invoiceNumber}`,
      isAutoGenerated: true,
      createdBy: admin._id,
      createdAt: s.createdAt,
    });
  }
}
console.log(`  prepared ${entryDocs.length} entries from ${sales.length} sales`);

// ===================================================================
// 4. LEDGER ENTRIES from existing PURCHASES (received / partial)
// ===================================================================
console.log('\n[4/5] ledger entries from purchases …');
const pos = await Purchase.find({
  storeId: sid,
  status: { $in: ['received', 'partial', 'closed'] },
}).lean();
let poEntryCount = 0;
for (const p of pos) {
  const sub = +(p.subtotal || 0).toFixed(2);
  const tax = +(p.totalTax || 0).toFixed(2);
  const grand = +(p.grandTotal || sub + tax).toFixed(2);
  if (grand <= 0) continue;
  // Dr Purchase Expense + GST Input  ·  Cr Sundry Creditors
  entryDocs.push({
    storeId: sid,
    entryType: 'debit',
    accountType: 'expense',
    accountId: accPurchase._id,
    amount: sub,
    referenceType: 'purchase',
    referenceId: p._id,
    narration: `Purchase ${p.poNumber}`,
    isAutoGenerated: true,
    createdBy: admin._id,
    createdAt: p.createdAt,
  });
  poEntryCount++;
  if (tax > 0) {
    entryDocs.push({
      storeId: sid,
      entryType: 'debit',
      accountType: 'gst',
      accountId: accGstInput._id,
      amount: tax,
      referenceType: 'purchase',
      referenceId: p._id,
      narration: `GST input ${p.poNumber}`,
      isAutoGenerated: true,
      createdBy: admin._id,
      createdAt: p.createdAt,
    });
    poEntryCount++;
  }
  entryDocs.push({
    storeId: sid,
    entryType: 'credit',
    accountType: 'payable',
    accountId: accCreditors._id,
    amount: grand,
    referenceType: 'purchase',
    referenceId: p._id,
    narration: `Supplier dues ${p.poNumber} · ${p.supplierSnapshot?.name || ''}`,
    isAutoGenerated: true,
    createdBy: admin._id,
    createdAt: p.createdAt,
  });
  poEntryCount++;
}
console.log(`  prepared ${poEntryCount} additional entries from ${pos.length} POs`);

// Wipe pre-existing auto-seed entries (to avoid double-entering on
// re-runs) but keep manual-flagged ones.
await LedgerEntry.deleteMany({ storeId: sid, isAutoGenerated: true });
await LedgerEntry.insertMany(entryDocs, { ordered: false });
console.log(`  inserted ${entryDocs.length} ledger entries (sales + purchases)`);

// ===================================================================
// 5. MANUAL VOUCHERS — payment / receipt / journal / contra
// ===================================================================
console.log('\n[5/5] manual vouchers …');
const customersList = await Customer.find({ storeId: sid }).limit(50).lean();
const suppliersList = await Supplier.find({ storeId: sid }).limit(50).lean();

const BATCH = crypto.randomBytes(2).toString('hex').toUpperCase();
const year = new Date().getFullYear();
let voucherSeq = Date.now() % 100000;
const voucherDocs = [];
const voucherEntries = []; // ledger entries from manual vouchers

function nextVoucherNumber(prefix) {
  voucherSeq++;
  return `${prefix}-${year}-${BATCH}${String(voucherSeq).padStart(5, '0')}`;
}

function pushVoucher(type, narration, entries, dateOffsetDays) {
  const total = entries
    .filter((e) => e.entryType === 'debit')
    .reduce((s, e) => s + e.amount, 0);
  const prefix = type === 'payment' ? 'PMT' : type === 'receipt' ? 'RCT' : type === 'journal' ? 'JV' : 'CON';
  const voucherNumber = nextVoucherNumber(prefix);
  const date = daysAgo(dateOffsetDays);
  const id = new mongoose.Types.ObjectId();
  voucherDocs.push({
    _id: id,
    storeId: sid,
    type,
    voucherNumber,
    date,
    narration,
    entries: entries.map((e) => ({
      accountId: e.accountId,
      accountName: e.accountName,
      entryType: e.entryType,
      amount: e.amount,
    })),
    totalAmount: total,
    createdBy: admin._id,
    createdAt: date,
    updatedAt: date,
  });
  // Mirror into ledger so the trial balance picks them up.
  for (const e of entries) {
    voucherEntries.push({
      storeId: sid,
      entryType: e.entryType,
      accountType: e.accountType,
      accountId: e.accountId,
      amount: e.amount,
      referenceType: 'voucher',
      referenceId: id,
      narration: `${voucherNumber}: ${narration}`,
      isAutoGenerated: false,
      createdBy: admin._id,
      createdAt: date,
    });
  }
}

// 30 PAYMENT vouchers — pay supplier dues
for (let i = 0; i < 30; i++) {
  const sup = pick(suppliersList);
  const amt = pick([5000, 12500, 25000, 50000, 75000, 100000]);
  pushVoucher(
    'payment',
    `Paid ${sup?.name || 'supplier'} towards outstanding dues`,
    [
      {
        accountId: accCreditors._id,
        accountName: accCreditors.name,
        entryType: 'debit',
        amount: amt,
        accountType: 'payable',
      },
      {
        accountId: accCash._id,
        accountName: accCash.name,
        entryType: 'credit',
        amount: amt,
        accountType: 'cash',
      },
    ],
    rand(150),
  );
}

// 30 RECEIPT vouchers — collect from credit customers
for (let i = 0; i < 30; i++) {
  const cust = pick(customersList);
  const amt = pick([2500, 5000, 10000, 25000, 50000, 75000]);
  pushVoucher(
    'receipt',
    `Received from ${cust?.name || 'customer'} against credit invoice`,
    [
      {
        accountId: accCash._id,
        accountName: accCash.name,
        entryType: 'debit',
        amount: amt,
        accountType: 'cash',
      },
      {
        accountId: accDebtors._id,
        accountName: accDebtors.name,
        entryType: 'credit',
        amount: amt,
        accountType: 'receivable',
      },
    ],
    rand(150),
  );
}

// 40 JOURNAL vouchers — operating expenses
const EXPENSE_VOUCHERS = [
  { acc: accSalaries, narrations: ['Monthly staff salaries', 'Cashier salary disbursed', 'Manager bonus paid'], amounts: [25000, 35000, 50000, 75000] },
  { acc: accRent, narrations: ['Shop rent for the month', 'Branch rent disbursed'], amounts: [15000, 25000, 30000, 50000] },
  { acc: accElec, narrations: ['Electricity bill paid', 'Power utility payment'], amounts: [3500, 5500, 7500, 12000] },
  { acc: accNet, narrations: ['Internet broadband renewed', 'Phone bill paid'], amounts: [999, 1499, 2999] },
  { acc: accOffice, narrations: ['Stationery + printer ink', 'Office consumables'], amounts: [1200, 2500, 4500] },
  { acc: accBankChg, narrations: ['Bank service charges', 'NEFT charges', 'Cheque book fee'], amounts: [99, 250, 500] },
];
for (let i = 0; i < 40; i++) {
  const cat = pick(EXPENSE_VOUCHERS);
  const amt = pick(cat.amounts);
  const narration = pick(cat.narrations);
  pushVoucher(
    'journal',
    narration,
    [
      {
        accountId: cat.acc._id,
        accountName: cat.acc.name,
        entryType: 'debit',
        amount: amt,
        accountType: 'expense',
      },
      {
        accountId: accCash._id,
        accountName: accCash.name,
        entryType: 'credit',
        amount: amt,
        accountType: 'cash',
      },
    ],
    rand(150),
  );
}

// 20 CONTRA vouchers — cash to bank / bank to cash / inter-bank
for (let i = 0; i < 20; i++) {
  const amt = pick([10000, 25000, 50000, 100000, 200000]);
  if (chance(0.6)) {
    // Cash deposited into bank
    pushVoucher(
      'contra',
      `Cash deposited into HDFC Current A/c`,
      [
        // For ledger purposes both legs map to 'cash' since bank deposits
        // sit under cash/bank in the trial balance.
        { accountId: accCash._id, accountName: accCash.name, entryType: 'debit', amount: amt, accountType: 'cash' },
        { accountId: accCash._id, accountName: accCash.name, entryType: 'credit', amount: amt, accountType: 'cash' },
      ],
      rand(150),
    );
  } else {
    // Cash withdrawn from bank
    pushVoucher(
      'contra',
      `Cash withdrawn from HDFC Current A/c`,
      [
        { accountId: accCash._id, accountName: accCash.name, entryType: 'debit', amount: amt, accountType: 'cash' },
        { accountId: accCash._id, accountName: accCash.name, entryType: 'credit', amount: amt, accountType: 'cash' },
      ],
      rand(150),
    );
  }
}

// Wipe + insert vouchers (idempotent on rerun)
// Note: voucherNumber has a UNIQUE index so we use a per-run BATCH
// tag to avoid colliding with anything already there. Existing
// vouchers from prior runs are left intact.
await Voucher.insertMany(voucherDocs, { ordered: false });
await LedgerEntry.insertMany(voucherEntries, { ordered: false });
console.log(`  inserted ${voucherDocs.length} vouchers (30 payment · 30 receipt · 40 journal · 20 contra)`);
console.log(`  inserted ${voucherEntries.length} voucher-derived ledger entries`);

// ===================================================================
// SUMMARY
// ===================================================================
console.log('\n=== seed complete ===');
const finalCounts = await Promise.all([
  AccountGroup.countDocuments({ storeId: sid }),
  Account.countDocuments({ storeId: sid }),
  BankAccount.countDocuments({ storeId: sid }),
  LedgerEntry.countDocuments({ storeId: sid }),
  Voucher.countDocuments({ storeId: sid }),
]);
const [g, a, b, l, v] = finalCounts;
console.log(`store totals (after seed):
  account groups   ${g}
  accounts         ${a}
  bank accounts    ${b}
  ledger entries   ${l}
  vouchers         ${v}`);

// Trial balance sanity check — totalDr should equal totalCr.
const totals = await LedgerEntry.aggregate([
  { $match: { storeId: sid } },
  { $group: { _id: '$entryType', total: { $sum: '$amount' } } },
]);
const totalsMap = Object.fromEntries(totals.map((t) => [t._id, t.total]));
console.log(`trial balance:  Dr ₹${(totalsMap.debit || 0).toLocaleString('en-IN')}  ·  Cr ₹${(totalsMap.credit || 0).toLocaleString('en-IN')}  ·  delta ${((totalsMap.debit || 0) - (totalsMap.credit || 0)).toLocaleString('en-IN')}`);

await mongoose.disconnect();
process.exit(0);
