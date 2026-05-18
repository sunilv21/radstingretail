import mongoose from 'mongoose';

/**
 * Mirror of POS system-admin/server/models/PlatformPayment.js. Tenants
 * write here when they click Pay (status='pending'); vendor reads /
 * confirms / rejects via the admin portal. Both apps share the
 * `platformpayments` collection.
 *
 * IMPORTANT: This is the SUBSCRIPTION / SaaS-billing payment ledger
 * (vendor↔tenant). Do not confuse with the per-store `Payment` model
 * which tracks sale / purchase / party payments inside a tenant's POS.
 */
const paymentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    organizationName: { type: String, default: '' },
    reference: { type: String, required: true, unique: true, index: true },

    type: {
      type: String,
      enum: ['subscription', 'user_addon', 'manual', 'other'],
      required: true,
    },
    planCode: { type: String, default: '' },
    planName: { type: String, default: '' },
    cycleMonths: { type: Number, default: 1 },

    addonRole: {
      type: String,
      enum: ['admin', 'manager', 'cashier', 'accountant', 'ca'],
      default: null,
    },
    addonQuantity: { type: Number, default: 0 },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: ['pending', 'awaiting_confirmation', 'completed', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },

    gatewayProvider: {
      type: String,
      enum: ['razorpay', 'stripe', 'cashfree', 'paytm', 'phonepe', 'upi', 'custom', 'manual'],
      default: 'custom',
    },
    gatewayUrl: { type: String, default: '' },
    gatewayReference: { type: String, default: '' },
    tenantNote: { type: String, default: '' },
    vendorNote: { type: String, default: '' },

    initiatedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    initiatedByName: { type: String, default: '' },
    initiatedByEmail: { type: String, default: '' },
    confirmedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    confirmedByName: { type: String, default: '' },
    confirmedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ organizationId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export const PlatformPayment =
  mongoose.models.PlatformPayment ||
  mongoose.model('PlatformPayment', paymentSchema);
export default PlatformPayment;
