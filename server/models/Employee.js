import mongoose from 'mongoose';

const salarySchema = new mongoose.Schema(
  {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    medicalAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    pfApplicable: { type: Boolean, default: true },
    esiApplicable: { type: Boolean, default: true },
    professionalTax: { type: Number, default: 200 }, // monthly, state-dependent (₹200 = Maharashtra/Karnataka standard)
    tds: { type: Number, default: 0 }, // user-entered monthly TDS
  },
  { _id: false },
);

const employeeSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    employeeCode: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    address: String,
    pan: { type: String, uppercase: true },
    aadhaar: String, // last 4 digits typically
    bankAccount: String,
    bankIfsc: { type: String, uppercase: true },
    pfUan: String, // Universal Account Number
    esiNumber: String,
    designation: String,
    department: String,
    joinDate: { type: Date, default: Date.now },
    exitDate: Date,
    salary: { type: salarySchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

employeeSchema.index({ storeId: 1, employeeCode: 1 }, { unique: true });
employeeSchema.index({ storeId: 1, isActive: 1 });

export const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
export default Employee;
