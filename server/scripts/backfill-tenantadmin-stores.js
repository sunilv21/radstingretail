/**
 * One-shot: walks every TenantAdmin row whose `storeIds` is empty and
 * populates it from the org's actual Store rows. Sets primaryStoreId to
 * the first one. Fixes the "Invalid id" CastError users hit when their
 * JWT was issued before the platform onboarding flow started writing
 * storeIds onto the tenant_admin row.
 *
 *   node server/scripts/backfill-tenantadmin-stores.js [--dry-run]
 *
 * Idempotent. Safe to re-run on any environment.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import TenantAdmin from '../models/TenantAdmin.js';
import Store from '../models/Store.js';

const DRY_RUN = process.argv.includes('--dry-run');

await connectDB();

const admins = await TenantAdmin.find({}).lean();
console.log(`[backfill-tenantadmin-stores] Scanning ${admins.length} tenant_admins · mode: ${DRY_RUN ? 'dry-run' : 'LIVE'}`);

let fixed = 0;
let alreadyOk = 0;
let noOrg = 0;
let noStores = 0;

for (const ta of admins) {
  if (!ta.organizationId) {
    noOrg++;
    continue;
  }
  const stores = await Store.find({
    organizationId: ta.organizationId,
    isActive: { $ne: false },
  })
    .select({ _id: 1 })
    .lean();
  if (stores.length === 0) {
    noStores++;
    continue;
  }
  const orgStoreIds = stores.map((s) => String(s._id));
  const currentIds = (ta.storeIds || []).map((s) => String(s));
  const missing = orgStoreIds.filter((id) => !currentIds.includes(id));
  const needsPrimary =
    !ta.primaryStoreId || !orgStoreIds.includes(String(ta.primaryStoreId));

  if (missing.length === 0 && !needsPrimary) {
    alreadyOk++;
    continue;
  }

  if (DRY_RUN) {
    console.log(`  · would update ${ta.email} — add ${missing.length} store(s), set primary=${needsPrimary}`);
  } else {
    await TenantAdmin.updateOne(
      { _id: ta._id },
      {
        $set: {
          storeIds: orgStoreIds,
          primaryStoreId: orgStoreIds[0],
        },
      },
    );
    console.log(`  ✓ ${ta.email}: storeIds=${orgStoreIds.length}, primary=${orgStoreIds[0]}`);
  }
  fixed++;
}

console.log('');
console.log(`already correct:        ${alreadyOk}`);
console.log(`fixed:                  ${fixed}`);
console.log(`no organizationId:      ${noOrg}`);
console.log(`org has no stores yet:  ${noStores}`);

await mongoose.disconnect();
process.exit(0);
