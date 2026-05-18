import { Router } from 'express';
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import Store from '../models/Store.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { ok, AppError } from '../utils/response.js';
import { sendWhatsAppText } from '../services/whatsapp.service.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { q = '', limit = 200 } = req.query;
    const filter = { storeId: req.user.storeId };
    const term = String(q).trim();
    if (term) {
      // Picker autocomplete on the POS page hits this with a typed
      // term. Match name / phone / GSTIN / email — case-insensitive
      // for name + email, exact-substring for phone + GSTIN.
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: re },
        { phone: re },
        { gstNumber: re },
        { email: re },
      ];
    }
    const rows = await Customer.find(filter)
      .sort({ name: 1 })
      .limit(Math.max(1, Math.min(500, Number(limit) || 200)))
      .lean();
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    }
    const c = await Customer.findOne({ _id: req.params.id, storeId: req.user.storeId }).lean();
    if (!c) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    res.json(ok(c));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    }
    const c = await Customer.findOne({ _id: req.params.id, storeId: req.user.storeId }).lean();
    if (!c) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);

    const rows = await LedgerEntry.find({
      storeId: req.user.storeId,
      accountId: req.params.id,
    })
      .sort({ createdAt: 1 })
      .lean();

    let balance = 0;
    const withRunningBalance = rows.map((r) => {
      // For receivables: debit increases what they owe us, credit decreases.
      balance += r.entryType === 'debit' ? r.amount : -r.amount;
      return { ...r, runningBalance: Number(balance.toFixed(2)) };
    });
    res.json(ok({
      customer: c,
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
    const customer = await Customer.create({
      storeId: req.user.storeId,
      name: String(input.name).trim(),
      phone: input.phone || '',
      email: input.email || '',
      gstNumber: input.gstNumber || '',
      stateCode: input.stateCode || store?.stateCode || '07',
      address: input.address || '',
      outstandingBalance: 0,
    });
    res.status(201).json(ok(customer.toObject()));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    }
    const c = await Customer.findOne({ _id: req.params.id, storeId: req.user.storeId });
    if (!c) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    for (const f of ['name', 'phone', 'email', 'gstNumber', 'stateCode', 'address']) {
      if (req.body[f] !== undefined) c[f] = req.body[f];
    }
    await c.save();
    res.json(ok(c.toObject()));
  } catch (err) {
    next(err);
  }
});

/**
 * Send a payment reminder to the customer via WhatsApp Cloud API.
 * Reuses the existing WhatsApp credentials from store settings.
 * Body: { message: string, to?: string }  // 'to' overrides customer.phone
 */
router.post('/:id/remind', async (req, res, next) => {
  try {
    const c = await Customer.findOne({ _id: req.params.id, storeId: req.user.storeId }).lean();
    if (!c) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    const store = await Store.findById(req.user.storeId).lean();
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    const to = req.body?.to || c.phone;
    if (!to) {
      throw new AppError(
        'CUSTOMER_PHONE_MISSING',
        'No phone on this customer — capture phone in customer profile first',
        400,
      );
    }
    const message = String(req.body?.message || '').trim();
    if (!message) {
      throw new AppError('VALIDATION_ERROR', 'message is required', 400);
    }

    const result = await sendWhatsAppText({ store, to, message });
    res.json(ok({ ...result, sentTo: to }));
  } catch (err) {
    next(err);
  }
});

export default router;
