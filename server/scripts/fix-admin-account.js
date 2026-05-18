/**
 * One-shot: free up the admin@example.com email so it can be reused.
 *
 * The super_admin row for admin@example.com was blocking tenant creation
 * (the email-uniqueness check spans superadmins / tenantadmins / users).
 *
 * Default action: DELETE the super_admin row, leaving the email free.
 * Pass `--keep-and-rename` to instead rename the existing super_admin's
 * email to admin-vendor@example.com so you don't lose the row entirely
 * (useful when this is the only super_admin in the system).
 *
 *   node server/scripts/fix-admin-account.js
 *   node server/scripts/fix-admin-account.js --keep-and-rename
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';
import TenantAdmin from '../models/TenantAdmin.js';
import User from '../models/User.js';

const TARGET = 'admin@example.com';
const RENAMED = 'admin-vendor@example.com';
const KEEP_AND_RENAME = process.argv.includes('--keep-and-rename');

await connectDB();

const totalSupers = await SuperAdmin.countDocuments({});
const target = await SuperAdmin.findOne({ email: TARGET }).lean();

if (!target) {
  // Maybe it lives in tenantadmins / users instead. Surface that too.
  const ta = await TenantAdmin.findOne({ email: TARGET }).lean();
  const u = await User.findOne({ email: TARGET }).lean();
  console.log(`Nothing to do — ${TARGET} is not in superadmins.`);
  if (ta) console.log(`  - found in tenantadmins (org=${ta.organizationId})`);
  if (u) console.log(`  - found in users (org=${u.organizationId})`);
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`Found super_admin row for ${TARGET}: id=${target._id}, name=${target.name}`);
console.log(`Total super_admins in DB: ${totalSupers}`);

if (KEEP_AND_RENAME) {
  // Keep the row but free the email by renaming.
  if (await SuperAdmin.findOne({ email: RENAMED })) {
    console.log(`✗ ${RENAMED} is already taken in superadmins. Pick a different rename target manually.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  await SuperAdmin.updateOne({ _id: target._id }, { $set: { email: RENAMED } });
  console.log(`✓ Renamed super_admin to ${RENAMED}. ${TARGET} is now free.`);
} else {
  // Refuse to delete the LAST super_admin — that would lock the admin
  // portal out forever.
  if (totalSupers <= 1) {
    console.log('');
    console.log('⚠  This is the only super_admin in the system.');
    console.log('   Deleting it would lock the admin portal completely.');
    console.log('   Re-run with --keep-and-rename to free the email without deleting.');
    await mongoose.disconnect();
    process.exit(1);
  }
  await SuperAdmin.deleteOne({ _id: target._id });
  console.log(`✓ Deleted super_admin row for ${TARGET}. Email is now reusable.`);
}

await mongoose.disconnect();
process.exit(0);
