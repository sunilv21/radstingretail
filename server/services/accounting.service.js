import mongoose from 'mongoose';
import Store from '../models/Store.js';
import AccountGroup from '../models/AccountGroup.js';
import Account from '../models/Account.js';
import Voucher from '../models/Voucher.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import { AppError } from '../utils/response.js';
import { LedgerEngine } from '../engines/ledger.engine.js';
import { nextVoucherNumber } from '../utils/numbering.js';

const VOUCHER_PREFIX = {
  payment: 'PMT',
  receipt: 'RCT',
  journal: 'JV',
  contra: 'CON',
};

// Map entry.accountType → control-account lookup name when entry.accountId
// isn't one of the chart accounts (e.g. per-supplier payable entries carry
// supplierId as accountId).
const CONTROL_ACCOUNT_NAME_BY_TYPE = {
  payable: 'Sundry Creditors',
  receivable: 'Sundry Debtors',
  cash: 'Cash',
  bank: 'Cash', // treat bank as cash for trial-balance rollup in this minimal setup
  revenue: 'Sales Revenue',
  expense: 'Purchase Expense',
  gst: 'GST Payable (Output)', // default, overridden by narration below
};

function resolveControlAccountName(entry) {
  if (entry.accountType === 'gst') {
    if ((entry.narration || '').toLowerCase().includes('input')) return 'GST Input Credit';
    return 'GST Payable (Output)';
  }
  return CONTROL_ACCOUNT_NAME_BY_TYPE[entry.accountType] || null;
}

// Build a map {ledgerEntry → resolved chart-of-accounts account _id}
function resolveAccountIdForEntry(entry, accountsByName, accountIdSet) {
  // If entry.accountId is already a chart account, use it as-is.
  if (entry.accountId && accountIdSet.has(String(entry.accountId))) {
    return String(entry.accountId);
  }
  const name = resolveControlAccountName(entry);
  return name ? accountsByName.get(name)?._id?.toString() : null;
}

function toObjId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export const AccountingService = {
  async listGroups({ storeId }) {
    return AccountGroup.find({ storeId }).sort({ name: 1 }).lean();
  },

  async listAccounts({ storeId }) {
    return Account.find({ storeId }).sort({ name: 1 }).lean();
  },

  async createGroup({ storeId, input }) {
    if (!input.name) throw new AppError('VALIDATION_ERROR', 'Name is required', 400);
    if (!['asset', 'liability', 'income', 'expense'].includes(input.nature)) {
      throw new AppError('VALIDATION_ERROR', 'nature must be asset|liability|income|expense', 400);
    }
    const g = await AccountGroup.create({
      storeId,
      name: String(input.name).trim(),
      parentId: input.parentId || null,
      nature: input.nature,
    });
    return g.toObject();
  },

  async createAccount({ storeId, input }) {
    if (!input.name) throw new AppError('VALIDATION_ERROR', 'Name is required', 400);
    if (!input.groupId) throw new AppError('VALIDATION_ERROR', 'groupId is required', 400);
    const group = await AccountGroup.findOne({ _id: input.groupId, storeId });
    if (!group) throw new AppError('GROUP_NOT_FOUND', 'Account group not found', 404);
    const a = await Account.create({
      storeId,
      name: String(input.name).trim(),
      groupId: input.groupId,
      openingBalance: Number(input.openingBalance || 0),
    });
    return a.toObject();
  },

  async listVouchers({ storeId, type, from, to, page = 1, limit = 50 }) {
    const filter = { storeId };
    if (type) filter.type = type;
    if (from || to) filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
    const [total, data] = await Promise.all([
      Voucher.countDocuments(filter),
      Voucher.find(filter)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async postVoucher({ storeId, input, userId }) {
    const { type, entries, narration = '', date } = input;
    if (!VOUCHER_PREFIX[type]) {
      throw new AppError('VALIDATION_ERROR', 'type must be payment|receipt|journal|contra', 400);
    }
    if (!Array.isArray(entries) || entries.length < 2) {
      throw new AppError('VALIDATION_ERROR', 'At least two entries (1 debit + 1 credit) required', 400);
    }
    // Validate accounts + balance
    const accountIds = entries.map((e) => e.accountId);
    const accounts = await Account.find({ _id: { $in: accountIds }, storeId }).lean();
    const accMap = new Map(accounts.map((a) => [String(a._id), a]));
    let totalDebit = 0, totalCredit = 0;
    for (const e of entries) {
      if (!e.accountId || !accMap.has(String(e.accountId))) {
        throw new AppError('ACCOUNT_NOT_FOUND', `Account ${e.accountId} not found`, 404);
      }
      const amt = Number(e.amount);
      if (!(amt > 0)) throw new AppError('VALIDATION_ERROR', 'amount must be > 0', 400);
      if (e.entryType === 'debit') totalDebit += amt;
      else if (e.entryType === 'credit') totalCredit += amt;
      else throw new AppError('VALIDATION_ERROR', 'entryType must be debit|credit', 400);
    }
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new AppError(
        'VOUCHER_UNBALANCED',
        `Debits (₹${totalDebit.toFixed(2)}) must equal credits (₹${totalCredit.toFixed(2)})`,
        400,
        { totalDebit, totalCredit },
      );
    }

    const mSession = await mongoose.startSession();
    try {
      let created;
      await mSession.withTransaction(async () => {
        const store = await Store.findById(storeId).session(mSession);
        if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
        const voucherNumber = nextVoucherNumber(store, VOUCHER_PREFIX[type]);
        await store.save({ session: mSession });

        const [voucher] = await Voucher.create(
          [
            {
              storeId,
              type,
              voucherNumber,
              date: date ? new Date(date) : new Date(),
              narration,
              entries: entries.map((e) => ({
                accountId: e.accountId,
                accountName: accMap.get(String(e.accountId)).name,
                entryType: e.entryType,
                amount: Number(Number(e.amount).toFixed(2)),
              })),
              totalAmount: Number(totalDebit.toFixed(2)),
              createdBy: userId,
            },
          ],
          { session: mSession },
        );

        await LedgerEngine.postVoucher(
          {
            storeId,
            voucherId: voucher._id,
            voucherType: type,
            voucherNumber,
            entries: voucher.entries,
            narration,
            createdBy: userId,
          },
          { session: mSession },
        );

        created = voucher.toObject();
      });
      return created;
    } finally {
      await mSession.endSession();
    }
  },

  /**
   * Full account ledger — every entry for one chart-of-accounts account in a
   * date window, with running balance. Powers the drill-down page, plus the
   * Cash Book and Bank Book shortcuts (those just preselect the right account).
   */
  async accountLedger({ storeId, accountId, from, to }) {
    if (!mongoose.isValidObjectId(accountId)) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found', 404);
    }
    const acc = await Account.findOne({ _id: accountId, storeId }).lean();
    if (!acc) throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found', 404);
    const group = await AccountGroup.findById(acc.groupId).lean();

    // Pull every entry where either the entry's accountId is this account, OR
    // the entry's accountType maps to this account by name (control-account
    // rollup, e.g. supplier-level entries → Sundry Creditors).
    const accounts = await Account.find({ storeId }).lean();
    const byName = new Map(accounts.map((a) => [a.name, a]));
    const idSet = new Set(accounts.map((a) => String(a._id)));

    const filter = { storeId };
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
    const all = await LedgerEntry.find(filter).sort({ createdAt: 1 }).lean();
    const entries = all.filter(
      (r) => resolveAccountIdForEntry(r, byName, idSet) === String(acc._id),
    );

    const nature = group?.nature || 'asset';
    // Sign convention:
    //   asset / expense: balance = opening + Σ Dr − Σ Cr  (debit-natured)
    //   liability / income / equity: balance = opening + Σ Cr − Σ Dr  (credit-natured)
    const isDebitNatured = nature === 'asset' || nature === 'expense';

    let running = Number(acc.openingBalance || 0);
    let totalDr = 0;
    let totalCr = 0;
    const rows = entries.map((e) => {
      if (e.entryType === 'debit') {
        totalDr += e.amount;
        running += isDebitNatured ? e.amount : -e.amount;
      } else {
        totalCr += e.amount;
        running += isDebitNatured ? -e.amount : e.amount;
      }
      const balanceType = running >= 0 ? (isDebitNatured ? 'Dr' : 'Cr') : (isDebitNatured ? 'Cr' : 'Dr');
      return {
        _id: e._id,
        createdAt: e.createdAt,
        entryType: e.entryType,
        amount: Number(e.amount.toFixed(2)),
        referenceType: e.referenceType || '',
        referenceId: e.referenceId || null,
        narration: e.narration || '',
        isAutoGenerated: !!e.isAutoGenerated,
        runningBalance: Number(Math.abs(running).toFixed(2)),
        runningBalanceType: balanceType,
      };
    });

    const closingType = running >= 0 ? (isDebitNatured ? 'Dr' : 'Cr') : (isDebitNatured ? 'Cr' : 'Dr');
    return {
      account: {
        _id: acc._id,
        name: acc.name,
        groupId: acc.groupId,
        groupName: group?.name || '',
        nature,
        openingBalance: Number((acc.openingBalance || 0).toFixed(2)),
      },
      entries: rows,
      totals: {
        totalDebits: Number(totalDr.toFixed(2)),
        totalCredits: Number(totalCr.toFixed(2)),
        closingBalance: Number(Math.abs(running).toFixed(2)),
        closingType,
        opening: Number((acc.openingBalance || 0).toFixed(2)),
      },
    };
  },

  async accountBalance({ storeId, accountId }) {
    const acc = await Account.findOne({ _id: accountId, storeId }).lean();
    if (!acc) throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found', 404);
    const agg = await LedgerEntry.aggregate([
      { $match: { storeId: toObjId(storeId), accountId: toObjId(accountId) } },
      { $group: { _id: '$entryType', total: { $sum: '$amount' } } },
    ]);
    const dr = agg.find((r) => r._id === 'debit')?.total || 0;
    const cr = agg.find((r) => r._id === 'credit')?.total || 0;
    return {
      account: acc,
      debits: Number(dr.toFixed(2)),
      credits: Number(cr.toFixed(2)),
      net: Number(((acc.openingBalance || 0) + dr - cr).toFixed(2)),
    };
  },

  async trialBalance({ storeId }) {
    const [accounts, groups, entries] = await Promise.all([
      AccountingService.listAccounts({ storeId }),
      AccountingService.listGroups({ storeId }),
      LedgerEntry.find({ storeId }).lean(),
    ]);
    const byName = new Map(accounts.map((a) => [a.name, a]));
    const idSet = new Set(accounts.map((a) => String(a._id)));
    const groupById = new Map(groups.map((g) => [String(g._id), g]));

    const rows = accounts.map((a) => {
      const group = groupById.get(String(a.groupId));
      const matching = entries.filter(
        (r) => resolveAccountIdForEntry(r, byName, idSet) === String(a._id),
      );
      const dr = matching.filter((r) => r.entryType === 'debit').reduce((s, r) => s + r.amount, 0);
      const cr = matching.filter((r) => r.entryType === 'credit').reduce((s, r) => s + r.amount, 0);
      return {
        accountId: a._id,
        accountName: a.name,
        groupName: group?.name || '',
        nature: group?.nature || 'asset',
        openingBalance: a.openingBalance || 0,
        debits: Number(dr.toFixed(2)),
        credits: Number(cr.toFixed(2)),
        closingBalance: Number(((a.openingBalance || 0) + dr - cr).toFixed(2)),
      };
    });

    const totalDr = rows.reduce((s, r) => s + r.debits, 0);
    const totalCr = rows.reduce((s, r) => s + r.credits, 0);
    return {
      rows,
      totalDebits: Number(totalDr.toFixed(2)),
      totalCredits: Number(totalCr.toFixed(2)),
      balanced: Math.abs(totalDr - totalCr) < 0.01,
    };
  },

  /**
   * Closing inventory value at cost — Σ (stock × purchasePrice) for
   * every active product in the store. Used by P&L (to convert raw
   * Purchase Expense into Cost of Goods Sold) and Balance Sheet (to
   * surface the value sitting on the shelves as a current asset).
   *
   * Also returns a per-category breakdown so the P&L UI can show the
   * "How the closing stock is composed" table the merchant asked for.
   */
  async closingStockValue({ storeId }) {
    const products = await Product.find({ storeId, isActive: true })
      .select({ name: 1, category: 1, stock: 1, purchasePrice: 1, sellingPrice: 1 })
      .lean();
    let total = 0;
    let totalAtMrp = 0;
    let unitCount = 0;
    const byCategory = new Map();
    for (const p of products) {
      const stock = Math.max(0, Number(p.stock) || 0);
      if (stock === 0) continue;
      const cost = stock * (Number(p.purchasePrice) || 0);
      const retail = stock * (Number(p.sellingPrice) || 0);
      total += cost;
      totalAtMrp += retail;
      unitCount += stock;
      const cat = p.category || 'Uncategorised';
      const slot = byCategory.get(cat) || { category: cat, units: 0, valueAtCost: 0, valueAtRetail: 0, lines: 0 };
      slot.units += stock;
      slot.valueAtCost += cost;
      slot.valueAtRetail += retail;
      slot.lines += 1;
      byCategory.set(cat, slot);
    }
    const categories = Array.from(byCategory.values())
      .map((c) => ({
        category: c.category,
        lines: c.lines,
        units: c.units,
        valueAtCost: Number(c.valueAtCost.toFixed(2)),
        valueAtRetail: Number(c.valueAtRetail.toFixed(2)),
      }))
      .sort((a, b) => b.valueAtCost - a.valueAtCost);
    return {
      totalAtCost: Number(total.toFixed(2)),
      totalAtRetail: Number(totalAtMrp.toFixed(2)),
      potentialMargin: Number((totalAtMrp - total).toFixed(2)),
      units: unitCount,
      lines: categories.reduce((s, c) => s + c.lines, 0),
      categories,
    };
  },

  /**
   * Gross profit computed bill-by-bill: revenue (sum of taxable
   * amounts) minus cost of goods sold (qty × product.purchasePrice
   * for each line). Independent of the ledger — a quick margin number
   * the merchant can read off the actual sale records.
   *
   * Cost uses the product's CURRENT `purchasePrice` since the sale
   * line doesn't snapshot it. Close enough for a gross-margin view
   * unless the merchant has dramatic cost swings.
   *
   * Returns:
   *   billCount, revenue, cost, grossProfit, marginPct,
   *   topBills: [{ invoiceNumber, customerName, revenue, cost, profit, margin }]
   */
  async salesProfit({ storeId, from, to }) {
    const match = { storeId: toObjId(storeId), status: 'completed' };
    if (from || to) match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);

    const sales = await Sale.find(match)
      .select({ invoiceNumber: 1, items: 1, customerSnapshot: 1, createdAt: 1 })
      .lean();
    if (sales.length === 0) {
      return {
        billCount: 0,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        marginPct: 0,
        topBills: [],
        zeroCostLines: 0,
      };
    }

    // Pre-load products → cost map. One round-trip beats N per-sale
    // lookups; a 600-bill store with 5 lines avg = 3000 reads otherwise.
    const productIds = new Set();
    for (const s of sales) {
      for (const it of s.items || []) {
        if (it.productId) productIds.add(String(it.productId));
      }
    }
    const products = productIds.size > 0
      ? await Product.find({ _id: { $in: Array.from(productIds) } })
          .select({ purchasePrice: 1 })
          .lean()
      : [];
    const costById = new Map(products.map((p) => [String(p._id), Number(p.purchasePrice) || 0]));

    let totalRevenue = 0;
    let totalCost = 0;
    let zeroCostLines = 0;
    const billRows = [];

    for (const s of sales) {
      let billRev = 0;
      let billCost = 0;
      for (const it of s.items || []) {
        const qty = Number(it.quantity) || 0;
        // Revenue = taxable (post-discount, pre-GST) amount of this
        // line. Matches what the ledger credits to Sales Revenue.
        const rev = Number(it.taxableAmount) || 0;
        const cost = qty * (costById.get(String(it.productId)) || 0);
        if (cost === 0 && qty > 0) zeroCostLines++;
        billRev += rev;
        billCost += cost;
      }
      totalRevenue += billRev;
      totalCost += billCost;
      billRows.push({
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerSnapshot?.name || 'Walk-in',
        createdAt: s.createdAt,
        revenue: Number(billRev.toFixed(2)),
        cost: Number(billCost.toFixed(2)),
        profit: Number((billRev - billCost).toFixed(2)),
        margin: billRev > 0 ? Number((((billRev - billCost) / billRev) * 100).toFixed(2)) : 0,
      });
    }

    // Top 10 most-profitable bills for the right-hand summary panel.
    const topBills = [...billRows]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    return {
      billCount: sales.length,
      revenue: Number(totalRevenue.toFixed(2)),
      cost: Number(totalCost.toFixed(2)),
      grossProfit: Number((totalRevenue - totalCost).toFixed(2)),
      marginPct:
        totalRevenue > 0
          ? Number((((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(2))
          : 0,
      zeroCostLines,
      topBills,
    };
  },

  /**
   * Sales rolled up by payment mode for a date range. Reads sale
   * payment legs directly (NOT the ledger) so each rupee is bucketed
   * to the channel that actually received it: cash / UPI / card /
   * credit / loyalty. Cancelled / returned / voided sales excluded.
   *
   * Returned `total` is `Σ payments.amount` across every completed
   * sale, which equals the Sales Revenue ledger total + GST collected.
   * The merchant can spot-check against the cash-flow / receivables
   * lines.
   */
  async salesByPaymentMode({ storeId, from, to }) {
    const match = { storeId: toObjId(storeId), status: 'completed' };
    if (from || to) match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);

    const rows = await Sale.aggregate([
      { $match: match },
      { $unwind: '$payments' },
      {
        $group: {
          _id: '$payments.mode',
          amount: { $sum: '$payments.amount' },
          // count distinct sales (a split-payment sale shouldn't
          // double-count, hence $addToSet then $size).
          saleIds: { $addToSet: '$_id' },
        },
      },
      {
        $project: {
          _id: 0,
          mode: '$_id',
          amount: 1,
          count: { $size: '$saleIds' },
        },
      },
    ]);

    // Surface every supported mode even when zero — the UI panel
    // shows them as a fixed strip so the merchant sees "Card: ₹0"
    // instead of just hiding cards entirely.
    const MODES = ['cash', 'upi', 'card', 'credit', 'loyalty'];
    const byMode = Object.fromEntries(rows.map((r) => [r.mode, r]));
    const breakdown = MODES.map((m) => ({
      mode: m,
      amount: Number(((byMode[m]?.amount) || 0).toFixed(2)),
      count: byMode[m]?.count || 0,
    }));

    // Total bills + grandTotal across the same window (sanity number).
    const summary = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$grandTotal' },
          totalTax: { $sum: '$totalTax' },
          totalBills: { $sum: 1 },
        },
      },
    ]);
    const total = summary[0] || { totalSales: 0, totalTax: 0, totalBills: 0 };

    return {
      breakdown,
      paymentsTotal: Number(breakdown.reduce((s, r) => s + r.amount, 0).toFixed(2)),
      totalSales: Number((total.totalSales || 0).toFixed(2)),
      totalTax: Number((total.totalTax || 0).toFixed(2)),
      totalBills: total.totalBills || 0,
    };
  },

  async profitAndLoss({ storeId, from, to }) {
    // Original P&L logic — Income vs raw Expenses (Purchase Expense
    // included as-is). Closing-stock inventory + sales-by-payment-mode
    // are computed separately and bolted on as side-channel info for
    // the UI to render in panels / a separate "Sales P&L" tab without
    // disturbing the standard accrual P&L numbers.
    const [accounts, groups, closingStock, salesMix, salesProfit] = await Promise.all([
      AccountingService.listAccounts({ storeId }),
      AccountingService.listGroups({ storeId }),
      AccountingService.closingStockValue({ storeId }),
      AccountingService.salesByPaymentMode({ storeId, from, to }),
      AccountingService.salesProfit({ storeId, from, to }),
    ]);
    const groupById = new Map(groups.map((g) => [String(g._id), g]));
    const byName = new Map(accounts.map((a) => [a.name, a]));
    const idSet = new Set(accounts.map((a) => String(a._id)));

    const filter = { storeId };
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
    const entries = await LedgerEntry.find(filter).lean();

    const income = [], expense = [];
    for (const acc of accounts) {
      const grp = groupById.get(String(acc.groupId));
      if (!grp) continue;
      const matching = entries.filter(
        (r) => resolveAccountIdForEntry(r, byName, idSet) === String(acc._id),
      );
      const dr = matching.filter((r) => r.entryType === 'debit').reduce((s, r) => s + r.amount, 0);
      const cr = matching.filter((r) => r.entryType === 'credit').reduce((s, r) => s + r.amount, 0);
      if (grp.nature === 'income') {
        income.push({ accountId: acc._id, name: acc.name, amount: Number((cr - dr).toFixed(2)) });
      } else if (grp.nature === 'expense') {
        expense.push({ accountId: acc._id, name: acc.name, amount: Number((dr - cr).toFixed(2)) });
      }
    }

    const totalIncome = Number(income.reduce((s, i) => s + i.amount, 0).toFixed(2));
    const totalExpense = Number(expense.reduce((s, i) => s + i.amount, 0).toFixed(2));
    const netProfit = Number((totalIncome - totalExpense).toFixed(2));
    return {
      from: from || null,
      to: to || null,
      income,
      expense,
      totalIncome,
      totalExpense,
      netProfit,
      // Side-channel: closing stock at cost + per-category breakdown.
      // Informational only — does NOT alter the P&L numbers above.
      // Rendered as a "Closing Stock — held in inventory" panel below
      // the Income/Expense table.
      closingStock: {
        totalAtCost: closingStock.totalAtCost,
        totalAtRetail: closingStock.totalAtRetail,
        potentialMargin: closingStock.potentialMargin,
        units: closingStock.units,
        lines: closingStock.lines,
        categories: closingStock.categories,
      },
      // Side-channel: sales rolled up by payment mode. Powers the
      // separate "Sales P&L" tab.
      salesByPaymentMode: salesMix,
      // Side-channel: per-bill gross profit (revenue − line cost).
      // The Sales P&L tab uses this as its headline profit number
      // — independent of indirect expenses on the standard P&L.
      salesProfit,
    };
  },

  async balanceSheet({ storeId, asOf }) {
    const [accounts, groups] = await Promise.all([
      AccountingService.listAccounts({ storeId }),
      AccountingService.listGroups({ storeId }),
    ]);
    const groupById = new Map(groups.map((g) => [String(g._id), g]));
    const byName = new Map(accounts.map((a) => [a.name, a]));
    const idSet = new Set(accounts.map((a) => String(a._id)));

    const filter = { storeId };
    if (asOf) filter.createdAt = { $lte: new Date(asOf) };
    const entries = await LedgerEntry.find(filter).lean();

    const assets = [], liabilities = [];
    for (const acc of accounts) {
      const grp = groupById.get(String(acc.groupId));
      if (!grp) continue;
      const matching = entries.filter(
        (r) => resolveAccountIdForEntry(r, byName, idSet) === String(acc._id),
      );
      const dr = matching.filter((r) => r.entryType === 'debit').reduce((s, r) => s + r.amount, 0);
      const cr = matching.filter((r) => r.entryType === 'credit').reduce((s, r) => s + r.amount, 0);
      const open = acc.openingBalance || 0;
      const signed = grp.nature === 'asset' ? open + dr - cr : open + cr - dr;
      const row = { accountId: acc._id, name: acc.name, amount: Number(signed.toFixed(2)) };
      if (grp.nature === 'asset') assets.push(row);
      else if (grp.nature === 'liability') liabilities.push(row);
    }

    const pnl = await AccountingService.profitAndLoss({ storeId, to: asOf });
    const totalAssets = Number(assets.reduce((s, a) => s + a.amount, 0).toFixed(2));
    const totalLiabilities = Number(liabilities.reduce((s, a) => s + a.amount, 0).toFixed(2));
    const retained = pnl.netProfit;
    const totalEquityLiab = Number((totalLiabilities + retained).toFixed(2));
    return {
      asOf: asOf || null,
      assets,
      liabilities,
      retainedEarnings: retained,
      totalAssets,
      totalLiabilities,
      totalEquityAndLiab: totalEquityLiab,
      balanced: Math.abs(totalAssets - totalEquityLiab) < 0.01,
    };
  },

  async cashFlow({ storeId, from, to }) {
    const accounts = await AccountingService.listAccounts({ storeId });
    const cashAccounts = accounts.filter(
      (a) => /cash|bank/i.test(a.name),
    );
    const idSet = new Set(accounts.map((a) => String(a._id)));
    const byName = new Map(accounts.map((a) => [a.name, a]));

    const filter = { storeId };
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
    const entries = await LedgerEntry.find(filter).lean();

    const buckets = { 'Sales (in)': 0, 'Purchase payment (out)': 0, 'Voucher payment (out)': 0, 'Voucher receipt (in)': 0, Other: 0 };
    for (const acc of cashAccounts) {
      const matching = entries.filter(
        (r) => resolveAccountIdForEntry(r, byName, idSet) === String(acc._id),
      );
      for (const e of matching) {
        const amt = e.entryType === 'debit' ? e.amount : -e.amount;
        if (e.referenceType === 'sale') buckets['Sales (in)'] += amt;
        else if (e.referenceType === 'payment') buckets['Purchase payment (out)'] += amt;
        else if (e.referenceType === 'voucher') {
          if (amt > 0) buckets['Voucher receipt (in)'] += amt;
          else buckets['Voucher payment (out)'] += amt;
        } else buckets.Other += amt;
      }
    }
    const netCashFlow = Object.values(buckets).reduce((s, v) => s + v, 0);
    return {
      from: from || null,
      to: to || null,
      buckets: Object.entries(buckets).map(([label, amount]) => ({ label, amount: Number(amount.toFixed(2)) })),
      netCashFlow: Number(netCashFlow.toFixed(2)),
    };
  },

  async dayBook({ storeId, from, to }) {
    const filter = { storeId };
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
    return LedgerEntry.find(filter).sort({ createdAt: 1 }).lean();
  },

  async bankReconciliation({ storeId, accountId, statement = [] }) {
    const acc = await Account.findOne({ _id: accountId, storeId }).lean();
    if (!acc) throw new AppError('ACCOUNT_NOT_FOUND', 'Account not found', 404);

    const bookEntries = await LedgerEntry.find({ storeId, accountId }).lean();
    const book = bookEntries.map((r) => ({
      date: r.createdAt,
      amount: r.entryType === 'debit' ? r.amount : -r.amount,
      reference: r.narration,
      ledgerId: r._id,
    }));

    const matchedBook = new Set();
    const matchedStatement = new Set();
    for (let i = 0; i < statement.length; i++) {
      const stmt = statement[i];
      const match = book.findIndex(
        (b, idx) => !matchedBook.has(idx) && Math.abs(b.amount - Number(stmt.amount)) < 0.01,
      );
      if (match !== -1) {
        matchedBook.add(match);
        matchedStatement.add(i);
      }
    }

    return {
      account: acc,
      inBookNotInStatement: book.filter((_, i) => !matchedBook.has(i)),
      inStatementNotInBook: statement.filter((_, i) => !matchedStatement.has(i)),
      matchedCount: matchedBook.size,
      totalBookAmount: book.reduce((s, b) => s + b.amount, 0),
      totalStatementAmount: statement.reduce((s, b) => s + Number(b.amount), 0),
    };
  },

  // -----------------------------------------------------------------
  // Mutual party settlement (a.k.a. customer-supplier set-off)
  //
  // When the same physical business is both your customer and your supplier,
  // their receivable + payable balances need to be netted off via a journal
  // voucher. Auto-detect by GSTIN match, fallback to phone match.
  // Only customers and suppliers with non-zero outstanding are returned.
  // -----------------------------------------------------------------
  async listPartySettlements({ storeId }) {
    const [customers, suppliers] = await Promise.all([
      Customer.find({ storeId, outstandingBalance: { $gt: 0 } }).lean(),
      Supplier.find({ storeId, outstandingBalance: { $gt: 0 } }).lean(),
    ]);

    const norm = (v) => String(v || '').trim().toLowerCase();
    const supByGstin = new Map();
    const supByPhone = new Map();
    for (const s of suppliers) {
      if (s.gstNumber) supByGstin.set(norm(s.gstNumber), s);
      if (s.phone) supByPhone.set(norm(s.phone), s);
    }

    const seen = new Set();
    const pairs = [];
    for (const c of customers) {
      let supplier = null;
      let matchedBy = null;
      if (c.gstNumber && supByGstin.has(norm(c.gstNumber))) {
        supplier = supByGstin.get(norm(c.gstNumber));
        matchedBy = 'GSTIN';
      } else if (c.phone && supByPhone.has(norm(c.phone))) {
        supplier = supByPhone.get(norm(c.phone));
        matchedBy = 'phone';
      }
      if (!supplier) continue;
      const key = `${c._id}-${supplier._id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const receivable = Number(c.outstandingBalance || 0);
      const payable = Number(supplier.outstandingBalance || 0);
      const settle = Math.min(receivable, payable);
      const netDirection = receivable === payable ? 'even' : receivable > payable ? 'receivable' : 'payable';
      const netAmount = Math.abs(receivable - payable);

      pairs.push({
        customerId: c._id,
        customerName: c.name,
        supplierId: supplier._id,
        supplierName: supplier.name,
        gstNumber: c.gstNumber || supplier.gstNumber || '',
        phone: c.phone || supplier.phone || '',
        matchedBy,
        receivable: Number(receivable.toFixed(2)),
        payable: Number(payable.toFixed(2)),
        suggestedSettlement: Number(settle.toFixed(2)),
        netDirection,
        netAmount: Number(netAmount.toFixed(2)),
      });
    }
    return pairs.sort((a, b) => b.suggestedSettlement - a.suggestedSettlement);
  },

  /**
   * Post a settlement: Dr Sundry Creditors (supplier side), Cr Sundry Debtors (customer side).
   * Atomic — voucher + ledger entries + outstanding-balance updates all together.
   */
  async postPartySettlement({ storeId, customerId, supplierId, amount, narration, userId }) {
    const amt = Number(amount);
    if (!(amt > 0)) throw new AppError('VALIDATION_ERROR', 'amount must be > 0', 400);

    const session = await mongoose.startSession();
    try {
      let voucherDoc;
      await session.withTransaction(async () => {
        const customer = await Customer.findOne({ _id: customerId, storeId }).session(session);
        if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
        const supplier = await Supplier.findOne({ _id: supplierId, storeId }).session(session);
        if (!supplier) throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);

        if (amt > Number(customer.outstandingBalance || 0) + 0.01) {
          throw new AppError(
            'AMOUNT_EXCEEDS_RECEIVABLE',
            `Amount ₹${amt.toFixed(2)} exceeds customer's outstanding ₹${customer.outstandingBalance.toFixed(2)}`,
            400,
          );
        }
        if (amt > Number(supplier.outstandingBalance || 0) + 0.01) {
          throw new AppError(
            'AMOUNT_EXCEEDS_PAYABLE',
            `Amount ₹${amt.toFixed(2)} exceeds supplier's outstanding ₹${supplier.outstandingBalance.toFixed(2)}`,
            400,
          );
        }

        // Look up the control accounts (Sundry Creditors / Debtors) — voucher
        // entries reference these (chart-level), per-party detail goes to ledger.
        const [drAcc, crAcc] = await Promise.all([
          Account.findOne({ storeId, name: 'Sundry Creditors' }).session(session),
          Account.findOne({ storeId, name: 'Sundry Debtors' }).session(session),
        ]);
        if (!drAcc || !crAcc) {
          throw new AppError(
            'COA_INCOMPLETE',
            'Chart of Accounts is missing Sundry Creditors / Sundry Debtors. Re-run bootstrap.',
            500,
          );
        }

        // Generate voucher number (CON for contra-style settlement)
        const store = await Store.findById(storeId).session(session);
        const voucherNumber = nextVoucherNumber(store, 'CON');
        await store.save({ session });

        const txt = narration ||
          `Mutual settlement: ${customer.name} (Dr Receivable) ↔ ${supplier.name} (Cr Payable)`;

        // Voucher record (control-account level, for the voucher list)
        const [voucher] = await Voucher.create(
          [
            {
              storeId,
              type: 'contra',
              voucherNumber,
              date: new Date(),
              narration: txt,
              entries: [
                { accountId: drAcc._id, accountName: drAcc.name, entryType: 'debit', amount: amt },
                { accountId: crAcc._id, accountName: crAcc.name, entryType: 'credit', amount: amt },
              ],
              totalAmount: amt,
              createdBy: userId,
            },
          ],
          { session, ordered: true },
        );

        // Ledger entries (per-party level, for the supplier/customer ledgers)
        await LedgerEntry.create(
          [
            {
              storeId,
              entryType: 'debit',
              accountType: 'payable',
              accountId: supplier._id,
              amount: amt,
              referenceType: 'voucher',
              referenceId: voucher._id,
              narration: `Settlement against ${customer.name}'s receivable (${voucherNumber})`,
              isAutoGenerated: true,
              createdBy: userId,
            },
            {
              storeId,
              entryType: 'credit',
              accountType: 'receivable',
              accountId: customer._id,
              amount: amt,
              referenceType: 'voucher',
              referenceId: voucher._id,
              narration: `Settlement against ${supplier.name}'s payable (${voucherNumber})`,
              isAutoGenerated: true,
              createdBy: userId,
            },
          ],
          { session, ordered: true },
        );

        // Reduce outstanding balances on both sides
        customer.outstandingBalance = Number(
          (Number(customer.outstandingBalance || 0) - amt).toFixed(2),
        );
        supplier.outstandingBalance = Number(
          (Number(supplier.outstandingBalance || 0) - amt).toFixed(2),
        );
        await customer.save({ session });
        await supplier.save({ session });

        voucherDoc = voucher.toObject();
      });
      return voucherDoc;
    } finally {
      await session.endSession();
    }
  },
};
