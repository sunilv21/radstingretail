/**
 * SuperAdmin — the software vendor's platform-level account.
 *
 * Lives in its OWN collection (`superadmins`). Cross-tenant: no organizationId,
 * no storeIds. Logs in via the separate vendor portal. The tenant POS app's
 * login flow does NOT query this collection at all, so a leaked tenant
 * password can never be used to log into the vendor side.
 */
import mongoose from 'mongoose';
import { applyPasswordHook } from './_passwordHook.js';

const superAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    password: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
  },
  { timestamps: true, collection: 'superadmins' },
);

applyPasswordHook(superAdminSchema);

export const SuperAdmin =
  mongoose.models.SuperAdmin || mongoose.model('SuperAdmin', superAdminSchema);
export default SuperAdmin;
