import mongoose from 'mongoose';

const earningSchema = new mongoose.Schema(
  {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    medicalAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    gross: { type: Number, default: 0 },
  },
  { _id: false },
);

const deductionSchema = new mongoose.Schema(
  {
    pfEmployee: { type: Number, default: 0 }, // 12% of basic, employee side
    esiEmployee: { type: Number, default: 0 }, // 0.75% of gross, employee side
    professionalTax: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    loanRecovery: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const employerContributionSchema = new mongoose.Schema(
  {
    pfEmployer: { type: Number, default: 0 }, // 12% of basic, employer side
    esiEmployer: { type: Number, default: 0 }, // 3.25% of gross, employer side
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const payslipSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    payslipNumber: { type: String, required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeSnapshot: {
      employeeCode: String,
      name: String,
      designation: String,
      department: String,
      pan: String,
      pfUan: String,
      esiNumber: String,
      bankAccount: String,
      bankIfsc: String,
    },
    period: { type: String, required: true }, // 'YYYY-MM'
    workDaysInMonth: { type: Number, default: 30 },
    paidDays: { type: Number, default: 30 },
    lopDays: { type: Number, default: 0 },
    earnings: { type: earningSchema, default: () => ({}) },
    deductions: { type: deductionSchema, default: () => ({}) },
    employerContribution: { type: employerContributionSchema, default: () => ({}) },
    netSalary: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'finalized', 'paid'], default: 'finalized' },
    paidAt: Date,
    paymentMode: { type: String, enum: ['bank', 'cash', 'cheque'], default: 'bank' },
    paymentReference: String,
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

payslipSchema.index({ storeId: 1, employeeId: 1, period: 1 }, { unique: true });
payslipSchema.index({ storeId: 1, period: 1 });

export const Payslip = mongoose.models.Payslip || mongoose.model('Payslip', payslipSchema);
export default Payslip;
