/**
 * Platform sub-router: subscription plan catalogue.
 * Mounted at `/api/platform/plans/*`. Inherits `requireSuperAdmin` from
 * the parent router (platform.routes.js).
 */
import { Router } from 'express';
import SubscriptionPlan from '../../models/SubscriptionPlan.js';
import { ok, AppError } from '../../utils/response.js';

const router = Router();

/** Shape returned to the admin frontend — matches SubscriptionPlanRow. */
function publicPlan(p) {
  const o = p.toObject ? p.toObject() : p;
  return {
    id: o._id,
    code: o.code,
    name: o.name,
    description: o.description || '',
    tier: o.tier,
    price: o.price ?? 0,
    currency: o.currency || 'INR',
    billingCycle: o.billingCycle || 'monthly',
    effectiveMonthlyAmount: o.effectiveMonthlyAmount ?? 0,
    trialDays: o.trialDays ?? null,
    limits: o.limits || { stores: null, warehouses: null, users: {} },
    features: Array.isArray(o.features) ? o.features : [],
    paymentUrl: o.paymentUrl || '',
    savingsLabel: o.savingsLabel || '',
    paymentMethods: o.paymentMethods || {
      upi: true,
      card: true,
      netbanking: true,
      bankTransfer: true,
      manual: false,
    },
    isActive: o.isActive !== false,
    isFeatured: !!o.isFeatured,
    displayOrder: o.displayOrder ?? 0,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/** LIST — every plan, ordered by displayOrder then createdAt. */
router.get('/', async (_req, res, next) => {
  try {
    const rows = await SubscriptionPlan.find({})
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    res.json(ok(rows.map(publicPlan)));
  } catch (err) {
    next(err);
  }
});

/** CREATE — code must be unique (case-insensitive). */
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.code || !body.name) {
      throw new AppError('VALIDATION_ERROR', 'code and name are required', 400);
    }
    const code = String(body.code).toLowerCase().trim();
    const dupe = await SubscriptionPlan.findOne({ code });
    if (dupe) throw new AppError('PLAN_CODE_DUPLICATE', `Plan code "${code}" already exists`, 409);

    const plan = await SubscriptionPlan.create({ ...body, code });
    res.status(201).json(ok(publicPlan(plan)));
  } catch (err) {
    next(err);
  }
});

/** UPDATE — partial; can't change `code` to one that conflicts. */
router.put('/:id', async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plan not found', 404);

    const body = req.body || {};
    if (body.code) {
      const code = String(body.code).toLowerCase().trim();
      if (code !== plan.code) {
        const dupe = await SubscriptionPlan.findOne({ code, _id: { $ne: plan._id } });
        if (dupe) {
          throw new AppError('PLAN_CODE_DUPLICATE', `Plan code "${code}" already exists`, 409);
        }
        plan.code = code;
      }
    }
    const editable = [
      'name', 'description', 'tier', 'price', 'currency', 'billingCycle',
      'effectiveMonthlyAmount', 'trialDays', 'limits', 'features',
      'paymentUrl', 'savingsLabel', 'paymentMethods', 'isActive',
      'isFeatured', 'displayOrder',
    ];
    for (const k of editable) {
      if (body[k] !== undefined) plan[k] = body[k];
    }
    await plan.save();
    res.json(ok(publicPlan(plan)));
  } catch (err) {
    next(err);
  }
});

/** DELETE — hard delete. */
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await SubscriptionPlan.deleteOne({ _id: req.params.id });
    if (r.deletedCount === 0) {
      throw new AppError('PLAN_NOT_FOUND', 'Plan not found', 404);
    }
    res.json(ok({ deleted: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
