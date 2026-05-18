/**
 * Platform sub-router: PlatformPayment vendor inbox.
 * Mounted at `/api/platform/payments/*`. Inherits `requireSuperAdmin`.
 *
 * Tenants initiate intents on /api/billing (platform-payments.routes.js).
 * This surface lets the vendor confirm / reject / record manual payments
 * and view the full ledger of recorded transactions.
 */
import { Router } from 'express';
import PlatformPayment from '../../models/PlatformPayment.js';
import Organization from '../../models/Organization.js';
import { ok, AppError } from '../../utils/response.js';
import { applyPlatformPaymentEffects } from '../../utils/applyPlatformPaymentEffects.js';

const router = Router();

const ALLOWED_STATUSES = [
  'pending',
  'awaiting_confirmation',
  'completed',
  'rejected',
  'cancelled',
];

function publicPayment(p) {
  const o = p.toObject ? p.toObject() : p;
  return {
    id: o._id,
    organizationId: o.organizationId,
    organizationName: o.organizationName || '',
    reference: o.reference,
    type: o.type,
    planCode: o.planCode || '',
    planName: o.planName || '',
    cycleMonths: o.cycleMonths ?? 1,
    addonRole: o.addonRole || null,
    addonQuantity: o.addonQuantity ?? 0,
    amount: o.amount ?? 0,
    currency: o.currency || 'INR',
    status: o.status,
    gatewayProvider: o.gatewayProvider || '',
    gatewayUrl: o.gatewayUrl || '',
    gatewayReference: o.gatewayReference || '',
    tenantNote: o.tenantNote || '',
    vendorNote: o.vendorNote || '',
    initiatedByName: o.initiatedByName || '',
    initiatedByEmail: o.initiatedByEmail || '',
    confirmedByName: o.confirmedByName || '',
    confirmedAt: o.confirmedAt || null,
    paidAt: o.paidAt || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function buildSummary(rows) {
  const s = {
    pending: 0,
    awaiting_confirmation: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0,
    totalCollected: 0,
  };
  for (const r of rows) {
    if (s[r.status] !== undefined) s[r.status] += 1;
    if (r.status === 'completed') s.totalCollected += Number(r.amount || 0);
  }
  return s;
}

/** LIST — supports ?status=... and ?limit=N. Always returns summary. */
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const filter = status && ALLOWED_STATUSES.includes(status) ? { status } : {};

    const [rows, allForSummary] = await Promise.all([
      PlatformPayment.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      PlatformPayment.find({}).select('status amount').lean(),
    ]);

    res.json(
      ok({
        payments: rows.map(publicPayment),
        summary: buildSummary(allForSummary),
      }),
    );
  } catch (err) {
    next(err);
  }
});

/** GET one — full detail. */
router.get('/:id', async (req, res, next) => {
  try {
    const p = await PlatformPayment.findById(req.params.id);
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    res.json(ok(publicPayment(p)));
  } catch (err) {
    next(err);
  }
});

/**
 * CREATE — vendor manually records a payment (e.g. cash deposit, NEFT
 * outside the gateway). Status defaults to 'completed' unless overridden.
 * Optionally applies the subscription / addon entitlement immediately.
 */
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.organizationId) {
      throw new AppError('VALIDATION_ERROR', 'organizationId is required', 400);
    }
    if (!(Number(body.amount) > 0)) {
      throw new AppError('VALIDATION_ERROR', 'amount must be > 0', 400);
    }
    const org = await Organization.findById(body.organizationId);
    if (!org) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);

    const ref =
      body.reference ||
      `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payment = await PlatformPayment.create({
      organizationId: org._id,
      organizationName: org.name,
      reference: ref,
      type: body.type || 'manual',
      planCode: body.planCode || '',
      planName: body.planName || '',
      cycleMonths: Number(body.cycleMonths) || 1,
      addonRole: body.addonRole || null,
      addonQuantity: Number(body.addonQuantity) || 0,
      amount: Number(body.amount),
      currency: body.currency || 'INR',
      status: ALLOWED_STATUSES.includes(body.status) ? body.status : 'completed',
      gatewayProvider: body.gatewayProvider || 'manual',
      gatewayReference: body.gatewayReference || '',
      tenantNote: body.tenantNote || '',
      vendorNote: body.vendorNote || '',
      initiatedByName: body.initiatedByName || 'Vendor',
      initiatedByEmail: body.initiatedByEmail || '',
      confirmedByName: req.user?.name || req.user?.email || 'Vendor',
      confirmedAt: body.status === 'completed' ? new Date() : null,
      paidAt: body.status === 'completed' ? new Date() : null,
    });

    if (payment.status === 'completed') {
      await applyPlatformPaymentEffects(payment).catch((e) => {
        // Non-fatal — log and continue; vendor can re-confirm.
        console.warn('[platform/payments] applyEffects failed:', e?.message);
      });
    }
    res.status(201).json(ok(publicPayment(payment)));
  } catch (err) {
    next(err);
  }
});

/** CONFIRM — flips status to 'completed' and applies entitlement. */
router.put('/:id/confirm', async (req, res, next) => {
  try {
    const p = await PlatformPayment.findById(req.params.id);
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (p.status === 'completed') {
      throw new AppError('PAYMENT_ALREADY_COMPLETED', 'Already confirmed', 400);
    }
    p.status = 'completed';
    p.confirmedAt = new Date();
    p.paidAt = p.paidAt || new Date();
    p.confirmedByName = req.user?.name || req.user?.email || 'Vendor';
    if (req.body?.vendorNote) p.vendorNote = String(req.body.vendorNote);
    if (req.body?.gatewayReference) p.gatewayReference = String(req.body.gatewayReference);
    await p.save();
    await applyPlatformPaymentEffects(p).catch((e) => {
      console.warn('[platform/payments] applyEffects failed:', e?.message);
    });
    res.json(ok(publicPayment(p)));
  } catch (err) {
    next(err);
  }
});

/** REJECT — flips status to 'rejected' with optional vendor note. */
router.put('/:id/reject', async (req, res, next) => {
  try {
    const p = await PlatformPayment.findById(req.params.id);
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (p.status === 'completed') {
      throw new AppError(
        'PAYMENT_ALREADY_COMPLETED',
        'Cannot reject a completed payment',
        400,
      );
    }
    p.status = 'rejected';
    if (req.body?.vendorNote) p.vendorNote = String(req.body.vendorNote);
    p.confirmedByName = req.user?.name || req.user?.email || 'Vendor';
    p.confirmedAt = new Date();
    await p.save();
    res.json(ok(publicPayment(p)));
  } catch (err) {
    next(err);
  }
});

/** DELETE — only for pending / rejected / cancelled records. */
router.delete('/:id', async (req, res, next) => {
  try {
    const p = await PlatformPayment.findById(req.params.id);
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (p.status === 'completed') {
      throw new AppError(
        'PAYMENT_COMPLETED',
        'Cannot delete a completed payment — reverse the entitlement instead',
        400,
      );
    }
    await p.deleteOne();
    res.json(ok({ deleted: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
