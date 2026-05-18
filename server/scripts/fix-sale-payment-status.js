/**
 * One-shot migration: fix sales where amountPaid wrongly counted credit-mode
 * payments as money received. Recomputes:
 *   amountPaid = sum of non-credit payments (cash/upi/card)
 *   paymentStatus = paid | partial | credit (from amountPaid vs grandTotal)
 *
 * Usage: node server/scripts/fix-sale-payment-status.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Sale from '../models/Sale.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set in .env');
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 30_000 });
console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

let scanned = 0;
let fixed = 0;
const cursor = Sale.find({ status: 'completed' }).cursor();
for await (const sale of cursor) {
  scanned++;
  const cashPaid = (sale.payments || [])
    .filter((p) => ['cash', 'upi', 'card'].includes(p.mode))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const newAmountPaid = Math.min(cashPaid, Number(sale.grandTotal || 0));
  const newStatus =
    newAmountPaid + 0.01 >= Number(sale.grandTotal || 0)
      ? 'paid'
      : newAmountPaid > 0
        ? 'partial'
        : 'credit';

  const currentAmountPaid = Number(sale.amountPaid || 0);
  const drift = Math.abs(currentAmountPaid - newAmountPaid);
  const statusDrift = sale.paymentStatus !== newStatus;

  if (drift > 0.01 || statusDrift) {
    console.log(
      `  ${sale.invoiceNumber}: amountPaid ${currentAmountPaid.toFixed(2)} → ${newAmountPaid.toFixed(2)}, status ${sale.paymentStatus} → ${newStatus}`,
    );
    sale.amountPaid = newAmountPaid;
    sale.paymentStatus = newStatus;
    await sale.save();
    fixed++;
  }
}

console.log(`Scanned ${scanned} sales, fixed ${fixed}.`);
await mongoose.disconnect();
process.exit(0);
