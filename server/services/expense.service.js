/**
 * Expense register — a friendly skin over the Voucher / Ledger machinery.
 *
 * Each saved expense becomes a *payment voucher* with two ledger entries:
 *   - Debit:  the category-specific expense account (auto-created if missing)
 *   - Credit: the paying account (Cash / Bank / UPI)
 *
 * This keeps the books a single source of truth — every expense flows through
 * the same accounting plumbing that purchases, sales and manual journals use.
 * Reports (P&L, trial balance, day book) pick them up automatically.
 *
 * The user gets a simpler form: pick a category, amount, payment mode, done.
 * We resolve account IDs behind the scenes.
 */

import mongoose from 'mongoose';
import AccountGroup from '../models/AccountGroup.js';
import Account from '../models/Account.js';
import Voucher from '../models/Voucher.js';
import { AccountingService } from './accounting.service.js';
import { AppError } from '../utils/response.js';

/**
 * Canonical expense categories shown in the UI. The label is what's printed
 * on the voucher narration and the ledger account name; the helper text
 * sits under the option in the picker. New categories ("Other") fall
 * through to a freeform name that's still created as a real account.
 */
export const EXPENSE_CATEGORIES = [
  { key: 'rent', label: 'Rent', help: 'Shop / godown / equipment rental' },
  { key: 'salaries', label: 'Salaries & Wages', help: 'Staff salaries, daily-wage labour' },
  { key: 'electricity', label: 'Electricity', help: 'Power bill, generator fuel' },
  { key: 'internet', label: 'Internet & Telephone', help: 'Broadband, mobile bills' },
  { key: 'water', label: 'Water', help: 'Water bill, supply' },
  { key: 'fuel', label: 'Fuel', help: 'Vehicle fuel, generator diesel' },
  { key: 'delivery', label: 'Delivery / Logistics', help: 'Courier, last-mile delivery' },
  { key: 'transport', label: 'Transport', help: 'Goods transport, vehicle hire' },
  { key: 'packaging', label: 'Packaging', help: 'Bags, boxes, wrapping' },
  { key: 'marketing', label: 'Marketing & Advertising', help: 'Ads, flyers, hoardings' },
  { key: 'repairs', label: 'Repairs & Maintenance', help: 'AC servicing, plumbing, electrical' },
  { key: 'office', label: 'Office Supplies', help: 'Stationery, printer ink, tea' },
  { key: 'travel', label: 'Travel', help: 'Business trips, fuel reimbursement' },
  { key: 'professional', label: 'Professional Fees', help: 'CA, lawyer, consultant' },
  { key: 'bank', label: 'Bank Charges', help: 'Service fees, transaction charges' },
  { key: 'insurance', label: 'Insurance', help: 'Shop insurance, goods insurance' },
  { key: 'misc', label: 'Miscellaneous', help: 'Anything else' },
];

const CATEGORY_KEY_TO_LABEL = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);

const PAYMENT_MODE_TO_ACCOUNT = {
  cash: 'Cash',
  bank: 'Cash', // minimal chart treats bank like cash for trial-balance rollup
  upi: 'Cash',
  card: 'Cash',
  cheque: 'Cash',
};

/**
 * Ensure an account exists under the "Indirect Expenses" group (creating
 * both the group and the account if either is missing). Returns the
 * account doc. Idempotent — safe to call on every expense.
 */
async function ensureExpenseAccount(storeId, displayName) {
  // Group: "Indirect Expenses" under nature='expense'. If missing, create.
  let group = await AccountGroup.findOne({
    storeId,
    name: 'Indirect Expenses',
  });
  if (!group) {
    group = await AccountGroup.create({
      storeId,
      name: 'Indirect Expenses',
      parentId: null,
      nature: 'expense',
    });
  }
  // Account: one per category label.
  let account = await Account.findOne({ storeId, name: displayName });
  if (!account) {
    account = await Account.create({
      storeId,
      name: displayName,
      groupId: group._id,
      openingBalance: 0,
    });
  }
  return account;
}

/** Cash / Bank account on the credit side. Required to exist in chart. */
async function findCashAccount(storeId) {
  const cash = await Account.findOne({ storeId, name: 'Cash' });
  if (!cash) {
    throw new AppError(
      'CASH_ACCOUNT_MISSING',
      'No "Cash" account in chart-of-accounts. Seed the chart first (Accounting → Books → Reset chart).',
      500,
    );
  }
  return cash;
}

export const ExpenseService = {
  categories() {
    return EXPENSE_CATEGORIES;
  },

  /**
   * List expense vouchers — `payment` type vouchers whose debit side is an
   * account under "Indirect Expenses". This is a derived view; the source
   * of truth is the Voucher collection.
   */
  async list({ storeId, from, to, category, page = 1, limit = 50 }) {
    const filter = { storeId, type: 'payment' };
    if (from || to) filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);

    // Resolve the set of "Indirect Expenses" account IDs first; then
    // filter vouchers whose debit-side accountId is in that set. This
    // keeps the query indexable while still hiding non-expense payments
    // (supplier payouts, etc.).
    const group = await AccountGroup.findOne({ storeId, name: 'Indirect Expenses' });
    if (!group) return { data: [], meta: { page, limit, total: 0, pages: 0 } };
    const expenseAccounts = await Account.find({ storeId, groupId: group._id }).lean();
    const expenseAccountIds = new Set(expenseAccounts.map((a) => String(a._id)));

    if (category) {
      // Narrow by exact account name (label) when filter is requested.
      const targetName = CATEGORY_KEY_TO_LABEL[category] || category;
      const target = expenseAccounts.find((a) => a.name === targetName);
      if (!target) return { data: [], meta: { page, limit, total: 0, pages: 0 } };
      expenseAccountIds.clear();
      expenseAccountIds.add(String(target._id));
    }

    const all = await Voucher.find(filter).sort({ date: -1 }).lean();
    const rows = all.filter((v) =>
      (v.entries || []).some(
        (e) => e.entryType === 'debit' && expenseAccountIds.has(String(e.accountId)),
      ),
    );

    const total = rows.length;
    const data = rows.slice((page - 1) * limit, page * limit).map((v) => {
      const debit = (v.entries || []).find((e) => e.entryType === 'debit');
      const credit = (v.entries || []).find((e) => e.entryType === 'credit');
      return {
        _id: v._id,
        voucherNumber: v.voucherNumber,
        date: v.date,
        category: debit?.accountName || 'Unknown',
        paidVia: credit?.accountName || 'Cash',
        amount: v.totalAmount,
        narration: v.narration || '',
        createdAt: v.createdAt,
      };
    });

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) || 0 } };
  },

  /**
   * Create one expense. Resolves accounts + posts a balanced payment voucher
   * inside AccountingService.postVoucher (which owns the atomic-write +
   * ledger-entry mirror). Returns the created voucher.
   *
   * @param {Object} input - { category, customCategory?, amount, paymentMode,
   *                           reference?, narration?, date? }
   */
  async create({ storeId, userId, input }) {
    const amount = Number(input.amount);
    if (!(amount > 0)) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be greater than 0', 400);
    }
    const categoryKey = String(input.category || '').trim();
    if (!categoryKey) {
      throw new AppError('VALIDATION_ERROR', 'Category is required', 400);
    }
    // Resolve display name. For known categories, use the canonical label
    // so the same account is reused across entries. For "Miscellaneous" the
    // user can pass `customCategory` to create a freeform sub-account.
    const displayName =
      categoryKey === 'misc' && input.customCategory
        ? String(input.customCategory).trim().slice(0, 80)
        : CATEGORY_KEY_TO_LABEL[categoryKey] || String(categoryKey).slice(0, 80);

    // Ensure the expense account exists OUTSIDE the transaction (mongoose
    // session createCollection issues otherwise). Idempotent.
    const expenseAccount = await ensureExpenseAccount(storeId, displayName);
    const cashAccount = await findCashAccount(storeId);

    // Hand off to the existing voucher pipeline — it handles numbering,
    // ledger-entry mirror, atomicity, validation.
    const voucher = await AccountingService.postVoucher({
      storeId,
      userId,
      input: {
        type: 'payment',
        date: input.date ? new Date(input.date) : new Date(),
        narration: [
          displayName,
          input.reference ? `(${input.reference})` : '',
          input.narration ? `— ${input.narration}` : '',
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 240),
        entries: [
          { accountId: expenseAccount._id, entryType: 'debit', amount },
          { accountId: cashAccount._id, entryType: 'credit', amount },
        ],
      },
    });

    return {
      _id: voucher._id,
      voucherNumber: voucher.voucherNumber,
      date: voucher.date,
      category: displayName,
      paidVia: cashAccount.name,
      amount,
      narration: voucher.narration,
    };
  },

  /**
   * Aggregate expenses by category for a date range — drives the dashboard
   * pie chart and the "biggest leak" insight. Returns rows sorted descending
   * by amount, plus total.
   */
  async breakdown({ storeId, from, to }) {
    const filter = { storeId, type: 'payment' };
    if (from || to) filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);

    const group = await AccountGroup.findOne({ storeId, name: 'Indirect Expenses' });
    if (!group) return { total: 0, rows: [] };
    const expenseAccounts = await Account.find({ storeId, groupId: group._id }).lean();
    const idSet = new Set(expenseAccounts.map((a) => String(a._id)));

    const vouchers = await Voucher.find(filter).lean();
    const byCategory = new Map();
    let grand = 0;
    for (const v of vouchers) {
      for (const e of v.entries || []) {
        if (e.entryType !== 'debit') continue;
        if (!idSet.has(String(e.accountId))) continue;
        const k = e.accountName || 'Unknown';
        byCategory.set(k, (byCategory.get(k) || 0) + Number(e.amount || 0));
        grand += Number(e.amount || 0);
      }
    }
    const rows = Array.from(byCategory.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        pct: grand > 0 ? (amount / grand) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { total: grand, rows };
  },
};

// Suppress unused import warning — kept here so future expansion can
// reference the Voucher model directly without re-importing.
void mongoose;
