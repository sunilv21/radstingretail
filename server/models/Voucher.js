import mongoose from 'mongoose';

const entrySchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    accountName: String,
    entryType: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const voucherSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    type: { type: String, enum: ['payment', 'receipt', 'journal', 'contra'], required: true },
    // Per-store sequential. Uniqueness enforced by the (storeId,
    // voucherNumber) compound index below — same fix we did for
    // Sale.invoiceNumber and Purchase.poNumber. Without it, two
    // stores in the same org both generating PMT-2026-00001 from
    // their independent voucherCounters would collide.
    voucherNumber: { type: String, required: true },
    date: { type: Date, default: Date.now },
    narration: String,
    entries: [entrySchema],
    totalAmount: Number,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

voucherSchema.index({ storeId: 1, voucherNumber: 1 }, { unique: true });
voucherSchema.index({ storeId: 1, type: 1, date: -1 });

export const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);
export default Voucher;
