/**
 * One-shot CLI: create the platform-level super_admin account in the
 * `superadmins` collection. Run by the software vendor (Mindmap Digital) —
 * NOT by store owners.
 *
 *   node server/scripts/create-super-admin.js <email> <password> [name]
 *
 * Example:
 *   node server/scripts/create-super-admin.js owner@mindmapdigital.ai 'Secret123' 'Vendor Admin'
 *
 * Idempotent: re-running with an existing email re-promotes / re-activates
 * the same row and resets the password.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';

const [, , email, password, ...nameParts] = process.argv;

if (!email || !password) {
  console.error('Usage: node server/scripts/create-super-admin.js <email> <password> [name]');
  process.exit(2);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(2);
}

const name = (nameParts.join(' ') || 'Platform Admin').trim();
const cleanEmail = String(email).toLowerCase().trim();

await connectDB();

const existing = await SuperAdmin.findOne({ email: cleanEmail });
if (existing) {
  existing.isActive = true;
  if (password) existing.password = password;
  if (name) existing.name = name;
  await existing.save();
  console.log(`✓ Updated existing super_admin: ${cleanEmail}`);
} else {
  await SuperAdmin.create({
    name,
    email: cleanEmail,
    password,
    isActive: true,
  });
  console.log(`✓ Created super_admin: ${cleanEmail}`);
}

await mongoose.disconnect();
process.exit(0);
