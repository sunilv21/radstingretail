import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    type: { type: String, enum: ['in', 'out', 'adjustment', 'transfer'], required: true },
    quantity: { type: Number, required: true },
    previousStock: Number,
    newStock: Number,
    referenceType: { type: String, enum: ['sale', 'purchase', 'return', 'manual', 'transfer'] },
    referenceId: mongoose.Schema.Types.ObjectId,
    batchNumber: String,
    expiryDate: Date,
    reason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

stockMovementSchema.index({ storeId: 1, productId: 1, createdAt: -1 });

export const StockMovement = mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
