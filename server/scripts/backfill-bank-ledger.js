/**
 * One-shot backfill: re-point historical bank/UPI/card ledger entries from
 * the `Cash` account to the dedicated `Bank` account.
 *
 *   node server/scripts/backfill-bank-ledger.js            # apply
 *   node server/scripts/backfill-bank-ledger.js --dry-run  # preview only
 *
 * Why: the LedgerEngine used to post EVERY non-credit tender — including
 * UPI and card — to the `Cash` chart account (the `accName = hasBank ? 'Cash'
 * : 'Cash'` bug). Digital money therefore showed up as physical cash in the
 * trial balance, balance sheet and cash-flow statement.
 *
 * The engine has been fixed going forward (UPI/card/wallet now post to a
 * dedicated `Bank` account). This script rewrites the historical entries so
 * past reports reconcile with the new behaviour. It runs across EVERY store
 * in the database and is safe to re-run (already-correct entries are skipped).
 *
 * Detection: a ledger entry is a mis-filed bank entry when
 *   - entryType debit, referenceType 'sale'   → bank received on a sale, OR
 *   - entryType debit, referenceType 'payment' → bank received from a customer, OR
 *   - entryType credit, referenceType 'payment' → bank paid to a supplier, OR
 *   - entryType credit, referenceType 'return' → bank refund to a customer
 *   AND accountType === 'bank'
 *   AND accountId === Cash account _id
 * We re-point such entries' accountId to the store's Bank account. accountType
 * was already 'bank', so only the accountId was wrong.
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
import Store from '../models/Store.js';
import Account from '../models/Account.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { seedStoreAccounts } from '../services/seedStoreAccounts.js';

const DRY_RUN = process.argv.includes('--dry-run');

await connectDB();
console.log(`\n[backfill-bank-ledger] ${DRY_RUN ? 'DRY RUN — no writes' : 'APPLYING changes'}\n`);

const stores = await Store.find({}).select({ _id: 1, name: 1 }).lean();
console.log(`Found ${stores.length} store(s).`);

let totalRepointed = 0;

for (const store of stores) {
  const sid = store._id;

  // Ensure the Bank account exists for this store (seeds only what's missing).
  if (!DRY_RUN) await seedStoreAccounts(sid);

  const cash = await Account.findOne({ storeId: sid, name: 'Cash' }).lean();
  const bank = await Account.findOne({ storeId: sid, name: 'Bank' }).lean();

  if (!cash) {
    console.log(`  · ${store.name}: no Cash account — skipping.`);
    continue;
  }
  if (!bank) {
    console.log(
      `  · ${store.name}: no Bank account${DRY_RUN ? ' (would be seeded on apply)' : ''} — skipping repoint.`,
    );
    continue;
  }

  // Mis-filed bank entries: accountType 'bank' but accountId pointing at Cash.
  const query = {
    storeId: sid,
    accountType: 'bank',
    accountId: cash._id,
  };

  const count = await LedgerEntry.countDocuments(query);
  if (count === 0) {
    console.log(`  · ${store.name}: nothing to fix.`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`  · ${store.name}: ${count} bank entr${count === 1 ? 'y' : 'ies'} would be re-pointed Cash → Bank.`);
  } else {
    const res = await LedgerEntry.updateMany(query, { $set: { accountId: bank._id } });
    console.log(`  ✓ ${store.name}: re-pointed ${res.modifiedCount} entr${res.modifiedCount === 1 ? 'y' : 'ies'} Cash → Bank.`);
    totalRepointed += res.modifiedCount;
  }
}

console.log(
  `\n[backfill-bank-ledger] ${DRY_RUN ? 'Dry run complete.' : `Done — ${totalRepointed} entries re-pointed.`}\n`,
);

await mongoose.disconnect();
process.exit(0);
