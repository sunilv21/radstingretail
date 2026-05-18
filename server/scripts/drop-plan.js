/**
 * Tiny one-shot: delete a SubscriptionPlan row by `code`.
 *   node server/scripts/drop-plan.js <code>
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
import SubscriptionPlan from '../models/SubscriptionPlan.js';

const code = process.argv[2];
if (!code) {
  console.error('usage: node server/scripts/drop-plan.js <code>');
  process.exit(1);
}

await connectDB();
const r = await SubscriptionPlan.deleteOne({ code });
console.log(`deleted ${r.deletedCount} row(s) for code="${code}"`);
await mongoose.disconnect();
process.exit(0);
