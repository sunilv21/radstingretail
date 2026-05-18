import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['cash', 'bank'], default: 'cash' },
    accountNumber: String,
    ifsc: String,
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const BankAccount = mongoose.models.BankAccount || mongoose.model('BankAccount', bankAccountSchema);
export default BankAccount;
