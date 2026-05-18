/**
 * One-shot migration: introduce Organization on top of existing Stores +
 * Users. Idempotent — safe to re-run.
 *
 *   1. For every Store missing organizationId, create or attach a "Default
 *      Organization" (named after the store) and link it.
 *   2. For every User missing organizationId, link to the org owning their
 *      legacy storeId. If they have storeIds[] already, infer org from the
 *      first one.
 *   3. Backfill User.storeIds[] from User.storeId for legacy single-store users.
 *
 * Usage: node server/scripts/migrate-to-org.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Store from '../models/Store.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set in .env');
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 30_000 });
console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

let storesUpdated = 0;
let usersUpdated = 0;
let orgsCreated = 0;

const stores = await Store.find().lean();
for (const store of stores) {
  if (store.organizationId) continue;

  // Find an admin user for this store to set as the org owner.
  const owner = await User.findOne({
    $or: [
      { storeId: store._id },
      { storeIds: store._id },
      { primaryStoreId: store._id },
    ],
    role: { $in: ['admin', 'super_admin', 'Admin'] },
  });

  // Create one organization per store. (Future migrations can merge multiple
  // stores into one org via the Branches UI.)
  const org = await Organization.create({
    name: store.name + ' (Org)',
    ownerUserId: owner?._id || (await User.findOne())._id,
    plan: 'free',
    centralGstin: store.gstNumber || '',
    isActive: true,
  });
  orgsCreated += 1;

  await Store.updateOne({ _id: store._id }, { $set: { organizationId: org._id } });
  storesUpdated += 1;
  console.log(`Linked store "${store.name}" → org "${org.name}" (${org._id})`);
}

// Now backfill users.
const users = await User.find();
for (const user of users) {
  const updates = {};

  // Always populate storeIds if missing.
  const ids = new Set((user.storeIds || []).map((s) => String(s)));
  if (user.storeId) ids.add(String(user.storeId));
  if (user.primaryStoreId) ids.add(String(user.primaryStoreId));
  const storeIds = Array.from(ids);
  if (storeIds.length && (user.storeIds || []).length !== storeIds.length) {
    updates.storeIds = storeIds;
  }
  if (!user.primaryStoreId && storeIds.length) {
    updates.primaryStoreId = storeIds[0];
  }

  // Resolve organizationId from the first store the user has.
  if (!user.organizationId && storeIds.length) {
    const firstStore = await Store.findById(storeIds[0]).select({ organizationId: 1 }).lean();
    if (firstStore?.organizationId) updates.organizationId = firstStore.organizationId;
  }

  if (Object.keys(updates).length) {
    await User.updateOne({ _id: user._id }, { $set: updates });
    usersUpdated += 1;
    console.log(`Updated user ${user.email}: ${Object.keys(updates).join(', ')}`);
  }
}

// Demote any historical super_admin in a tenant org back to plain `admin`.
// `super_admin` is now reserved for the software vendor (cross-tenant
// platform admin) — never an in-org user. The `admin` role already grants
// full org-level control (Branches / Users / Audit / Settings).
const demoted = await User.updateMany(
  { role: 'super_admin', organizationId: { $ne: null } },
  { $set: { role: 'admin' } },
);
if (demoted.modifiedCount > 0) {
  console.log(`Demoted ${demoted.modifiedCount} in-org super_admin user(s) → admin`);
}

console.log(
  `Done. Orgs created: ${orgsCreated}; stores updated: ${storesUpdated}; users updated: ${usersUpdated}.`,
);

await mongoose.disconnect();
process.exit(0);
