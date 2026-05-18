/**
 * One-shot backfill: every Organization that has zero Store rows gets
 * one default Store named after the org. Brings legacy tenants up to
 * the new model where every tenant always has at least one store —
 * the implicit "main" store the plan grants on day zero.
 *
 *   node server/scripts/backfill-main-store.js [--dry-run]
 *
 * Idempotent. Safe to re-run; orgs that already have ≥ 1 store are
 * left alone.
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
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';

const DRY_RUN = process.argv.includes('--dry-run');

await connectDB();

const orgs = await Organization.find({}).lean();
console.log(`[backfill-main-store] Scanning ${orgs.length} orgs · mode: ${DRY_RUN ? 'dry-run' : 'LIVE'}`);

let created = 0;
let skipped = 0;

for (const org of orgs) {
  const existing = await Store.countDocuments({ organizationId: org._id });
  if (existing > 0) {
    skipped++;
    continue;
  }
  if (DRY_RUN) {
    console.log(`  · would create main store for "${org.name}" (${org._id})`);
  } else {
    await Store.create({
      organizationId: org._id,
      name: org.name,
      type: 'store',
      isActive: true,
    });
    console.log(`  ✓ created main store for "${org.name}"`);
  }
  created++;
}

console.log('');
console.log(`already had a store: ${skipped}`);
console.log(`stores created:      ${created}`);

await mongoose.disconnect();
process.exit(0);
