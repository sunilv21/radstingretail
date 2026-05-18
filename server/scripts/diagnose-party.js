/**
 * Diagnose why a particular customer isn't showing up on the Party
 * Settlement list. Pass a name fragment as the only argument:
 *
 *   node server/scripts/diagnose-party.js asian
 *
 * Reports, for that store:
 *   - All customers whose name contains the fragment, with their
 *     outstandingBalance, GSTIN, phone — and whether each has a
 *     matching supplier (by GSTIN or phone).
 *   - All suppliers whose name contains the fragment, with their
 *     outstandingBalance / GSTIN / phone.
 *   - The most recent 5 sales for any matched customer, so we can see
 *     whether the sale was credit (and therefore bumped the balance).
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
import TenantAdmin from '../models/TenantAdmin.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Sale from '../models/Sale.js';

const TARGET_EMAIL = 'admin@example.com';
const NAME_FRAGMENT = (process.argv[2] || '').toLowerCase();
if (!NAME_FRAGMENT) {
  console.error('usage: node server/scripts/diagnose-party.js <name-fragment>');
  process.exit(1);
}

await connectDB();
const admin = await TenantAdmin.findOne({ email: TARGET_EMAIL });
const org = await Organization.findById(admin.organizationId);
const store = await Store.findOne({
  organizationId: org._id,
  type: 'store',
  isActive: { $ne: false },
});
const sid = store._id;
console.log(`Store ${store.name} (${sid})`);
console.log(`Looking for "${NAME_FRAGMENT}"\n`);

const re = new RegExp(NAME_FRAGMENT, 'i');

const [customers, suppliers] = await Promise.all([
  Customer.find({ storeId: sid, name: re }).sort({ createdAt: -1 }).lean(),
  Supplier.find({ storeId: sid, name: re }).sort({ createdAt: -1 }).lean(),
]);

console.log(`=== ${customers.length} customers matching ===`);
for (const c of customers) {
  console.log(`  • ${c.name}`);
  console.log(`      id ${c._id}`);
  console.log(`      phone "${c.phone || ''}"  GSTIN "${c.gstNumber || ''}"`);
  console.log(`      outstandingBalance ₹${(c.outstandingBalance || 0).toFixed(2)}`);
  console.log(`      created ${c.createdAt?.toISOString()}`);

  // Match logic mirrors AccountingService.listPartySettlements: GSTIN
  // first, then phone.
  let matchedSup = null;
  let by = null;
  if (c.gstNumber) {
    matchedSup = suppliers.find((s) => (s.gstNumber || '').toLowerCase() === (c.gstNumber || '').toLowerCase());
    if (matchedSup) by = 'GSTIN';
  }
  if (!matchedSup && c.phone) {
    matchedSup = await Supplier.findOne({
      storeId: sid,
      phone: c.phone,
      outstandingBalance: { $gt: 0 },
    }).lean();
    if (matchedSup) by = 'phone';
  }
  // Even if not in same `suppliers[]` slice, look across all suppliers.
  if (!matchedSup && c.gstNumber) {
    matchedSup = await Supplier.findOne({
      storeId: sid,
      gstNumber: c.gstNumber,
      outstandingBalance: { $gt: 0 },
    }).lean();
    if (matchedSup) by = 'GSTIN (any supplier)';
  }
  if (matchedSup) {
    console.log(`      ↔ matched supplier "${matchedSup.name}" by ${by}, payable ₹${(matchedSup.outstandingBalance || 0).toFixed(2)}`);
  } else {
    console.log(`      ✗ NO matching supplier (would not appear in Party Settlement)`);
  }

  // Recent sales for this customer
  const recentSales = await Sale.find({ storeId: sid, customerId: c._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  if (recentSales.length === 0) {
    console.log(`      no sales linked to this customer`);
  } else {
    console.log(`      recent sales:`);
    for (const s of recentSales) {
      console.log(`        - ${s.invoiceNumber}  ₹${s.grandTotal}  status=${s.status}  paymentStatus=${s.paymentStatus}  ${s.createdAt?.toISOString()}`);
    }
  }
  console.log('');
}

console.log(`=== ${suppliers.length} suppliers matching ===`);
for (const s of suppliers) {
  console.log(`  • ${s.name}`);
  console.log(`      id ${s._id}  GSTIN "${s.gstNumber || ''}"  phone "${s.phone || ''}"`);
  console.log(`      outstandingBalance ₹${(s.outstandingBalance || 0).toFixed(2)}`);
}

await mongoose.disconnect();
process.exit(0);
