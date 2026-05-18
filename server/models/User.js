/**
 * User — in-tenant staff. Manager, cashier, accountant, CA.
 *
 * After the multi-tenant split this collection ONLY holds staff. The owner
 * admin of an org now lives in `tenantadmins`, and the platform vendor
 * lives in `superadmins`. Inserting a row with role `super_admin` or
 * `admin` here is rejected at the schema level so the boundary can't drift.
 */
import mongoose from 'mongoose';
import { applyPasswordHook } from './_passwordHook.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    password: { type: String, required: true },
    role: {
      type: String,
      // Staff-only enum. Includes legacy capitalised aliases so existing
      // documents continue to validate after the split until the migration
      // script normalises them. New writes should always use the lower-case
      // canonical form.
      enum: [
        'manager', 'cashier', 'accountant', 'ca',
        'Manager', 'Cashier', 'Accountant',
      ],
      default: 'cashier',
    },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    /** Single legacy storeId kept for back-compat with old sessions. */
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    storeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
    primaryStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    permissions: {
      canDiscount: { type: Boolean, default: true },
      maxDiscountPct: { type: Number, default: 10 },
      canVoidSale: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: false },
      canManageInventory: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
  },
  { timestamps: true },
);

userSchema.index({ storeIds: 1, role: 1 });

applyPasswordHook(userSchema);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
