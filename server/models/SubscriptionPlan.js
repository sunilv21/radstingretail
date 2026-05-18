import mongoose from 'mongoose';

/**
 * Mirror of the admin-portal SubscriptionPlan model. Both apps point at
 * the same MongoDB collection (`subscriptionplans`); the tenant repo
 * only ever reads. Authoring happens in the vendor portal.
 *
 * Schema kept in lockstep with POS system-admin/server/models/SubscriptionPlan.js
 * — if a field is added there, mirror it here so the tenant view shows it.
 */
const subscriptionPlanSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    tier: {
      type: String,
      enum: ['free', 'starter', 'pro', 'enterprise', 'custom'],
      default: 'custom',
    },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'half_yearly', 'yearly', '2year', 'lifetime'],
      default: 'monthly',
    },
    effectiveMonthlyAmount: { type: Number, default: 0 },
    trialDays: { type: Number, default: null, min: 0, max: 365 },
    limits: {
      stores: { type: Number, default: null },
      warehouses: { type: Number, default: null },
      users: {
        admin: { type: Number, default: null },
        manager: { type: Number, default: null },
        cashier: { type: Number, default: null },
        accountant: { type: Number, default: null },
        ca: { type: Number, default: null },
      },
    },
    features: { type: [String], default: [] },
    paymentUrl: { type: String, default: '' },
    savingsLabel: { type: String, default: '' },
    paymentMethods: {
      upi: { type: Boolean, default: true },
      card: { type: Boolean, default: false },
      netbanking: { type: Boolean, default: false },
      bankTransfer: { type: Boolean, default: true },
      manual: { type: Boolean, default: true },
    },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ||
  mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
export default SubscriptionPlan;
