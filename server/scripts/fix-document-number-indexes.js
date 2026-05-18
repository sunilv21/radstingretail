/**
 * One-shot: drop the legacy collection-wide unique indexes on
 * `purchases.poNumber` and `sales.invoiceNumber`, then create the
 * proper per-store compound unique indexes.
 *
 * The original schemas had `unique: true` on these fields which made
 * every document number globally unique across the whole DB. As soon
 * as a tenant has 2+ branches they collide on PO-2026-00001 /
 * INV-2026-00001 (each store keeps its own counter starting at 1).
 *
 *   node server/scripts/fix-document-number-indexes.js
 *
 * Idempotent. Safe to re-run.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';

await connectDB();
const db = mongoose.connection.db;

async function dropIndexIfExists(collection, name) {
  const idx = await db.collection(collection).indexes();
  const found = idx.find((i) => i.name === name);
  if (!found) {
    console.log(`  ${collection}.${name}: not present (already dropped or never existed)`);
    return;
  }
  await db.collection(collection).dropIndex(name);
  console.log(`  ✓ dropped ${collection}.${name}`);
}

async function ensureIndex(collection, keys, options) {
  await db.collection(collection).createIndex(keys, options);
  const desc = Object.entries(keys).map(([k, v]) => `${k}:${v}`).join(',');
  console.log(`  ✓ ensured ${collection} index { ${desc} } unique=${!!options?.unique}`);
}

console.log('=== purchases ===');
await dropIndexIfExists('purchases', 'poNumber_1');
await ensureIndex('purchases', { storeId: 1, poNumber: 1 }, { unique: true });

console.log('=== sales ===');
await dropIndexIfExists('sales', 'invoiceNumber_1');
await ensureIndex('sales', { storeId: 1, invoiceNumber: 1 }, { unique: true });

console.log('=== vouchers ===');
await dropIndexIfExists('vouchers', 'voucherNumber_1');
await ensureIndex('vouchers', { storeId: 1, voucherNumber: 1 }, { unique: true });

await mongoose.disconnect();
console.log('\nDone.');
process.exit(0);
