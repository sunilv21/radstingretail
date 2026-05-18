import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true },
    phone: String,
    email: { type: String, lowercase: true, trim: true },
    gstNumber: String,
    stateCode: { type: String, default: '' },
    address: String,
    outstandingBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

supplierSchema.index({ storeId: 1, name: 1 });

export const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
export default Supplier;
