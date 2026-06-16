import mongoose from 'mongoose';

/**
 * Monotonic sequence counters, one document per (storeId, docType).
 *
 * Backs the range-pre-allocation numbering used for high-throughput invoice
 * generation: a worker atomically claims a BLOCK of sequence values with a
 * single `$inc`, then hands them out from memory — so the per-store hot-doc
 * contention that used to live inside the sale transaction is gone.
 *
 * `seq` is the highest value claimed so far. A claim of BLOCK reserves
 * (seq-BLOCK+1 … seq).
 */
const counterSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    docType: { type: String, required: true }, // 'invoice' | 'po' | 'grn' | 'CN' | ...
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

counterSchema.index({ storeId: 1, docType: 1 }, { unique: true });

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
export default Counter;
