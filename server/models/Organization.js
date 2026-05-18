import mongoose from 'mongoose';

/**
 * Top-of-tree tenant. One Organization owns many Stores, which in turn own
 * everything else (sales, products, ledger entries, …). Most queries don't
 * actually look at organizationId — they scope by storeId — but it lets us
 * answer "give me everything across every branch I own" without a join.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Owner — the user who first created the org (their store admin). */
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Subscription tier — drives feature gates + per-tenant pricing. */
    plan: { type: String, enum: ['free', 'starter', 'pro', 'enterprise'], default: 'free' },
    /** Optional org-level GSTIN / PAN if the owner wants central reporting. */
    centralGstin: { type: String, default: '' },
    pan: { type: String, default: '' },
    /**
     * Required HSN digit count on every product. Per CBIC rules:
     *   - aggregate turnover < ₹5Cr  → 4 digits mandatory (B2B)
     *   - aggregate turnover ≥ ₹5Cr  → 6 digits mandatory
     *   - exports                    → 8 digits
     * Default 4 fits most SMBs; bump to 6 once the org crosses ₹5Cr. The
     * value is enforced server-side in product.service.js on every save.
     */
    hsnDigitsRequired: { type: Number, enum: [4, 6, 8], default: 4 },
    /** Vendor-controlled hard-block. False ≡ blocked, regardless of dates. */
    isActive: { type: Boolean, default: true },
    /**
     * --- Subscription lifecycle ---
     * The vendor sets `trialEndsAt` when onboarding a tenant. As long as
     * `now < trialEndsAt` the tenant is in 'trial'. Once they pay, the
     * vendor sets `subscriptionEndsAt` (next renewal date) and the status
     * flips to 'active'. After that date passes the tenant is 'expired'
     * and the API rejects writes with HTTP 402 until the vendor extends
     * `subscriptionEndsAt` or upgrades the plan.
     */
    trialEndsAt: { type: Date, default: null },
    subscriptionStartedAt: { type: Date, default: null },
    subscriptionEndsAt: { type: Date, default: null },
    /** Monthly recurring revenue from this tenant (₹). Drives vendor MRR. */
    monthlyAmount: { type: Number, default: 0 },
    /** Free-text vendor note for support context. */
    vendorNote: { type: String, default: '' },
    /**
     * Custom plan limits — used ONLY when plan === 'enterprise'. Vendor sets
     * these from the admin portal so an enterprise customer can have any
     * combination of store / warehouse / per-role user caps. Ignored for
     * the fixed-tier plans (free / starter / pro).
     */
    customLimits: {
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
    /**
     * Optional per-tenant reminder copy. Empty strings fall through to the
     * default messages defined in the SubscriptionReminder component.
     * Use {days}, {plan}, {orgName} placeholders.
     */
    reminderTemplate: {
      trial: { type: String, default: '' },
      expiringSoon: { type: String, default: '' },
    },
    /**
     * Time-bound paid user-slot grants. Each entry is one `user_addon`
     * purchase — slots are added to the effective cap only while
     * `expiresAt > now`, so a tenant who paid for a monthly addon
     * loses it after a month while a yearly addon survives 12 months.
     *
     * Stays in lockstep with POS system-admin/server/models/Organization.js.
     */
    userAddons: [
      {
        role: {
          type: String,
          enum: ['admin', 'manager', 'cashier', 'accountant', 'ca'],
          required: true,
        },
        quantity: { type: Number, required: true, min: 1 },
        cycleMonths: { type: Number, required: true, min: 1 },
        startsAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true, index: true },
        amountPaid: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' },
        paymentReference: { type: String, default: '' },
        addedBy: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true },
);

export const Organization =
  mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
export default Organization;
