/**
 * TenantAdmin — the owner-admin of one tenant Organization.
 *
 * Lives in its own collection (`tenantadmins`). Created exclusively by a
 * super_admin via the Platform UI when they onboard a new business. There is
 * one TenantAdmin per Organization (the org's primary owner). Additional
 * non-owner staff that the tenant admin hires sit in the `users` collection
 * with role `manager` / `cashier` / `accountant` / `ca`.
 *
 * Why separate from `users`?
 *   - Different lifecycle: created by vendor, never by the tenant themselves.
 *   - Different blast radius if compromised — owner controls everything.
 *   - The tenant POS app's auth path queries { tenantadmins, users } only,
 *     never `superadmins`. Cleaner separation of which password unlocks
 *     which application.
 */
import mongoose from 'mongoose';
import { applyPasswordHook } from './_passwordHook.js';

const tenantAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    password: { type: String, required: true },
    /**
     * Pointer to the Organization this admin owns. Always populated for
     * production rows, but NOT marked `required` because the create-tenant
     * flow inserts this row first (so the Org can reference it as
     * `ownerUserId`), then sets the back-link in a second pass.
     */
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    /** Stores this admin can log into. Empty = all stores in the org. */
    storeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
    /** Default landing store for this admin (used by the store switcher). */
    primaryStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
  },
  { timestamps: true, collection: 'tenantadmins' },
);

applyPasswordHook(tenantAdminSchema);

export const TenantAdmin =
  mongoose.models.TenantAdmin || mongoose.model('TenantAdmin', tenantAdminSchema);
export default TenantAdmin;
