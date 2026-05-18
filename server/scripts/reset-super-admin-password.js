/**
 * Reset a super-admin's password in place.
 *
 *   node server/scripts/reset-super-admin-password.js <email>            # generates a strong random password
 *   node server/scripts/reset-super-admin-password.js <email> <newPass>  # uses the given password verbatim
 *
 * The existing super-admin row is updated. createdAt + lastLogin + name
 * are preserved. The new password is bcrypt-hashed by the model's
 * pre-save hook (`_passwordHook.js`, work factor 12).
 *
 * The plaintext is printed ONCE on success. Save it; we can't show it again.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(envRoot, '.env.local') });
dotenv.config({ path: path.join(envRoot, '.env') });

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SuperAdmin from '../models/SuperAdmin.js';

const email = (process.argv[2] || '').toLowerCase().trim();
const explicit = process.argv[3];

if (!email) {
  console.error('Usage: node server/scripts/reset-super-admin-password.js <email> [newPassword]');
  process.exit(1);
}

/**
 * Generate a 16-char password with mixed case + digits + a couple of symbols.
 * Strong enough to resist brute force; readable enough to type once.
 */
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // dropped I + O — easy to mis-read
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';                   // dropped 0 + 1
  const symbols = '@#$!%';
  const pool = upper + lower + digits + symbols;
  const bytes = crypto.randomBytes(16);
  // Guarantee at least one of each category so it always passes "strong" checks
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  const rest = Array.from(bytes).map((b) => pool[b % pool.length]);
  return [...required, ...rest.slice(0, 12)]
    .sort(() => crypto.randomInt(3) - 1)
    .join('');
}

(async () => {
  await connectDB();
  const sa = await SuperAdmin.findOne({ email });
  if (!sa) {
    console.error(`✗ No super-admin found with email "${email}"`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const newPassword = explicit && explicit.length >= 8 ? explicit : generatePassword();
  if (explicit && explicit.length < 8) {
    console.error('✗ Provided password must be ≥ 8 characters');
    await mongoose.disconnect();
    process.exit(1);
  }
  sa.password = newPassword;          // _passwordHook bcrypt-hashes on save
  await sa.save();

  console.log('\n✓ Password reset for', email);
  console.log('  name:       ', sa.name);
  console.log('  isActive:   ', sa.isActive);
  console.log('\n  NEW PASSWORD:', newPassword);
  console.log('\n  Save this now — it is not retrievable later.');
  console.log('  Login at: http://localhost:3000/admin\n');

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('FAIL:', err?.message || err);
  process.exit(1);
});
