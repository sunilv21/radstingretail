import mongoose from 'mongoose';

/**
 * Mirror of the admin-portal PlatformSettings model. Singleton in the
 * shared MongoDB collection — the tenant repo only ever reads from it
 * via /api/public/platform-settings. Authoring happens in the vendor
 * admin portal (POS system-admin).
 *
 * Schema kept in lockstep with
 * POS system-admin/server/models/PlatformSettings.js — change one,
 * change both.
 */
const platformSettingsSchema = new mongoose.Schema(
  {
    paymentGateway: {
      url: { type: String, default: '' },
      provider: {
        type: String,
        enum: ['razorpay', 'stripe', 'cashfree', 'paytm', 'phonepe', 'upi', 'custom', 'manual'],
        default: 'custom',
      },
      currency: { type: String, default: 'INR' },
      mode: { type: String, enum: ['live', 'test'], default: 'live' },
      phonepe: {
        merchantId: { type: String, default: '' },
        saltKey: { type: String, default: '' },
        saltIndex: { type: Number, default: 1, min: 1, max: 10 },
        environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
      },
      upi: {
        vpa: { type: String, default: '' },
        payeeName: { type: String, default: '' },
      },
      razorpay: {
        keyId: { type: String, default: '' },
        keySecret: { type: String, default: '' },
        webhookSecret: { type: String, default: '' },
        mode: { type: String, enum: ['test', 'live'], default: 'test' },
      },
    },
    vendorContact: {
      whatsapp: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      website: { type: String, default: '' },
    },
    brand: {
      vendorName: { type: String, default: '' },
      supportHours: { type: String, default: '' },
    },
    userAddon: {
      pricePerUser: { type: Number, default: 199 },
      currency: { type: String, default: 'INR' },
      description: {
        type: String,
        default: 'Add an extra user slot at any time. Slot is added once your payment is confirmed.',
      },
    },
  },
  { timestamps: true },
);

export const PlatformSettings =
  mongoose.models.PlatformSettings ||
  mongoose.model('PlatformSettings', platformSettingsSchema);
export default PlatformSettings;
