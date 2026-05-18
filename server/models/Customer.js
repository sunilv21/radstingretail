import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, index: true },
    email: { type: String, lowercase: true, trim: true },
    gstNumber: String,
    stateCode: { type: String, default: '' },
    address: String,
    creditLimit: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    loyaltyPoints: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

customerSchema.index({ storeId: 1, phone: 1 });

export const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
export default Customer;
