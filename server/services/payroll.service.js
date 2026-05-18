/**
 * Payroll service — employee CRUD + monthly payroll runs.
 *
 * Indian statutory math (simplified, accurate enough for SMB):
 *   PF (Provident Fund):
 *     - Employee: 12% of basic, capped at ₹15,000 basic ⇒ max ₹1,800/month
 *     - Employer: 12% of basic, same cap (8.33% goes to EPS, 3.67% to EPF — we don't split)
 *     - Applies if pfApplicable=true on the employee
 *
 *   ESI (Employee State Insurance):
 *     - Employee: 0.75% of gross
 *     - Employer: 3.25% of gross
 *     - Only applies if gross < ₹21,000/month
 *
 *   Professional Tax: state-specific, fixed monthly amount on the employee record
 *     (₹200/month is Maharashtra/Karnataka standard).
 *
 *   TDS: too rule-heavy for auto-compute (based on annual taxable income, slab,
 *     regime, exemptions) — we let the user enter monthly TDS on the employee.
 *
 * Filing returns to PF/ESIC/PT departments is manual / out of scope here.
 */

import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import Payslip from '../models/Payslip.js';
import Store from '../models/Store.js';
import Account from '../models/Account.js';
import AccountGroup from '../models/AccountGroup.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { AppError } from '../utils/response.js';

const round2 = (n) => Math.round(n * 100) / 100;
const PF_BASIC_CEILING = 15000; // monthly
const ESI_GROSS_CEILING = 21000;

function calculatePayslipMath({ salary, paidDays, workDaysInMonth, extraEarnings = {} }) {
  const ratio = workDaysInMonth > 0 ? paidDays / workDaysInMonth : 1;

  // Pro-rate every component by paid days
  const basic = round2((salary.basic || 0) * ratio);
  const hra = round2((salary.hra || 0) * ratio);
  const conveyance = round2((salary.conveyance || 0) * ratio);
  const medicalAllowance = round2((salary.medicalAllowance || 0) * ratio);
  const otherAllowances = round2((salary.otherAllowances || 0) * ratio);
  const overtime = Number(extraEarnings.overtime || 0);
  const bonus = Number(extraEarnings.bonus || 0);

  const gross = round2(basic + hra + conveyance + medicalAllowance + otherAllowances + overtime + bonus);

  // ---- Deductions ----
  const pfBase = Math.min(basic, PF_BASIC_CEILING * ratio);
  const pfEmployee = salary.pfApplicable ? round2(pfBase * 0.12) : 0;
  const pfEmployer = salary.pfApplicable ? round2(pfBase * 0.12) : 0;

  const esiApplies = salary.esiApplicable && gross < ESI_GROSS_CEILING * ratio + 0.01;
  const esiEmployee = esiApplies ? round2(gross * 0.0075) : 0;
  const esiEmployer = esiApplies ? round2(gross * 0.0325) : 0;

  const professionalTax = round2((salary.professionalTax || 0) * ratio);
  const tds = round2((salary.tds || 0) * ratio);
  const loanRecovery = Number(extraEarnings.loanRecovery || 0);
  const other = Number(extraEarnings.otherDeduction || 0);

  const totalDeductions = round2(pfEmployee + esiEmployee + professionalTax + tds + loanRecovery + other);
  const netSalary = round2(gross - totalDeductions);

  return {
    earnings: {
      basic, hra, conveyance, medicalAllowance, otherAllowances, overtime, bonus,
      gross,
    },
    deductions: {
      pfEmployee, esiEmployee, professionalTax, tds, loanRecovery, other,
      total: totalDeductions,
    },
    employerContribution: {
      pfEmployer, esiEmployer,
      total: round2(pfEmployer + esiEmployer),
    },
    netSalary,
  };
}

async function ensurePayrollAccounts(storeId, session) {
  // Auto-create the chart-of-accounts entries the payroll engine needs, if
  // they don't already exist. Idempotent — runs in O(1) per call.
  const groupNeeds = [
    { name: 'Direct Expenses', nature: 'expense' },
    { name: 'Indirect Expenses', nature: 'expense' },
    { name: 'Current Liabilities', nature: 'liability' },
  ];
  const groupMap = new Map();
  for (const g of groupNeeds) {
    let existing = await AccountGroup.findOne({ storeId, name: g.name }).session(session);
    if (!existing) {
      const top = await AccountGroup.findOne({ storeId, nature: g.nature, parentId: null }).session(session);
      existing = await AccountGroup.create([{ storeId, name: g.name, nature: g.nature, parentId: top?._id || null }], { session }).then(([d]) => d);
    }
    groupMap.set(g.name, existing._id);
  }

  const accountNeeds = [
    { name: 'Salary Expense', groupName: 'Direct Expenses' },
    { name: 'Employer PF Contribution', groupName: 'Direct Expenses' },
    { name: 'Employer ESI Contribution', groupName: 'Direct Expenses' },
    { name: 'PF Payable', groupName: 'Current Liabilities' },
    { name: 'ESI Payable', groupName: 'Current Liabilities' },
    { name: 'Professional Tax Payable', groupName: 'Current Liabilities' },
    { name: 'TDS Payable', groupName: 'Current Liabilities' },
    { name: 'Salary Payable', groupName: 'Current Liabilities' },
  ];
  const accIds = {};
  for (const a of accountNeeds) {
    let existing = await Account.findOne({ storeId, name: a.name }).session(session);
    if (!existing) {
      existing = await Account.create([{
        storeId, name: a.name, groupId: groupMap.get(a.groupName), openingBalance: 0,
      }], { session }).then(([d]) => d);
    }
    accIds[a.name] = existing._id;
  }
  return accIds;
}

async function postPayrollLedger({ storeId, payslip, accIds, userId, session }) {
  const e = payslip.earnings;
  const d = payslip.deductions;
  const ec = payslip.employerContribution;

  const entries = [
    // Dr Salary Expense (gross — what we incur as cost on the worker's pay)
    { type: 'debit', account: 'Salary Expense', accountType: 'expense', amount: e.gross, narration: `Salary ${payslip.payslipNumber}` },
    // Dr Employer PF (additional cost)
    ec.pfEmployer > 0
      ? { type: 'debit', account: 'Employer PF Contribution', accountType: 'expense', amount: ec.pfEmployer, narration: `Employer PF ${payslip.payslipNumber}` }
      : null,
    // Dr Employer ESI (additional cost)
    ec.esiEmployer > 0
      ? { type: 'debit', account: 'Employer ESI Contribution', accountType: 'expense', amount: ec.esiEmployer, narration: `Employer ESI ${payslip.payslipNumber}` }
      : null,
    // Cr the various payables
    d.pfEmployee + ec.pfEmployer > 0
      ? { type: 'credit', account: 'PF Payable', accountType: 'payable', amount: round2(d.pfEmployee + ec.pfEmployer), narration: `PF dues ${payslip.payslipNumber}` }
      : null,
    d.esiEmployee + ec.esiEmployer > 0
      ? { type: 'credit', account: 'ESI Payable', accountType: 'payable', amount: round2(d.esiEmployee + ec.esiEmployer), narration: `ESI dues ${payslip.payslipNumber}` }
      : null,
    d.professionalTax > 0
      ? { type: 'credit', account: 'Professional Tax Payable', accountType: 'payable', amount: d.professionalTax, narration: `PT ${payslip.payslipNumber}` }
      : null,
    d.tds > 0
      ? { type: 'credit', account: 'TDS Payable', accountType: 'payable', amount: d.tds, narration: `TDS ${payslip.payslipNumber}` }
      : null,
    // Cr Salary Payable (net — what's owed to the employee, cleared on payment)
    payslip.netSalary > 0
      ? { type: 'credit', account: 'Salary Payable', accountType: 'payable', amount: payslip.netSalary, narration: `Net pay ${payslip.payslipNumber} → ${payslip.employeeSnapshot.name}` }
      : null,
  ].filter(Boolean);

  for (const entry of entries) {
    await LedgerEntry.create([{
      storeId,
      entryType: entry.type,
      accountType: entry.accountType,
      accountId: accIds[entry.account],
      amount: entry.amount,
      referenceType: 'voucher',
      referenceId: payslip._id,
      narration: entry.narration,
      isAutoGenerated: true,
      createdBy: userId,
    }], { session });
  }
}

export const PayrollService = {
  async listEmployees({ storeId, includeInactive = false }) {
    const filter = { storeId };
    if (!includeInactive) filter.isActive = true;
    return Employee.find(filter).sort({ name: 1 }).lean();
  },

  async getEmployee({ storeId, id }) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('EMPLOYEE_NOT_FOUND', 'Employee not found', 404);
    const e = await Employee.findOne({ _id: id, storeId }).lean();
    if (!e) throw new AppError('EMPLOYEE_NOT_FOUND', 'Employee not found', 404);
    return e;
  },

  async createEmployee({ storeId, input, userId }) {
    if (!input.name || !input.employeeCode) {
      throw new AppError('VALIDATION_ERROR', 'name + employeeCode are required', 400);
    }
    const dupe = await Employee.findOne({ storeId, employeeCode: input.employeeCode });
    if (dupe) throw new AppError('CODE_DUPLICATE', `Employee code ${input.employeeCode} already exists`, 400);
    const e = await Employee.create({
      storeId,
      employeeCode: input.employeeCode,
      name: input.name,
      email: input.email || '',
      phone: input.phone || '',
      address: input.address || '',
      pan: (input.pan || '').toUpperCase(),
      aadhaar: input.aadhaar || '',
      bankAccount: input.bankAccount || '',
      bankIfsc: (input.bankIfsc || '').toUpperCase(),
      pfUan: input.pfUan || '',
      esiNumber: input.esiNumber || '',
      designation: input.designation || '',
      department: input.department || '',
      joinDate: input.joinDate ? new Date(input.joinDate) : new Date(),
      salary: {
        basic: Number(input.salary?.basic || 0),
        hra: Number(input.salary?.hra || 0),
        conveyance: Number(input.salary?.conveyance || 0),
        medicalAllowance: Number(input.salary?.medicalAllowance || 0),
        otherAllowances: Number(input.salary?.otherAllowances || 0),
        pfApplicable: input.salary?.pfApplicable !== false,
        esiApplicable: input.salary?.esiApplicable !== false,
        professionalTax: Number(input.salary?.professionalTax ?? 200),
        tds: Number(input.salary?.tds || 0),
      },
      isActive: true,
      createdBy: userId,
    });
    return e.toObject();
  },

  async updateEmployee({ storeId, id, input }) {
    const e = await Employee.findOne({ _id: id, storeId });
    if (!e) throw new AppError('EMPLOYEE_NOT_FOUND', 'Employee not found', 404);
    const top = ['name', 'email', 'phone', 'address', 'pan', 'aadhaar', 'bankAccount', 'bankIfsc', 'pfUan', 'esiNumber', 'designation', 'department', 'isActive'];
    for (const f of top) if (input[f] !== undefined) e[f] = input[f];
    if (input.exitDate !== undefined) e.exitDate = input.exitDate ? new Date(input.exitDate) : null;
    if (input.salary) {
      const s = e.salary || {};
      const fields = ['basic', 'hra', 'conveyance', 'medicalAllowance', 'otherAllowances', 'pfApplicable', 'esiApplicable', 'professionalTax', 'tds'];
      for (const f of fields) if (input.salary[f] !== undefined) s[f] = input.salary[f];
      e.salary = s;
      e.markModified('salary');
    }
    await e.save();
    return e.toObject();
  },

  /** Compute (without persisting) what a payslip would look like for an employee in a period. */
  previewPayslip({ employee, period, paidDays, extraEarnings }) {
    const [year, month] = period.split('-').map(Number);
    const workDaysInMonth = new Date(year, month, 0).getDate(); // last day of month
    const pd = paidDays !== undefined ? Number(paidDays) : workDaysInMonth;
    const math = calculatePayslipMath({
      salary: employee.salary || {},
      paidDays: pd,
      workDaysInMonth,
      extraEarnings,
    });
    return {
      period,
      workDaysInMonth,
      paidDays: pd,
      lopDays: workDaysInMonth - pd,
      ...math,
    };
  },

  /**
   * Run payroll for a period — creates payslips for all active employees in
   * one atomic transaction, posts the ledger, generates payslip numbers.
   */
  async runPayroll({ storeId, period, userId, paidDaysOverride }) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new AppError('VALIDATION_ERROR', 'period must be YYYY-MM', 400);
    }
    const employees = await Employee.find({ storeId, isActive: true }).lean();
    if (employees.length === 0) {
      throw new AppError('NO_EMPLOYEES', 'No active employees to process', 400);
    }
    // Block re-running if any payslip for this period already exists
    const existing = await Payslip.find({ storeId, period }).select('employeeId').lean();
    const existingIds = new Set(existing.map((p) => String(p.employeeId)));

    const session = await mongoose.startSession();
    try {
      let createdPayslips = [];
      await session.withTransaction(async () => {
        const accIds = await ensurePayrollAccounts(storeId, session);
        const store = await Store.findById(storeId).session(session);
        if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

        for (const emp of employees) {
          if (existingIds.has(String(emp._id))) continue; // skip already-paid employees
          const preview = PayrollService.previewPayslip({
            employee: emp,
            period,
            paidDays: paidDaysOverride,
          });

          // Generate payslip number — PSL-YYYY-MM-NNNN per period
          const seq = await Payslip.countDocuments({ storeId, period }).session(session);
          const payslipNumber = `PSL-${period}-${String(seq + 1).padStart(4, '0')}`;

          const [payslip] = await Payslip.create([{
            storeId,
            payslipNumber,
            employeeId: emp._id,
            employeeSnapshot: {
              employeeCode: emp.employeeCode,
              name: emp.name,
              designation: emp.designation,
              department: emp.department,
              pan: emp.pan,
              pfUan: emp.pfUan,
              esiNumber: emp.esiNumber,
              bankAccount: emp.bankAccount,
              bankIfsc: emp.bankIfsc,
            },
            period,
            workDaysInMonth: preview.workDaysInMonth,
            paidDays: preview.paidDays,
            lopDays: preview.lopDays,
            earnings: preview.earnings,
            deductions: preview.deductions,
            employerContribution: preview.employerContribution,
            netSalary: preview.netSalary,
            status: 'finalized',
            createdBy: userId,
          }], { session });

          await postPayrollLedger({ storeId, payslip: payslip.toObject(), accIds, userId, session });
          createdPayslips.push(payslip.toObject());
        }
      });
      return {
        period,
        created: createdPayslips.length,
        skipped: existingIds.size,
        payslips: createdPayslips,
      };
    } finally {
      await session.endSession();
    }
  },

  async listPayslips({ storeId, period, employeeId }) {
    const filter = { storeId };
    if (period) filter.period = period;
    if (employeeId && mongoose.isValidObjectId(employeeId)) filter.employeeId = employeeId;
    return Payslip.find(filter).sort({ period: -1, 'employeeSnapshot.name': 1 }).lean();
  },

  async getPayslip({ storeId, id }) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('PAYSLIP_NOT_FOUND', 'Payslip not found', 404);
    const p = await Payslip.findOne({ _id: id, storeId }).lean();
    if (!p) throw new AppError('PAYSLIP_NOT_FOUND', 'Payslip not found', 404);
    return p;
  },

  /** Mark payslip paid — closes the Salary Payable side with a Cash/Bank credit. */
  async markPayslipPaid({ storeId, id, paymentMode, paymentReference, userId }) {
    const session = await mongoose.startSession();
    try {
      let updated;
      await session.withTransaction(async () => {
        const p = await Payslip.findOne({ _id: id, storeId }).session(session);
        if (!p) throw new AppError('PAYSLIP_NOT_FOUND', 'Payslip not found', 404);
        if (p.status === 'paid') throw new AppError('ALREADY_PAID', 'Payslip is already marked paid', 400);

        const accIds = await ensurePayrollAccounts(storeId, session);
        const cashAcc = await Account.findOne({ storeId, name: 'Cash' }).session(session);
        if (!cashAcc) throw new AppError('COA_INCOMPLETE', 'Cash account missing — re-run bootstrap', 500);

        // Dr Salary Payable (clearing it) ← we owed this
        // Cr Cash/Bank                    ← we paid it
        await LedgerEntry.create([
          {
            storeId,
            entryType: 'debit',
            accountType: 'payable',
            accountId: accIds['Salary Payable'],
            amount: p.netSalary,
            referenceType: 'payment',
            referenceId: p._id,
            narration: `Salary disbursed: ${p.payslipNumber}`,
            isAutoGenerated: true,
            createdBy: userId,
          },
          {
            storeId,
            entryType: 'credit',
            accountType: paymentMode === 'bank' ? 'bank' : 'cash',
            accountId: cashAcc._id,
            amount: p.netSalary,
            referenceType: 'payment',
            referenceId: p._id,
            narration: `Cash/Bank outflow: salary ${p.payslipNumber}`,
            isAutoGenerated: true,
            createdBy: userId,
          },
        ], { session });

        p.status = 'paid';
        p.paidAt = new Date();
        p.paymentMode = paymentMode || 'bank';
        p.paymentReference = paymentReference || '';
        await p.save({ session });
        updated = p.toObject();
      });
      return updated;
    } finally {
      await session.endSession();
    }
  },
};
