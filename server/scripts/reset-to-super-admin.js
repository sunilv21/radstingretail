/**
 * DESTRUCTIVE: wipe every tenant-side row and leave only the platform
 * super_admin. Use when you want a clean SaaS slate to test multi-tenant
 * onboarding from the Platform UI.
 *
 *   node server/scripts/reset-to-super-admin.js \
 *        --email <super_admin_email> \
 *        --password <strong_password> \
 *        [--name "Platform Admin"] \
 *        [--keep-stores] \
 *        [--wipe-data] \
 *        --yes
 *
 * After the multi-tenant split this script:
 *   - DROPS every superadmin / tenantadmin / user row
 *   - DROPS every Organization row
 *   - DROPS every InviteToken
 *   - DROPS every Store           (skip with --keep-stores)
 *   - With --wipe-data, also clears sales / purchases / ledger / etc.
 *   - CREATES a single super_admin in the `superadmins` collection
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';
import TenantAdmin from '../models/TenantAdmin.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import InviteToken from '../models/InviteToken.js';

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  if (v && !v.startsWith('--')) return v;
  return true;
}

const email = arg('email');
const password = arg('password');
const name = arg('name', 'Platform Admin');
const keepStores = !!arg('keep-stores', false);
const wipeData = !!arg('wipe-data', false);
const confirmed = !!arg('yes', false);

if (!email || !password) {
  console.error(
    'Usage:\n' +
    '  node server/scripts/reset-to-super-admin.js \\\n' +
    '       --email <email> --password <password> [--name "Name"] \\\n' +
    '       [--keep-stores] [--wipe-data] --yes',
  );
  process.exit(2);
}
if (String(password).length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(2);
}
if (!confirmed) {
  console.error(
    '\nThis is destructive. It will delete ALL accounts (superadmins, ' +
    'tenantadmins, users), every organization, every invite token, and ' +
    '(unless --keep-stores) every store. Re-run with --yes to confirm.\n',
  );
  process.exit(2);
}

await connectDB();

console.log('Wiping tenant data…');
const [supers, admins, users, orgs, invites] = await Promise.all([
  SuperAdmin.deleteMany({}),
  TenantAdmin.deleteMany({}),
  User.deleteMany({}),
  Organization.deleteMany({}),
  InviteToken.deleteMany({}),
]);
console.log(` · superadmins:   ${supers.deletedCount}`);
console.log(` · tenantadmins:  ${admins.deletedCount}`);
console.log(` · users (staff): ${users.deletedCount}`);
console.log(` · organizations: ${orgs.deletedCount}`);
console.log(` · invite tokens: ${invites.deletedCount}`);
if (!keepStores) {
  const storeResult = await Store.deleteMany({});
  console.log(` · stores:        ${storeResult.deletedCount}`);
} else {
  console.log(' · stores:        (kept — passed --keep-stores)');
}

if (wipeData) {
  const dataCollections = [
    'sales', 'purchases', 'ledgerentries', 'stockmovements',
    'products', 'productunits', 'customers', 'suppliers',
    'accountgroups', 'accounts', 'vouchers', 'bankaccounts',
    'gst_reports', 'gstreports', 'audit_logs', 'auditlogs',
    'notifications', 'storetransfers', 'batches',
    'creditnotes', 'debitnotes', 'returns', 'salesreturns', 'purchasereturns',
  ];
  for (const c of dataCollections) {
    try {
      const r = await mongoose.connection.db.collection(c).deleteMany({});
      if (r.deletedCount > 0) console.log(` · ${c}: ${r.deletedCount}`);
    } catch {
      /* ignore non-existent collection */
    }
  }
}

console.log('Creating super_admin…');
const cleanEmail = String(email).toLowerCase().trim();
await SuperAdmin.create({
  name,
  email: cleanEmail,
  password,
  isActive: true,
});
console.log(`✓ super_admin created: ${cleanEmail}`);
console.log('  Log in via the vendor portal with this email + the password you supplied.');

await mongoose.disconnect();
process.exit(0);
