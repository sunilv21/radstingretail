import { Router } from 'express';
import mongoose from 'mongoose';
import Supplier from '../models/Supplier.js';
import Store from '../models/Store.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Purchase from '../models/Purchase.js';
import { ok, AppError } from '../utils/response.js';

const router = Router();

/**
 * Aggregate per-supplier PO rollup: PO count, value of goods actually
 * received (sum of GRN receipt totals — same logic as lib/purchase-utils
 * poReceivedValue), and amount paid. Cancelled POs excluded. Used by the
 * Suppliers list page to show Outstanding | Paid | Left at a glance.
 */
async function buildSupplierRollups(storeId) {
  const purchases = await Purchase.find({
    storeId,
    status: { $ne: 'cancelled' },
  })
    .select({ supplierId: 1, amountPaid: 1, receiptRefs: 1, status: 1, grandTotal: 1 })
    .lean();
  const rollups = new Map();
  for (const p of purchases) {
    const key = String(p.supplierId);
    const slot = rollups.get(key) || { poCount: 0, purchased: 0, paid: 0 };
    slot.poCount += 1;
    // receivedValue mirrors the frontend poReceivedValue helper — sum of
    // GRN totals, falling back to grandTotal for legacy 'received' POs
    // that pre-date receipt tracking.
    const refs = p.receiptRefs || [];
    let received = 0;
    if (refs.length) {
      for (const r of refs) received += Number(r.total || 0);
    } else if (p.status === 'received' || p.status === 'closed') {
      received = Number(p.grandTotal || 0);
    }
    slot.purchased += received;
    slot.paid += Number(p.amountPaid || 0);
    rollups.set(key, slot);
  }
  // Round once at the end to avoid accumulated rounding drift.
  for (const slot of rollups.values()) {
    slot.purchased = Number(slot.purchased.toFixed(2));
    slot.paid = Number(slot.paid.toFixed(2));
  }
  return rollups;
}

router.get('/', async (req, res, next) => {
  try {
    const [rows, rollups] = await Promise.all([
      Supplier.find({ storeId: req.user.storeId }).sort({ name: 1 }).lean(),
      buildSupplierRollups(req.user.storeId),
    ]);
    // Splice rollup numbers onto each supplier row. Outstanding stays as
    // the live `outstandingBalance` field (maintained by GRN + payment),
    // which is more accurate than re-deriving from purchased − paid (it
    // also reflects manual adjustments / returns).
    const enriched = rows.map((s) => {
      const r = rollups.get(String(s._id)) || { poCount: 0, purchased: 0, paid: 0 };
      return {
        ...s,
        poCount: r.poCount,
        purchasedValue: r.purchased,
        paidValue: r.paid,
      };
    });
    res.json(ok(enriched));
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
