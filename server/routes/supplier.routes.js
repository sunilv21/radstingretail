import { Router } from 'express';
import mongoose from 'mongoose';
import Supplier from '../models/Supplier.js';
import Store from '../models/Store.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { ok, AppError } from '../utils/response.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await Supplier.find({ storeId: req.user.storeId }).sort({ name: 1 }).lean();
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);
    }
    const s = await Supplier.findOne({ _id: req.params.id, storeId: req.user.storeId }).lean();
    if (!s) throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);
    res.json(ok(s));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);
    }
    const s = await Supplier.findOne({ _id: req.params.id, storeId: req.user.storeId }).lean();
    if (!s) throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);

    const rows = await LedgerEntry.find({
      storeId: req.user.storeId,
      accountId: req.params.id,
    })
      .sort({ createdAt: 1 })
      .lean();

    let balance = 0;
    const withRunningBalance = rows.map((r) => {
      balance += r.entryType === 'credit' ? r.amount : -r.amount;
      return { ...r, runningBalance: Number(balance.toFixed(2)) };
    });
    res.json(ok({
      supplier: s,
      entries: withRunningBalance,
      currentBalance: Number(balance.toFixed(2)),
    }));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = req.body;
    if (!input.name) throw new AppError('VALIDATION_ERROR', 'Name is required', 400);
    const store = await Store.findById(req.user.storeId).lean();
    const supplier = await Supplier.create({
      storeId: req.user.storeId,
      name: String(input.name).trim(),
      phone: input.phone || '',
      email: input.email || '',
      gstNumber: input.gstNumber || '',
      stateCode: input.stateCode || store?.stateCode || '07',
      address: input.address || '',
      outstandingBalance: 0,
    });
    res.status(201).json(ok(supplier.toObject()));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);
    }
    const s = await Supplier.findOne({ _id: req.params.id, storeId: req.user.storeId });
    if (!s) throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);
    const fields = ['name', 'phone', 'email', 'gstNumber', 'stateCode', 'address'];
    for (const f of fields) if (req.body[f] !== undefined) s[f] = req.body[f];
    await s.save();
    res.json(ok(s.toObject()));
  } catch (err) {
    next(err);
  }
});

export default router;
