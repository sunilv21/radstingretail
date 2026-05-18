import mongoose from 'mongoose';

const productUnitSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    serialNo: { type: String, required: true },
    status: {
      type: String,
      enum: ['in_stock', 'sold', 'returned', 'damaged'],
      default: 'in_stock',
      index: true,
    },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null },
    soldAt: Date,
    warrantyStartsAt: Date,
    warrantyExpiresAt: Date,
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

productUnitSchema.index({ storeId: 1, serialNo: 1 }, { unique: true });
productUnitSchema.index({ storeId: 1, productId: 1, status: 1 });

export const ProductUnit = mongoose.models.ProductUnit || mongoose.model('ProductUnit', productUnitSchema);
export default ProductUnit;
