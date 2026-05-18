/**
 * Repoint Organization.ownerUserId at the correct row after the user-split
 * migration. Some orgs have an ownerUserId that used to point at a User
 * with role 'super_admin' — that row has now moved to the `superadmins`
 * collection, which is wrong (super_admins don't own tenant orgs).
 *
 * Strategy:
 *   1. Walk every Organization.
 *   2. If ownerUserId resolves to a TenantAdmin in this same org → ok.
 *   3. Else, find the oldest TenantAdmin in this org and use them.
 *   4. Else, log "no owner" and leave the field alone.
 *
 * Idempotent and safe to re-run.
 *
 *   node server/scripts/fix-org-owners.js [--dry-run]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import Organization from '../models/Organization.js';
import TenantAdmin from '../models/TenantAdmin.js';

const DRY_RUN = process.argv.includes('--dry-run');

await connectDB();

const orgs = await Organization.find({}).lean();
console.log(`[fix-org-owners] Scanning ${orgs.length} organizations · mode: ${DRY_RUN ? 'dry-run' : 'LIVE'}`);

let fixed = 0;
let alreadyCorrect = 0;
let stillNoOwner = 0;

for (const org of orgs) {
  const ownerInOrg = org.ownerUserId
    ? await TenantAdmin.findOne({ _id: org.ownerUserId, organizationId: org._id }).lean()
    : null;
  if (ownerInOrg) {
    alreadyCorrect++;
    continue;
  }

  const replacement = await TenantAdmin.findOne({ organizationId: org._id })
    .sort({ createdAt: 1 })
    .lean();

  if (!replacement) {
    stillNoOwner++;
    console.warn(`  ! Org "${org.name}" (${org._id}) has no TenantAdmin — vendor must onboard one.`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`  · would set Org "${org.name}".ownerUserId = ${replacement.email} (${replacement._id})`);
  } else {
    await Organization.updateOne(
      { _id: org._id },
      { $set: { ownerUserId: replacement._id } },
    );
    console.log(`  ✓ Org "${org.name}".ownerUserId → ${replacement.email}`);
  }
  fixed++;
}

console.log('');
console.log(`already correct:     ${alreadyCorrect}`);
console.log(`fixed:               ${fixed}`);
console.log(`still without owner: ${stillNoOwner}`);

await mongoose.disconnect();
process.exit(0);
