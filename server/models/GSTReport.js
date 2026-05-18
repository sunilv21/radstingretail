import mongoose from 'mongoose';

/**
 * Denormalized per-period aggregate used by the reporting UI. Kept as a cache
 * — on-demand recomputation from sales/purchases is authoritative.
 */
const gstReportSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    period: { type: String, required: true }, // 'YYYY-MM'
    reportType: { type: String, enum: ['GSTR1', 'GSTR3B'], required: true },
    b2bSales: { type: Array, default: [] },
    b2cSales: { type: Array, default: [] },
    purchaseITC: { type: Array, default: [] },
    summary: {
      totalOutputGST: Number,
      totalInputITC: Number,
      netGSTPayable: Number,
    },
    status: { type: String, enum: ['draft', 'filed'], default: 'draft' },
    generatedAt: Date,
  },
  { timestamps: true },
);

gstReportSchema.index({ storeId: 1, period: 1, reportType: 1 }, { unique: true });

export const GSTReport = mongoose.models.GSTReport || mongoose.model('GSTReport', gstReportSchema);
export default GSTReport;
