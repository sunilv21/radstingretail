import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      name: String,
      sku: String,
      barcode: String,
      hsnCode: String,
    },
    quantity: { type: Number, required: true },
    unit: String,
    sellingPrice: Number,
    basePrice: Number,
    discount: { type: Number, default: 0 },
    discountType: { type: String, enum: ['flat', 'percent'], default: 'flat' },
    discountAmount: { type: Number, default: 0 },
    taxableAmount: Number,
    gstRate: Number,
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    totalAmount: Number,
    // Serialised products: link to specific unit + its warranty
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductUnit' },
    serialNo: String,
    warrantyMonths: Number,
    warrantyExpiresAt: Date,
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['cash', 'upi', 'card', 'credit', 'loyalty'], required: true },
    amount: { type: Number, required: true },
    reference: String,
  },
  { _id: false },
);

const warrantyLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: String,
    sku: String,
    quantity: Number,
    warrantyMonths: Number,
    startsAt: Date,
    expiresAt: Date,
  },
  { _id: false },
);

const whatsappSendSchema = new mongoose.Schema(
  {
    to: String,
    messageId: String,
    sentAt: Date,
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    method: String,
    templateName: String,
    deliveryStatus: String,
    deliveryStatusAt: String,
    deliveryError: String,
  },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    // Per-store sequential. Uniqueness enforced by the (storeId, invoiceNumber)
    // compound index further down so each branch can independently issue
    // INV-2026-00001 without colliding with other branches in the org.
    invoiceNumber: { type: String, required: true },
    // Unguessable token backing the public bill URL. Unique so a generation
    // collision can never serve one customer's bill under another's link.
    shareToken: { type: String, unique: true, sparse: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerSnapshot: {
      name: String,
      phone: String,
      email: String,
      gstNumber: String,
      stateCode: String,
      address: String,
    },
    // Explicit place-of-supply (2-digit state code) — drives inter/intra-state
    // tax type. Snapshotted at sale time so historical sales don't drift if
    // the customer's state is later corrected.
    placeOfSupply: { type: String, default: '' },
    // Tax-treatment classification per the GST Offline Utility schema.
    // Determines which GSTR-1 section this invoice goes into.
    invoiceType: {
      type: String,
      enum: ['regular', 'sez_with_payment', 'sez_without_payment', 'export_with_payment', 'export_without_payment', 'deemed_export', 'nil_rated', 'exempt', 'non_gst'],
      default: 'regular',
    },
    exportDetails: {
      shippingBillNo: String,
      shippingBillDate: Date,
      portCode: String,
    },
    items: [saleItemSchema],
    subtotal: Number,
    totalDiscount: Number,
    totalTax: Number,
    roundOff: Number,
    grandTotal: Number,
    payments: [paymentSchema],
    amountPaid: Number,
    change: Number,
    paymentStatus: { type: String, enum: ['paid', 'partial', 'credit'], default: 'paid' },
    saleType: { type: String, enum: ['pos', 'order', 'credit'], default: 'pos' },
    status: { type: String, enum: ['completed', 'returned', 'voided'], default: 'completed' },
    hasWarranty: { type: Boolean, default: false },
    warranties: [warrantyLineSchema],
    whatsappSends: [whatsappSendSchema],
    returnRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    // E-invoice (IRN) — populated when GenerateIRN action is called.
    eInvoice: {
      irn: String,
      ackNo: String,
      ackDate: Date,
      signedQr: String, // long string — encoded JSON+sig
      status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
      provider: String,
      generatedAt: Date,
      cancelledAt: Date,
      cancelReason: String,
    },
    // E-way bill — for goods movement > ₹50K
    eWayBill: {
      ewbNumber: String,
      ewbDate: Date,
      validUpto: Date,
      vehicleNumber: String,
      transportMode: String,
      transporterId: String,
      status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
      provider: String,
      generatedAt: Date,
      cancelledAt: Date,
    },
    notes: String,
    // Client-generated UUID for sales rung up offline. The sync engine retries
    // until it sees a 2xx response — without idempotency, a request that
    // commits server-side but loses its response on a flaky network would
    // duplicate the sale. Deduped via a PARTIAL unique index (below).
    //
    // No `default: null` — a sparse/partial unique index still indexes a field
    // that is present-but-null, so defaulting to null made every keyless sale
    // collide on the second insert. The field must be ABSENT when there's no
    // key, hence no default and the partial filter on string type.
    idempotencyKey: { type: String },
    // Provenance for sales rung up OFFLINE and synced later: which device,
    // which offline session, and the wall-clock time the cashier actually
    // made the sale (vs. createdAt, which is when the server committed it on
    // sync). Strengthens the audit trail + outbox ownership. Absent for online sales.
    offlineMeta: {
      createdOfflineAt: Date,
      deviceId: String,
      offlineSessionId: String,
      userRef: String,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

saleSchema.index({ storeId: 1, invoiceNumber: 1 }, { unique: true });
saleSchema.index({ storeId: 1, createdAt: -1 });
saleSchema.index({ customerId: 1 });
saleSchema.index({ 'customerSnapshot.phone': 1, hasWarranty: 1 });
// Partial unique index: only sales that actually carry a string key are
// indexed, so multiple keyless (walk-in/online) sales never collide, while
// replayed offline sales (same UUID) are still deduped.
saleSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

export const Sale = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
export default Sale;
