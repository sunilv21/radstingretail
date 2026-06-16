import { Router } from 'express';
import { ok } from '../utils/response.js';
import { PayrollService } from '../services/payroll.service.js';
import Employee from '../models/Employee.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.get('/employees', async (req, res, next) => {
  try {
    const includeInactive = req.query.all === 'true';
    res.json(ok(await PayrollService.listEmployees({ storeId: req.user.storeId, includeInactive })));
  } catch (err) { next(err); }
});

router.get('/employees/:id', async (req, res, next) => {
  try {
    res.json(ok(await PayrollService.getEmployee({ storeId: req.user.storeId, id: req.params.id })));
  } catch (err) { next(err); }
});

router.post('/employees', async (req, res, next) => {
  try {
    const e = await PayrollService.createEmployee({
      storeId: req.user.storeId,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(e));
  } catch (err) { next(err); }
});

router.put('/employees/:id', async (req, res, next) => {
  try {
    const e = await PayrollService.updateEmployee({
      storeId: req.user.storeId,
      id: req.params.id,
      input: req.body,
    });
    res.json(ok(e));
  } catch (err) { next(err); }
});

// Preview a payslip for one employee — returns computed math without persisting.
// Payslip preview computes but persists nothing — tag payroll:read so the
// POST→create default doesn't block manager/accountant from previewing.
router.post('/preview/:employeeId/:period', requirePermission('payroll', 'read'), async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.employeeId, storeId: req.user.storeId }).lean();
    if (!employee) {
      res.status(404).json({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' } });
      return;
    }
    res.json(ok(PayrollService.previewPayslip({
      employee,
      period: req.params.period,
      paidDays: req.body?.paidDays,
      extraEarnings: req.body?.extraEarnings,
    })));
  } catch (err) { next(err); }
});

// Run payroll for all active employees for a period
router.post('/run/:period', async (req, res, next) => {
  try {
    const result = await PayrollService.runPayroll({
      storeId: req.user.storeId,
      period: req.params.period,
      userId: req.user.id,
      paidDaysOverride: req.body?.paidDays,
    });
    res.status(201).json(ok(result));
  } catch (err) { next(err); }
});

router.get('/payslips', async (req, res, next) => {
  try {
    const { period, employeeId } = req.query;
    res.json(ok(await PayrollService.listPayslips({
      storeId: req.user.storeId,
      period,
      employeeId,
    })));
  } catch (err) { next(err); }
});

router.get('/payslips/:id', async (req, res, next) => {
  try {
    res.json(ok(await PayrollService.getPayslip({ storeId: req.user.storeId, id: req.params.id })));
  } catch (err) { next(err); }
});

router.post('/payslips/:id/mark-paid', async (req, res, next) => {
  try {
    const p = await PayrollService.markPayslipPaid({
      storeId: req.user.storeId,
      id: req.params.id,
      paymentMode: req.body?.paymentMode || 'bank',
      paymentReference: req.body?.paymentReference,
      userId: req.user.id,
    });
    res.json(ok(p));
  } catch (err) { next(err); }
});

export default router;
