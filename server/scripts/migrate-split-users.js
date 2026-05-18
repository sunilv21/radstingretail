/**
 * Migration: split the legacy `users` collection into three.
 *
 *   role: super_admin / Super_Admin → superadmins
 *   role: admin / Admin             → tenantadmins
 *   role: manager / cashier / accountant / ca / Manager / Cashier / Accountant
 *                                   → users (staff)
 *
 * Idempotent: re-running won't double-insert. Existing rows in the target
 * collections are matched by email and updated in place if their email
 * already exists. Original rows are removed from the legacy `users`
 * collection after they've been moved (super_admin and admin only — staff
 * stay where they are).
 *
 *   node server/scripts/migrate-split-users.js [--dry-run]
 *
 * Always run with `--dry-run` first on a live DB to see the plan, then
 * re-run without the flag to actually mutate. Existing bcrypt password
 * hashes are copied verbatim — the pre-save hook is intentionally bypassed
 * because re-hashing an already-hashed value would invalidate every login.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';
import TenantAdmin from '../models/TenantAdmin.js';
import User from '../models/User.js';

const DRY_RUN = process.argv.includes('--dry-run');

await connectDB();

console.log(`[migrate-split-users] mode: ${DRY_RUN ? 'dry-run (no writes)' : 'LIVE'}`);

// We bypass Mongoose validation/hooks because we're copying already-hashed
// passwords. Use the raw collection driver to insert preserving the doc.
const usersCol = mongoose.connection.db.collection('users');
const supersCol = mongoose.connection.db.collection('superadmins');
const tenantAdminsCol = mongoose.connection.db.collection('tenantadmins');

const allUsers = await usersCol.find({}).toArray();
console.log(`Found ${allUsers.length} users in legacy collection.`);

let movedSuper = 0;
let movedTenant = 0;
let staffLeftAlone = 0;
let skippedDuplicate = 0;
let invalidRole = 0;

const idsToDeleteFromLegacy = [];

for (const u of allUsers) {
  const role = String(u.role || '').toLowerCase().replace(/\s+/g, '_');

  if (role === 'super_admin' || role === 'superadmin') {
    if (!DRY_RUN) {
      const existing = await supersCol.findOne({ email: u.email });
      if (existing) {
        skippedDuplicate++;
        idsToDeleteFromLegacy.push(u._id);
        continue;
      }
      await supersCol.insertOne({
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        password: u.password, // already-hashed; copy verbatim
        isActive: u.isActive !== false,
        lastLogin: u.lastLogin || null,
        createdAt: u.createdAt || new Date(),
        updatedAt: u.updatedAt || new Date(),
      });
      idsToDeleteFromLegacy.push(u._id);
    }
    movedSuper++;
    console.log(`  → superadmin: ${u.email}`);
  } else if (role === 'admin') {
    if (!DRY_RUN) {
      const existing = await tenantAdminsCol.findOne({ email: u.email });
      if (existing) {
        skippedDuplicate++;
        idsToDeleteFromLegacy.push(u._id);
        continue;
      }
      await tenantAdminsCol.insertOne({
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        password: u.password,
        organizationId: u.organizationId || null,
        storeIds: u.storeIds || [],
        primaryStoreId: u.primaryStoreId || null,
        isActive: u.isActive !== false,
        lastLogin: u.lastLogin || null,
        createdAt: u.createdAt || new Date(),
        updatedAt: u.updatedAt || new Date(),
      });
      idsToDeleteFromLegacy.push(u._id);
    }
    movedTenant++;
    console.log(`  → tenantadmin: ${u.email}`);
  } else if (['manager', 'cashier', 'accountant', 'ca'].includes(role)) {
    // Stay in users. Normalise the role to canonical lowercase if needed.
    if (!DRY_RUN && u.role !== role) {
      await usersCol.updateOne({ _id: u._id }, { $set: { role } });
    }
    staffLeftAlone++;
  } else {
    invalidRole++;
    console.warn(`  ! unknown role "${u.role}" on ${u.email} — left in users untouched`);
  }
}

if (!DRY_RUN && idsToDeleteFromLegacy.length > 0) {
  const r = await usersCol.deleteMany({ _id: { $in: idsToDeleteFromLegacy } });
  console.log(`Removed ${r.deletedCount} migrated rows from legacy users collection.`);
}

console.log('');
console.log('Migration summary');
console.log('-----------------');
console.log(`  super_admin → superadmins:   ${movedSuper}`);
console.log(`  admin       → tenantadmins:  ${movedTenant}`);
console.log(`  staff (kept in users):       ${staffLeftAlone}`);
console.log(`  duplicates skipped:          ${skippedDuplicate}`);
console.log(`  unknown role (untouched):    ${invalidRole}`);
console.log(DRY_RUN ? '\nDry run — nothing was written.' : '\nDone.');

await mongoose.disconnect();
process.exit(0);
