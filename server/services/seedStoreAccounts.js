/**
 * Per-store accounting bootstrap.
 *
 * Every store needs its own chart of accounts (Tally-style: top-level
 * natures → sub-groups → accounts). The fresh-database `bootstrapIfEmpty`
 * seeds them for the demo store created at first boot, but production
 * onboards new tenants and new branches at runtime — those stores need
 * their accounts seeded right when they're created.
 *
 * This module is the single source of truth for "what does a brand-new
 * store's chart look like." Idempotent: re-running on an already-seeded
 * store inserts only the rows that are missing, so it doubles as a
 * self-heal for stores that were created before this seeding ran.
 */

import AccountGroup from '../models/AccountGroup.js';
import Account from '../models/Account.js';
import BankAccount from '../models/BankAccount.js';

/** Canonical top-level groups. Nature drives Tally-style classification. */
const ROOT_GROUPS = [
  { name: 'Assets', nature: 'asset' },
  { name: 'Liabilities', nature: 'liability' },
  { name: 'Income', nature: 'income' },
  { name: 'Expenses', nature: 'expense' },
];

/** Sub-groups under each root, keyed by parent group name. */
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

/** Default ledger accounts, keyed by sub-group name. */
const ACCOUNTS = [
  { name: 'Cash', group: 'Current Assets' },
  // Digital tenders (UPI / card / wallet) post here, distinct from Cash,
  // so the trial balance, cash-flow and day-book separate physical cash
  // from money that landed in the bank.
  { name: 'Bank', group: 'Current Assets' },
  { name: 'Sundry Debtors', group: 'Current Assets' },
  { name: 'GST Input Credit', group: 'Current Assets' },
  { name: 'Closing Stock', group: 'Current Assets' },
  { name: 'Sundry Creditors', group: 'Current Liabilities' },
  { name: 'GST Payable (Output)', group: 'Current Liabilities' },
  { name: 'Sales Revenue', group: 'Direct Income' },
  { name: 'Purchase Expense', group: 'Direct Expenses' },
  { name: 'Rounding Off', group: 'Indirect Expenses' },
  { name: "Proprietor's Capital", group: 'Capital Account' },
];

/**
 * Seed (or repair) the chart of accounts + default cash bank account for a
 * specific store. Returns `{ created: { groups, accounts, bankAccounts } }`
 * with counts so callers can log what actually changed.
 *
 * Safe to run on a fully-seeded store — every insert is gated by an
 * existence check, so the second call is a no-op (just a handful of
 * read queries).
 */
export async function seedStoreAccounts(storeId, opts = {}) {
  const { session } = opts;
  if (!storeId) throw new Error('seedStoreAccounts: storeId is required');
  const findOpts = session ? { session } : {};
  const insertOpts = session ? { session } : {};

  const created = { groups: 0, accounts: 0, bankAccounts: 0 };

  // 1. Root groups — find or create.
  const rootByName = {};
  for (const g of ROOT_GROUPS) {
    let row = await AccountGroup.findOne({ storeId, name: g.name, parentId: null }, null, findOpts);
    if (!row) {
      const [doc] = await AccountGroup.insertMany(
        [{ storeId, name: g.name, parentId: null, nature: g.nature }],
        insertOpts,
      );
      row = doc;
      created.groups += 1;
    }
    rootByName[g.name] = row;
  }

  // 2. Sub-groups — find or create under the right root.
  const subByName = {};
  for (const g of SUB_GROUPS) {
    const parent = rootByName[g.parent];
    if (!parent) continue;
    let row = await AccountGroup.findOne(
      { storeId, name: g.name, parentId: parent._id },
      null,
      findOpts,
    );
    if (!row) {
      const [doc] = await AccountGroup.insertMany(
        [{ storeId, name: g.name, parentId: parent._id, nature: g.nature }],
        insertOpts,
      );
      row = doc;
      created.groups += 1;
    }
    subByName[g.name] = row;
  }

  // 3. Ledger accounts — find or create under the right sub-group.
  for (const a of ACCOUNTS) {
    const group = subByName[a.group];
    if (!group) continue;
    const exists = await Account.exists({ storeId, name: a.name }, findOpts);
    if (!exists) {
      await Account.insertMany(
        [{ storeId, name: a.name, groupId: group._id, openingBalance: 0 }],
        insertOpts,
      );
      created.accounts += 1;
    }
  }

  // 4. Default cash bank-account (the "Cash in Hand" till). One per store.
  const cashExists = await BankAccount.exists({ storeId, name: 'Cash in Hand' }, findOpts);
  if (!cashExists) {
    await BankAccount.insertMany(
      [
        {
          storeId,
          name: 'Cash in Hand',
          type: 'cash',
          openingBalance: 0,
          currentBalance: 0,
        },
      ],
      insertOpts,
    );
    created.bankAccounts += 1;
  }

  if (created.groups || created.accounts || created.bankAccounts) {
    console.log(
      `[seedStoreAccounts] store=${storeId} groups+=${created.groups} accounts+=${created.accounts} banks+=${created.bankAccounts}`,
    );
  }

  return { created };
}
