/**
 * Sanity check after running migrate-split-users.js. Counts each collection
 * and lists email + role/userType so you can confirm by eye that nothing
 * weird ended up in the wrong place.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';
import TenantAdmin from '../models/TenantAdmin.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';

await connectDB();

const [supers, admins, users, orgs] = await Promise.all([
  SuperAdmin.find({}).select({ email: 1, name: 1, isActive: 1 }).lean(),
  TenantAdmin.find({}).select({ email: 1, name: 1, organizationId: 1, isActive: 1 }).lean(),
  User.find({}).select({ email: 1, role: 1, organizationId: 1, isActive: 1 }).lean(),
  Organization.find({}).select({ name: 1, ownerUserId: 1, isActive: 1 }).lean(),
]);

console.log(`superadmins  (${supers.length}):`);
for (const r of supers) console.log(`  · ${r.email}  ${r.isActive === false ? '(disabled)' : ''}`);

console.log(`\ntenantadmins (${admins.length}):`);
for (const r of admins) console.log(`  · ${r.email}  org=${r.organizationId || '∅'}  ${r.isActive === false ? '(disabled)' : ''}`);

console.log(`\nusers/staff  (${users.length}):`);
for (const r of users) console.log(`  · ${r.email}  role=${r.role}  org=${r.organizationId || '∅'}`);

console.log(`\norganizations(${orgs.length}):`);
for (const r of orgs) console.log(`  · ${r.name}  owner=${r.ownerUserId}  ${r.isActive === false ? '(disabled)' : ''}`);

await mongoose.disconnect();
process.exit(0);
