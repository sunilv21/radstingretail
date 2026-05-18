/**
 * One-shot migration: recompute Customer.outstandingBalance from sales.
 * Sums (grandTotal - amountPaid) across each customer's completed non-returned sales.
 *
 * Usage: node server/scripts/fix-customer-outstanding.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Customer from '../models/Customer.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set in .env');
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 30_000 });
console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

const aggregated = await Sale.aggregate([
  {
    $match: {
      status: { $ne: 'returned' },
      customerId: { $ne: null },
      paymentStatus: { $in: ['credit', 'partial'] },
    },
  },
  {
    $group: {
      _id: '$customerId',
      outstanding: {
        $sum: { $subtract: [{ $ifNull: ['$grandTotal', 0] }, { $ifNull: ['$amountPaid', 0] }] },
      },
    },
  },
]);

const expected = new Map(aggregated.map((r) => [String(r._id), Number(r.outstanding.toFixed(2))]));

let updated = 0;
let cleared = 0;
const allCustomers = await Customer.find().select({ _id: 1, name: 1, outstandingBalance: 1 });
for (const c of allCustomers) {
  const want = expected.get(String(c._id)) || 0;
  const have = Number(c.outstandingBalance || 0);
  if (Math.abs(want - have) > 0.01) {
    console.log(`  ${c.name}: ${have.toFixed(2)} → ${want.toFixed(2)}`);
    c.outstandingBalance = want;
    await c.save();
    if (want === 0) cleared++;
    else updated++;
  }
}

console.log(`Updated ${updated} customers, cleared ${cleared}, total ${allCustomers.length} scanned.`);
await mongoose.disconnect();
process.exit(0);
