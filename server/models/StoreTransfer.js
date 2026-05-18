import mongoose from 'mongoose';

const transferItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      name: String,
      sku: String,
      barcode: String,
      hsnCode: String,
    },
    requestedQty: { type: Number, required: true, min: 0 },
    dispatchedQty: { type: Number, default: 0 },
    receivedQty: { type: Number, default: 0 },
    /** Cost-basis snapshot at dispatch time, for valuation rollups. */
    costPrice: { type: Number, default: 0 },
  },
  { _id: false },
);

const storeTransferSchema = new mongoose.Schema(
  {
    /** Both stores belong to the same organization (validated server-side). */
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    fromStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    toStoreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    transferNumber: { type: String, required: true, unique: true },
    items: [transferItemSchema],
    status: {
      type: String,
      enum: ['requested', 'in_transit', 'received', 'cancelled'],
      default: 'requested',
    },
    notes: { type: String, default: '' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dispatchedAt: Date,
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receivedAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true },
);

storeTransferSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const StoreTransfer =
  mongoose.models.StoreTransfer || mongoose.model('StoreTransfer', storeTransferSchema);
export default StoreTransfer;
