import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
  },
  { _id: false },
);

const whatsappSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    // Send provider. 'meta' = Meta WhatsApp Cloud API (default for back-compat
    // with all the existing phoneNumberId/accessToken fields below).
    // 'twilio' = Twilio's WhatsApp REST API (uses accountSid/authToken +
    // a 'whatsapp:+...' from-number). When disabled and no provider is
    // configured, the WhatsApp button in POS falls back to opening wa.me.
    provider: { type: String, enum: ['meta', 'twilio'], default: 'meta' },

    // ── Meta Cloud API fields ─────────────────────────────────────────
    phoneNumberId: { type: String, default: '' },
    businessAccountId: { type: String, default: '' },
    accessToken: { type: String, default: '' },
    apiVersion: { type: String, default: 'v21.0' },

    // ── Twilio fields ─────────────────────────────────────────────────
    // Twilio Console → Account → API keys & tokens.
    twilioAccountSid: { type: String, default: '' },
    twilioAuthToken: { type: String, default: '' },
    // The WhatsApp-enabled sender, e.g. '+14155238886' (Twilio sandbox)
    // or your purchased / approved business number. Stored without the
    // 'whatsapp:' prefix; the service prepends it at send time.
    twilioFromNumber: { type: String, default: '' },
    // Twilio uses a Content SID (HX…) for approved template messages.
    twilioContentSid: { type: String, default: '' },

    // ── Shared ───────────────────────────────────────────────────────
    defaultCountryCode: { type: String, default: '91' },
    messageTemplate: { type: String, default: '' },
    templateLanguage: { type: String, default: 'en' },
    appSecret: { type: String, default: '' },
    verifyToken: { type: String, default: '' },
    webhookStatus: {
      lastEventAt: String,
      lastEventType: String,
      eventsReceived: { type: Number, default: 0 },
      lastError: String,
    },
    verifiedProfile: {
      verifiedName: String,
      displayPhoneNumber: String,
      qualityRating: String,
      codeVerificationStatus: String,
      platformType: String,
      nameStatus: String,
      verifiedAt: String,
    },
    testLog: [
      {
        to: String,
        status: String,
        messageId: String,
        whatsappPhone: String,
        error: String,
        errorCode: String,
        sentAt: String,
        sentBy: String,
      },
    ],
  },
  { _id: false },
);

const storeSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    name: { type: String, required: true },
    /**
     * Location kind. Drives plan-limit accounting (stores and warehouses
     * have separate caps on the Pro plan). Defaults to 'store' for
     * backwards-compat with existing rows.
     */
    type: { type: String, enum: ['store', 'warehouse'], default: 'store', index: true },
    code: String,
    address: { type: addressSchema, default: () => ({}) },
    gstNumber: String,
    // Whether this branch is GST-registered. Drives invoice formatting,
    // GSTR-1 inclusion, and whether tax is charged on sales. Default true
    // so legacy stores with a GSTIN continue to behave as before.
    gstRegistered: { type: Boolean, default: true },
    stateCode: { type: String, default: '07' },
    phone: String,
    email: String,
    logoUrl: String,
    invoicePrefix: { type: String, default: 'INV' },
    invoiceCounter: { type: Number, default: 0 },
    // UPI VPA for embedded payment links in reminders. Format: <name>@<bank>
    // e.g. "radstingstore@hdfcbank". Empty disables payment-link injection.
    upiId: { type: String, default: '' },
    poCounter: { type: Number, default: 0 },
    grnCounter: { type: Number, default: 0 },
    creditNoteCounter: { type: Number, default: 0 },
    debitNoteCounter: { type: Number, default: 0 },
    voucherCounters: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    settings: {
      allowNegativeStock: { type: Boolean, default: false },
      defaultGSTMode: { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' },
      printCopies: { type: Number, default: 1 },
      enableLoyalty: { type: Boolean, default: false },
      loyaltyRate: { type: Number, default: 0 },
      // Free-text printed under the totals on every invoice. Common use:
      // "Thank you for your business. Goods once sold cannot be returned."
      invoiceFooter: { type: String, default: '' },
      // Default values applied when a new product is created from the inventory
      // form. Per-product overrides still take precedence.
      defaultLowStockThreshold: { type: Number, default: 5 },
      defaultWarrantyMonths: { type: Number, default: 0 },
      // Aging-bucket cutoffs (days) for the collections / aging report. The
      // last bucket is always "older than the last cutoff". Default matches
      // typical SMB practice: 0–30, 31–60, 61–90, 90+.
      agingBuckets: { type: [Number], default: [30, 60, 90] },
      // ₹ amount above which an e-way bill is statutorily required. Default
      // matches the central GST rule. State-specific overrides may differ.
      eWayBillThreshold: { type: Number, default: 50000 },
      // ₹ amount above which a B2C sale to an unregistered customer goes into
      // the GSTR-1 "B2C Large" bucket (state-wise breakup). Below it stays
      // in the consolidated B2C bucket.
      b2cLargeThreshold: { type: Number, default: 250000 },
    },
    whatsapp: { type: whatsappSchema, default: () => ({}) },
    // E-invoice / e-way bill provider config — pluggable across NIC IRP direct,
    // any licensed GSP (ClearTax, Masters India, Avalara, Tally Signer, …),
    // or a Mock provider that returns simulated IRNs for local testing.
    eInvoice: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, enum: ['mock', 'nic', 'gsp'], default: 'mock' },
      environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
      gstin: String, // store GSTIN registered with the provider
      username: String,
      password: String, // masked in API responses
      clientId: String,
      clientSecret: String, // masked
      baseUrl: String, // GSP-specific origin (no trailing slash)
      /**
       * Configurable endpoint paths — each GSP exposes the same NIC API at a
       * different path. Defaults match OAuth2 / NIC conventions; merchants
       * override these to whatever their GSP docs say.
       */
      authPath: { type: String, default: '/auth/token' },
      generatePath: { type: String, default: '/einvoice/generate' },
      cancelPath: { type: String, default: '/einvoice/cancel' },
      ewbGeneratePath: { type: String, default: '/ewaybill/generate' },
      ewbCancelPath: { type: String, default: '/ewaybill/cancel' },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

storeSchema.index({ code: 1 }, { unique: true, sparse: true });

export const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);
export default Store;
