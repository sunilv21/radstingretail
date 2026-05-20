import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    barcode: { type: String, index: true },
    qrCode: { type: String, default: '' },
    isSerialised: { type: Boolean, default: false },
    category: { type: String, default: 'General' },
    brand: String,
    unit: { type: String, default: 'pcs' },
    purchasePrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, required: true },
    mrp: { type: Number, default: 0 },
    gstRate: { type: Number, enum: [0, 5, 12, 18, 28], default: 18 },
    // When true, `sellingPrice` already INCLUDES GST (the listed/MRP-style
    // price). The billing engine then reverse-extracts tax instead of
    // adding it on top — preventing the "GST charged twice" bug. When
    // unset, the store's settings.defaultGSTMode decides the fallback.
    priceIncludesGst: { type: Boolean, default: false },
    hsnCode: { type: String, required: true },
    sacCode: String,
    taxType: { type: String, enum: ['GST', 'IGST', 'Exempt'], default: 'GST' },
    stock: { type: Number, default: 0 },
    minStock: { type: Number, default: 0 },
    maxStock: { type: Number, default: 0 },
    reorderQty: { type: Number, default: 0 },
    warrantyMonths: { type: Number, default: 0 },
    batchTracking: { type: Boolean, default: false },
    expiryTracking: { type: Boolean, default: false },
    imageUrl: String,
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

productSchema.index({ storeId: 1, sku: 1 }, { unique: true });
productSchema.index({ storeId: 1, barcode: 1 });
productSchema.index({ storeId: 1, stock: 1 });

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export default Product;
