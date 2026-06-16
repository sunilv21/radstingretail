import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: { name: String, sku: String, hsnCode: String },
    orderedQty: { type: Number, required: true },
    receivedQty: { type: Number, default: 0 },
    purchasePrice: Number,
    gstRate: Number,
    // When true, the purchasePrice quoted by the supplier already includes
    // GST. The PO line decomposes that gross figure into a taxable base +
    // CGST/SGST/IGST so ITC and supplier payable are computed correctly
    // instead of taxing an already-taxed price.
    priceIncludesGst: { type: Boolean, default: false },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    batchNumber: String,
    expiryDate: Date,
    taxableAmount: Number,
    totalTax: Number,
    totalAmount: Number,
  },
  { _id: false },
);

/**
 * Per-GRN ancillary expense — labour, packaging, freight, loading, etc.
 * Each line is one extra cost incurred at the time of receiving the goods.
 *
 *   - `includeInLandedCost: true`  → the cost is distributed across the
 *      line items in this GRN proportionally to their value, bumping the
 *      effective purchase price of each product. Use for freight, octroi,
 *      insurance — costs that genuinely belong to the goods.
 *
 *   - `includeInLandedCost: false` → the cost is posted as a standalone
 *      ledger expense (debit "Direct expenses / <type>", credit Cash/
 *      Bank/Supplier). Use for labour, loading — costs that are operating
 *      expenses, not stock value.
 */
const ancillaryExpenseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['labour', 'packaging', 'freight', 'octroi', 'loading', 'unloading', 'transport', 'insurance', 'customs', 'other'],
      required: true,
    },
    description: String,
    amount: { type: Number, required: true, min: 0 },
    includeInLandedCost: { type: Boolean, default: false },
    paidVia: { type: String, enum: ['cash', 'bank', 'upi', 'card', 'cheque', 'supplier'], default: 'cash' },
    paidTo: String,
  },
  { _id: false },
);

const receiptRefSchema = new mongoose.Schema(
  {
    grnNumber: String,
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: Number,
        purchasePrice: Number,
        gstRate: Number,
        priceIncludesGst: { type: Boolean, default: false },
        batchNumber: String,
        expiryDate: Date,
      },
    ],
    total: Number,
    /** Sum of ancillary expenses across the GRN — convenience aggregate. */
    ancillaryTotal: { type: Number, default: 0 },
    /** Lines as configured by the receiver. Persisted for audit + reporting. */
    ancillaryExpenses: { type: [ancillaryExpenseSchema], default: [] },
    receivedAt: Date,
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const purchaseSchema = new mongoose.Schema(
  {
    // Per-store sequential. Uniqueness enforced by the compound index
    // below — `(storeId, poNumber)` — so two stores in the same org can
    // each independently generate PO-2026-00001 without collision.
    poNumber: { type: String, required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierSnapshot: {
      name: String,
      phone: String,
      gstNumber: String,
      stateCode: String,
      address: String,
    },
    status: {
      type: String,
      enum: ['draft', 'ordered', 'partial', 'received', 'closed', 'cancelled', 'returned'],
      default: 'draft',
    },
    returnRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    items: [purchaseItemSchema],
    subtotal: Number,
    totalDiscount: { type: Number, default: 0 },
    totalTax: Number,
    grandTotal: Number,
    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
    amountPaid: { type: Number, default: 0 },
    // GST treatment — needed for proper GSTR-3B and ITC computation.
    reverseCharge: { type: Boolean, default: false },
    invoiceType: {
      type: String,
      enum: ['regular', 'sez_with_payment', 'sez_without_payment', 'import_of_goods', 'import_of_services', 'deemed_export'],
      default: 'regular',
    },
    receiptRefs: [receiptRefSchema],
    closedReason: String,
    closedAt: Date,
    dueDate: Date,
    expectedDate: Date,
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

purchaseSchema.index({ storeId: 1, poNumber: 1 }, { unique: true });
purchaseSchema.index({ storeId: 1, status: 1 });
purchaseSchema.index({ supplierId: 1, status: 1 });

export const Purchase = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
export default Purchase;
