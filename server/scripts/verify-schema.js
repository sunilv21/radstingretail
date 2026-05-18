/**
 * Production-readiness schema check. Lists each tenant-relevant collection,
 * its document count, and the indexes Mongoose registered.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';
import TenantAdmin from '../models/TenantAdmin.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';

await connectDB();

const collections = [
  ['superadmins', SuperAdmin],
  ['tenantadmins', TenantAdmin],
  ['users', User],
  ['organizations', Organization],
  ['stores', Store],
];

console.log('Collection · count · indexes');
console.log('-----------------------------');
for (const [name, Model] of collections) {
  const count = await Model.estimatedDocumentCount();
  const idx = await Model.collection.indexes();
  const idxLine = idx
    .map((i) => `${i.name}=${JSON.stringify(i.key)}${i.unique ? ' UNIQUE' : ''}`)
    .join(', ');
  console.log(`${name.padEnd(15)} · ${String(count).padStart(3)} · ${idxLine}`);
}

console.log('');
console.log('Cross-collection email uniqueness check');
console.log('---------------------------------------');
const [s, t, u] = await Promise.all([
  SuperAdmin.find({}, { email: 1 }).lean(),
  TenantAdmin.find({}, { email: 1 }).lean(),
  User.find({}, { email: 1 }).lean(),
]);
const seen = new Map();
let dupes = 0;
for (const [coll, rows] of [['superadmins', s], ['tenantadmins', t], ['users', u]]) {
  for (const r of rows) {
    const e = String(r.email || '').toLowerCase();
    if (seen.has(e)) {
      console.log(`  ! collision: ${e} in ${seen.get(e)} and ${coll}`);
      dupes++;
    } else {
      seen.set(e, coll);
    }
  }
}
console.log(`  total unique emails: ${seen.size}, collisions: ${dupes}`);

console.log('');
console.log('Org → owner integrity');
console.log('---------------------');
const orgs = await Organization.find({}).lean();
for (const o of orgs) {
  const owner = o.ownerUserId
    ? await TenantAdmin.findById(o.ownerUserId).lean()
    : null;
  console.log(
    `  ${o.name}: ownerUserId=${o.ownerUserId || 'NULL'}  resolves=${owner ? owner.email : 'MISSING'}  inOrg=${owner && String(owner.organizationId) === String(o._id) ? 'yes' : 'no'}`,
  );
}

await mongoose.disconnect();
process.exit(0);
