/**
 * Diagnostic: dump the state we need to debug the user's reported issues.
 *
 *   node server/scripts/diagnose-account.js admin@example.com
 *
 * - Looks up the email across superadmins / tenantadmins / users
 * - Lists every Organization with store/warehouse count
 * - Lists every SubscriptionPlan + isActive
 * Read-only. Safe to run.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';
import TenantAdmin from '../models/TenantAdmin.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';

const targetEmail = (process.argv[2] || 'admin@example.com').toLowerCase();

await connectDB();

console.log('\n=== ACCOUNT LOOKUP for', targetEmail, '===');
const [sa, ta, u] = await Promise.all([
  SuperAdmin.findOne({ email: targetEmail }).lean(),
  TenantAdmin.findOne({ email: targetEmail }).lean(),
  User.findOne({ email: targetEmail }).lean(),
]);
if (sa) console.log('  superadmins:', { id: sa._id.toString(), name: sa.name, role: sa.role, isActive: sa.isActive });
if (ta) console.log('  tenantadmins:', { id: ta._id.toString(), name: ta.name, role: ta.role, organizationId: ta.organizationId?.toString(), isActive: ta.isActive });
if (u) console.log('  users:', { id: u._id.toString(), name: u.name, role: u.role, organizationId: u.organizationId?.toString(), storeId: u.storeId?.toString(), isActive: u.isActive });
if (!sa && !ta && !u) console.log('  NOT FOUND in any collection');

console.log('\n=== ORGANIZATIONS ===');
const orgs = await Organization.find({}).lean();
for (const o of orgs) {
  const stores = await Store.find({ organizationId: o._id }).lean();
  const byType = stores.reduce((acc, s) => {
    const t = s.type === 'warehouse' ? 'warehouse' : 'store';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  console.log(`  ${o.name} (${o._id})`);
  console.log(`    plan: ${o.plan} · isActive: ${o.isActive} · subEnd: ${o.subscriptionEndsAt} · trialEnd: ${o.trialEndsAt}`);
  console.log(`    stores: ${stores.length} (${byType.store || 0} store, ${byType.warehouse || 0} warehouse)`);
  if (stores.length > 0) {
    for (const s of stores) console.log(`      - ${s.name} (type: ${s.type}, isActive: ${s.isActive})`);
  }
}

console.log('\n=== SUBSCRIPTION PLANS ===');
const plans = await SubscriptionPlan.find({}).sort({ displayOrder: 1, price: 1 }).lean();
if (plans.length === 0) {
  console.log('  ⚠  NO PLANS PUBLISHED. The Subscription Expired screen will fall back to "no plans" state.');
} else {
  for (const p of plans) {
    console.log(`  ${p.name} (${p.code}) · tier=${p.tier} · ₹${p.price} ${p.billingCycle} · isActive=${p.isActive} · paymentUrl="${p.paymentUrl || ''}"`);
  }
}

await mongoose.disconnect();
process.exit(0);
