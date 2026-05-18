/**
 * Tenant-side platform-payment endpoints. Mounted under `/api/billing`
 * and intentionally OUTSIDE the subscription guard — an expired
 * tenant has to be able to pay to renew without being 402'd.
 *
 *   POST   /api/billing/intent              create a pending payment, get redirect URL
 *   POST   /api/billing/intent/user-addon   shortcut for the extra-user flow
 *   GET    /api/billing/payments            list this org's payments
 *   GET    /api/billing/payments/:reference read one
 *   POST   /api/billing/payments/:reference/return   tenant returned from gateway
 *   POST   /api/billing/payments/:reference/cancel   tenant aborts before paying
 *
 * Vendor reads / confirms / rejects via the admin portal.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import PlatformPayment from '../models/PlatformPayment.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import PlatformSettings from '../models/PlatformSettings.js';
import Organization from '../models/Organization.js';
import { ok, AppError } from '../utils/response.js';
import { PhonePe } from '../services/phonepe.service.js';
import { Razorpay } from '../services/razorpay.service.js';
import { applyPlatformPaymentEffects } from '../utils/applyPlatformPaymentEffects.js';
import { invalidateOrgCache } from '../middleware/subscriptionGuard.js';

const router = Router();

const CYCLE_MONTHS = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
  '2year': 24,
  lifetime: 0,
};

function shortRef() {
  // 10-char base32-ish reference, e.g. PAY-7K3M9XQ4. Unique constraint
  // on the column will catch the (~impossible) collision; we retry once
  // before giving up.
  const raw = crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[-_]/g, 'A');
  return `PAY-${raw}`;
}

function ensureOrg(req) {
  if (!req.user?.organizationId) {
    throw new AppError(
      'NO_ORG',
      'This account is not linked to a tenant organisation',
      400,
    );
  }
  return req.user.organizationId;
}

function publicPayment(p) {
  return {
    id: p._id,
    reference: p.reference,
    organizationId: p.organizationId,
    organizationName: p.organizationName,
    type: p.type,
    planCode: p.planCode || '',
    planName: p.planName || '',
    cycleMonths: p.cycleMonths || 1,
    addonRole: p.addonRole || null,
    addonQuantity: p.addonQuantity || 0,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    gatewayProvider: p.gatewayProvider,
    gatewayUrl: p.gatewayUrl || '',
    gatewayReference: p.gatewayReference || '',
    tenantNote: p.tenantNote || '',
    vendorNote: p.vendorNote || '',
    initiatedByName: p.initiatedByName || '',
    confirmedByName: p.confirmedByName || '',
    confirmedAt: p.confirmedAt,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function appendOrgPlan(rawUrl, ref, params = {}) {
  if (!rawUrl) return rawUrl;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set('ref', ref);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

async function resolveGatewayUrl(plan) {
  if (plan?.paymentUrl) return { url: plan.paymentUrl, provider: 'custom' };
  const settings = await PlatformSettings.findOne({}).lean();
  if (settings?.paymentGateway?.url) {
    return {
      url: settings.paymentGateway.url,
      provider: settings.paymentGateway.provider || 'custom',
    };
  }
  return { url: '', provider: 'manual' };
}

/**
 * Origin used for backend callback URLs (PhonePe / Razorpay redirect
 * to /api/billing/callback/* which is served by Express). Trust
 * X-Forwarded-Host / X-Forwarded-Proto when behind a proxy; falls back
 * to the raw host header for local dev.
 */
function publicOrigin(req) {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

/**
 * Origin used for our own Next.js pages (UPI checkout at
 * `/pay/upi/<ref>`, dashboard return URLs, etc.). In production the
 * frontend and the API live on the same domain, so this collapses to
 * `publicOrigin(req)`. In local dev the frontend is on :3000 and the
 * backend on :5000, so we prefer NEXT_PUBLIC_APP_URL (already set in
 * .env for the Next.js client) to point at the right port.
 */
function frontendOrigin(req) {
  const explicit =
    process.env.PUBLIC_DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  return publicOrigin(req);
}

/**
 * Dispatch the payment-intent on the configured gateway provider and
 * replace the row's gatewayUrl with the provider-specific destination.
 *
 *   phonepe   →  PhonePe Standard Checkout API (server-to-server)
 *   razorpay  →  Razorpay Payment Link (server-to-server)
 *   upi       →  Direct UPI deep-link page hosted at /pay/upi/<ref>
 *   anything else → no-op (the static URL set on the row stays as-is)
 *
 * On any provider error the row stays in `pending` with no gatewayUrl
 * so the WhatsApp / mailto fallback in the tenant frontend kicks in.
 *
 * `payment` is a Mongoose doc — we mutate + save it.
 */
async function attachGatewayUrl({ payment, req, settings, plan }) {
  // A per-plan paymentUrl beats the global gateway, identical to the
  // resolveGatewayUrl precedence higher up.
  if (plan?.paymentUrl) return;

  const provider = settings?.paymentGateway?.provider || 'custom';
  if (provider === 'phonepe') {
    return attachPhonepeUrl({ payment, req, settings });
  }
  if (provider === 'razorpay') {
    return attachRazorpayUrl({ payment, req, settings });
  }
  if (provider === 'upi') {
    return attachUpiUrl({ payment, req, settings });
  }
  // 'custom' / 'manual' / 'stripe' / 'cashfree' / 'paytm' all use the
  // static URL chain that `/intent` already built before calling us.
}

async function attachPhonepeUrl({ payment, req, settings }) {
  const pp = settings?.paymentGateway?.phonepe || {};
  if (!pp.merchantId || !pp.saltKey) return;
  const amountPaise = Math.round(Number(payment.amount || 0) * 100);
  if (amountPaise <= 0) return;

  const origin = publicOrigin(req);
  const redirectUrl = `${origin}/api/billing/callback/phonepe/${payment.reference}`;
  const callbackUrl = `${origin}/api/billing/webhook/phonepe`;

  try {
    const session = await PhonePe.initiatePayment({
      amount: amountPaise,
      reference: payment.reference,
      tenantUserId: req.user.id,
      redirectUrl,
      callbackUrl,
      mobileNumber: req.user.phone,
    });
    payment.gatewayProvider = 'phonepe';
    payment.gatewayUrl = session.redirectUrl;
    await payment.save();
  } catch (err) {
    console.error('[phonepe] initiate failed:', err?.message, err?.details || err?.stack || '');
    payment.gatewayProvider = 'phonepe';
    payment.gatewayUrl = '';
    await payment.save();
  }
}

async function attachRazorpayUrl({ payment, req, settings }) {
  const rz = settings?.paymentGateway?.razorpay || {};
  if (!rz.keyId || !rz.keySecret) return;
  const amountPaise = Math.round(Number(payment.amount || 0) * 100);
  if (amountPaise <= 0) return;

  const origin = publicOrigin(req);
  // Razorpay redirects with ?razorpay_payment_id=...&razorpay_signature=...
  // appended to this URL. We verify + auto-confirm in the callback
  // route under billing-public.routes.js.
  const redirectUrl = `${origin}/api/billing/callback/razorpay/${payment.reference}`;

  try {
    const link = await Razorpay.createPaymentLink({
      amount: amountPaise,
      currency: payment.currency || 'INR',
      reference: payment.reference,
      description:
        payment.type === 'subscription'
          ? `${payment.planName || payment.planCode} renewal`
          : payment.type === 'user_addon'
            ? `Extra ${payment.addonQuantity} × ${payment.addonRole} user${payment.addonQuantity === 1 ? '' : 's'}`
            : `Payment ${payment.reference}`,
      redirectUrl,
      customer: {
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone,
      },
    });
    payment.gatewayProvider = 'razorpay';
    payment.gatewayUrl = link.shortUrl;
    payment.gatewayReference = link.id; // store the plink_xxx id for status checks
    await payment.save();
  } catch (err) {
    console.error('[razorpay] payment-link failed:', err?.message, err?.details || err?.stack || '');
    payment.gatewayProvider = 'razorpay';
    payment.gatewayUrl = '';
    await payment.save();
  }
}

async function attachUpiUrl({ payment, req, settings }) {
  const upi = settings?.paymentGateway?.upi || {};
  if (!upi.vpa) return; // no VPA → fall through to fallback chain

  // Send the tenant to a Next.js page that renders the QR + deep
  // link. Public URL (no auth) so they can also share the link with
  // someone else who'll pay on their behalf.
  //
  // The page reads /api/public/billing/upi/<ref> for the data it
  // needs (amount, vpa, payee name) so we keep the URL itself short
  // and shareable.
  //
  // Use frontendOrigin (NOT publicOrigin) — `/pay/upi/<ref>` is a
  // Next.js route. In local dev that's :3000, while the API runs
  // on :5000.
  const origin = frontendOrigin(req);
  const url = `${origin}/pay/upi/${payment.reference}`;
  payment.gatewayProvider = 'upi';
  payment.gatewayUrl = url;
  await payment.save();
}

// --- INTENT: tenant clicks Pay on a plan card or upgrade button. -------
//     Body: { planCode } for subscription, { addonRole, addonQuantity }
//     for user_addon (or pass type='user_addon' explicitly).
router.post('/intent', async (req, res, next) => {
  try {
    const orgId = ensureOrg(req);
    const org = await Organization.findById(orgId).lean();
    if (!org) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);

    const { planCode, addonRole, addonQuantity, type } = req.body || {};

    // Branch on type. user_addon = extra user slots; subscription = plan.
    if (type === 'user_addon' || addonRole) {
      const role = String(addonRole || '').toLowerCase();
      if (!['admin', 'manager', 'cashier', 'accountant', 'ca'].includes(role)) {
        throw new AppError('VALIDATION_ERROR', 'addonRole must be one of admin/manager/cashier/accountant/ca', 400);
      }
      const qty = Math.max(1, Math.floor(Number(addonQuantity) || 0));

      // Billing cycle for the addon. Drives both the price calculation
      // (yearly = 12 months × monthly price × 0.75 for the 25% discount)
      // AND the lifetime stamped on the granted slot (cycleMonths).
      const cycleInput = String(req.body?.billingCycle || 'monthly').toLowerCase();
      const cycleMonths = cycleInput === 'yearly' ? 12 : 1;
      const yearlyDiscount = 0.25; // 25% off yearly addons

      const settings = await PlatformSettings.findOne({}).lean();
      const pricePerMonth = Math.max(0, settings?.userAddon?.pricePerUser ?? 199);
      const currency = settings?.userAddon?.currency || 'INR';
      const grossTotal = pricePerMonth * qty * cycleMonths;
      const total = cycleMonths === 12
        ? Math.round(grossTotal * (1 - yearlyDiscount))
        : grossTotal;

      const ref = shortRef();
      const gatewayUrl = settings?.paymentGateway?.url || '';
      const provider = settings?.paymentGateway?.provider || 'manual';

      const payment = await PlatformPayment.create({
        organizationId: org._id,
        organizationName: org.name,
        reference: ref,
        type: 'user_addon',
        addonRole: role,
        addonQuantity: qty,
        cycleMonths,
        amount: total,
        currency,
        status: 'pending',
        gatewayProvider: provider,
        gatewayUrl: appendOrgPlan(gatewayUrl, ref, {
          org: org._id,
          addon: role,
          qty,
          months: cycleMonths,
          amount: total,
        }),
        initiatedByUserId: req.user.id,
        initiatedByName: req.user.name || '',
        initiatedByEmail: req.user.email || '',
      });
      // PhonePe / Razorpay / UPI path overrides the static URL with a
      // fresh hosted-page session. No-op for any other provider.
      await attachGatewayUrl({ payment, req, settings, plan: null });
      return res.status(201).json(ok(publicPayment(payment.toObject())));
    }

    // Subscription path
    if (!planCode) throw new AppError('VALIDATION_ERROR', 'planCode is required', 400);
    const plan = await SubscriptionPlan.findOne({ code: String(planCode).toLowerCase() }).lean();
    if (!plan) throw new AppError('PLAN_NOT_FOUND', `Plan "${planCode}" not found`, 404);
    if (plan.isActive === false) {
      throw new AppError('PLAN_INACTIVE', 'That plan is no longer available', 410);
    }

    const cycleMonths = CYCLE_MONTHS[plan.billingCycle] ?? 1;
    const { url: rawGatewayUrl, provider } = await resolveGatewayUrl(plan);
    const ref = shortRef();
    const gatewayUrl = appendOrgPlan(rawGatewayUrl, ref, {
      org: org._id,
      plan: plan.code,
      amount: plan.price,
    });
    const settings = await PlatformSettings.findOne({}).lean();

    const payment = await PlatformPayment.create({
      organizationId: org._id,
      organizationName: org.name,
      reference: ref,
      type: 'subscription',
      planCode: plan.code,
      planName: plan.name,
      cycleMonths,
      amount: plan.price,
      currency: plan.currency || 'INR',
      status: 'pending',
      gatewayProvider: provider,
      gatewayUrl,
      initiatedByUserId: req.user.id,
      initiatedByName: req.user.name || '',
      initiatedByEmail: req.user.email || '',
    });
    await attachGatewayUrl({ payment, req, settings, plan });
    res.status(201).json(ok(publicPayment(payment.toObject())));
  } catch (err) {
    next(err);
  }
});

// --- LIST tenant's own payments. ---------------------------------------
router.get('/payments', async (req, res, next) => {
  try {
    const orgId = ensureOrg(req);
    const list = await PlatformPayment.find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(ok(list.map(publicPayment)));
  } catch (err) {
    next(err);
  }
});

// --- READ a single payment by reference. -------------------------------
router.get('/payments/:reference', async (req, res, next) => {
  try {
    const orgId = ensureOrg(req);
    const p = await PlatformPayment.findOne({
      reference: req.params.reference,
      organizationId: orgId,
    });
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    res.json(ok(publicPayment(p.toObject())));
  } catch (err) {
    next(err);
  }
});

// --- RETURN: tenant returns from the gateway. Marks the row
//     awaiting_confirmation so the vendor sees it in the inbox.
//     Body: { gatewayReference, tenantNote } (both optional).
router.post('/payments/:reference/return', async (req, res, next) => {
  try {
    const orgId = ensureOrg(req);
    const p = await PlatformPayment.findOne({
      reference: req.params.reference,
      organizationId: orgId,
    });
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (p.status === 'completed') {
      // Idempotent — confirming twice does nothing.
      return res.json(ok(publicPayment(p.toObject())));
    }
    if (['rejected', 'cancelled'].includes(p.status)) {
      throw new AppError(
        'PAYMENT_FINAL',
        `This payment is already ${p.status}; start a new intent.`,
        409,
      );
    }
    p.status = 'awaiting_confirmation';
    if (req.body?.gatewayReference !== undefined) {
      p.gatewayReference = String(req.body.gatewayReference || '').trim();
    }
    if (req.body?.tenantNote !== undefined) {
      p.tenantNote = String(req.body.tenantNote || '').trim();
    }
    p.paidAt = p.paidAt || new Date();
    await p.save();
    res.json(ok(publicPayment(p.toObject())));
  } catch (err) {
    next(err);
  }
});

// --- CANCEL: tenant aborts before paying. ------------------------------
router.post('/payments/:reference/cancel', async (req, res, next) => {
  try {
    const orgId = ensureOrg(req);
    const p = await PlatformPayment.findOne({
      reference: req.params.reference,
      organizationId: orgId,
    });
    if (!p) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (p.status === 'completed') {
      throw new AppError('PAYMENT_FINAL', 'Cannot cancel a completed payment', 409);
    }
    if (p.status !== 'pending') {
      throw new AppError(
        'PAYMENT_FINAL',
        `Cannot cancel — payment is already ${p.status}`,
        409,
      );
    }
    p.status = 'cancelled';
    await p.save();
    res.json(ok(publicPayment(p.toObject())));
  } catch (err) {
    next(err);
  }
});

export default router;
