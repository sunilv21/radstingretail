/**
 * One-shot CLI: set the `priceIncludesGst` flag on existing products in bulk.
 *
 * Why this exists:
 *   Products created before the GST-inclusive feature (or created with the
 *   toggle off) sit in the DB as tax-EXCLUSIVE, so the POS stacks GST on top
 *   of a price the operator intended to be tax-INCLUSIVE. Editing each one by
 *   hand is tedious; this flips them in one pass.
 *
 * Usage:
 *   node server/scripts/fix-gst-inclusive.js --store <storeId> --to inclusive
 *   node server/scripts/fix-gst-inclusive.js --store <storeId> --to inclusive --dry-run
 *   node server/scripts/fix-gst-inclusive.js --store <storeId> --to exclusive --sku LED-001
 *   node server/scripts/fix-gst-inclusive.js --all --to inclusive --dry-run
 *
 * Flags:
 *   --store <id>   Limit to one store (recommended). Mutually exclusive with --all.
 *   --all          Apply across every store in the DB. Use with care.
 *   --to <mode>    'inclusive' | 'exclusive'. Required.
 *   --sku <sku>    Optional — only the product with this SKU (within the store).
 *   --dry-run      Print what WOULD change without writing.
 *
 * Idempotent: only products whose flag differs from the target are touched, so
 * re-running is a no-op once everything is aligned.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import Product from '../models/Product.js';

function getFlag(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function hasFlag(name) {
  return process.argv.includes(name);
}

const storeId = getFlag('--store');
const all = hasFlag('--all');
const to = getFlag('--to');
const sku = getFlag('--sku');
const dryRun = hasFlag('--dry-run');

// --- Validate args ---------------------------------------------------------
if (!to || !['inclusive', 'exclusive'].includes(to)) {
  console.error('Error: --to must be "inclusive" or "exclusive".');
  console.error('Usage: node server/scripts/fix-gst-inclusive.js --store <storeId> --to inclusive [--sku SKU] [--dry-run]');
  process.exit(2);
}
if (!storeId && !all) {
  console.error('Error: pass --store <storeId> (recommended) or --all.');
  process.exit(2);
}
if (storeId && all) {
  console.error('Error: --store and --all are mutually exclusive.');
  process.exit(2);
}
if (storeId && !mongoose.isValidObjectId(storeId)) {
  console.error(`Error: --store "${storeId}" is not a valid ObjectId.`);
  process.exit(2);
}

const targetValue = to === 'inclusive';

await connectDB();

// --- Build filter ----------------------------------------------------------
// Only select products whose flag DIFFERS from the target, so the count and
// the write both reflect actual changes (idempotent).
const filter = { priceIncludesGst: { $ne: targetValue } };
if (storeId) filter.storeId = new mongoose.Types.ObjectId(storeId);
if (sku) filter.sku = sku;

const scope = storeId ? `store ${storeId}` : 'ALL stores';
const skuNote = sku ? ` (SKU "${sku}")` : '';
console.log(`\nTarget: priceIncludesGst = ${targetValue} (${to})`);
console.log(`Scope:  ${scope}${skuNote}\n`);

const candidates = await Product.find(filter)
  .select({ name: 1, sku: 1, sellingPrice: 1, gstRate: 1, priceIncludesGst: 1, storeId: 1 })
  .lean();

if (candidates.length === 0) {
  console.log('Nothing to change — every matching product is already aligned.');
  await mongoose.disconnect();
  process.exit(0);
}

// --- Preview ---------------------------------------------------------------
console.log(`${candidates.length} product(s) will change from ${!targetValue} → ${targetValue}:\n`);
for (const p of candidates.slice(0, 50)) {
  const rate = Number(p.gstRate || 0);
  const price = Number(p.sellingPrice || 0);
  let note = '';
  if (rate > 0 && price > 0) {
    if (targetValue) {
      const taxable = price / (1 + rate / 100);
      note = `→ customer pays ₹${price.toFixed(2)} (taxable ₹${taxable.toFixed(2)} + GST ₹${(price - taxable).toFixed(2)})`;
    } else {
      const tax = price * (rate / 100);
      note = `→ customer pays ₹${(price + tax).toFixed(2)} (₹${price.toFixed(2)} + GST ₹${tax.toFixed(2)})`;
    }
  }
  console.log(`  • ${p.name} [${p.sku}] ₹${price} @ ${rate}% ${note}`);
}
if (candidates.length > 50) console.log(`  … and ${candidates.length - 50} more.`);

if (dryRun) {
  console.log('\n[dry-run] No changes written. Re-run without --dry-run to apply.');
  await mongoose.disconnect();
  process.exit(0);
}

// --- Apply -----------------------------------------------------------------
const res = await Product.updateMany(filter, { $set: { priceIncludesGst: targetValue } });
console.log(`\n✓ Updated ${res.modifiedCount} product(s) to ${to}.`);

await mongoose.disconnect();
process.exit(0);
