import { Router } from 'express';
import Sale from '../models/Sale.js';
import Store from '../models/Store.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import PlatformSettings from '../models/PlatformSettings.js';
import PlatformPayment from '../models/PlatformPayment.js';
import { ok, AppError } from '../utils/response.js';

const router = Router();

// --- Public UPI-pay info. Powers the public /pay/upi/<ref> page so a
//     tenant (or anyone they share the link with) can scan the QR
//     without being logged in. Returns ONLY the bits needed to render
//     the page — no PII, no audit metadata, no internal counters.
router.get('/billing/upi/:reference', async (req, res, next) => {
  try {
    const ref = String(req.params.reference || '');
    if (!ref || ref.length < 6) {
      throw new AppError('BAD_REFERENCE', 'Invalid payment reference', 400);
    }
    const payment = await PlatformPayment.findOne({ reference: ref }).lean();
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);

    const settings = await PlatformSettings.findOne({}).lean();
    const upi = settings?.paymentGateway?.upi || {};
    res.json(
      ok({
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency || 'INR',
        type: payment.type,
        planName: payment.planName || '',
        addonRole: payment.addonRole || null,
        addonQuantity: payment.addonQuantity || 0,
        organizationName: payment.organizationName || '',
        status: payment.status,
        upi: {
          vpa: upi.vpa || '',
          payeeName: upi.payeeName || settings?.brand?.vendorName || 'Software Vendor',
        },
      }),
    );
  } catch (err) {
    next(err);
  }
});

// --- Platform-wide settings (singleton, vendor-authored). Tenants read
//     this to know which payment gateway URL to redirect to and which
//     vendor contact channels to surface as fallbacks. Returned shape
//     never includes secrets — only the destination URL + provider tag.
router.get('/platform-settings', async (_req, res, next) => {
  try {
    const doc = (await PlatformSettings.findOne({}).lean()) || {};
    res.json(
      ok({
        paymentGateway: {
          url: doc.paymentGateway?.url || '',
          provider: doc.paymentGateway?.provider || 'custom',
          currency: doc.paymentGateway?.currency || 'INR',
          mode: doc.paymentGateway?.mode || 'live',
        },
        vendorContact: {
          whatsapp: doc.vendorContact?.whatsapp || '',
          phone: doc.vendorContact?.phone || '',
          email: doc.vendorContact?.email || '',
          website: doc.vendorContact?.website || '',
        },
        brand: {
          vendorName: doc.brand?.vendorName || '',
          supportHours: doc.brand?.supportHours || '',
        },
        userAddon: {
          pricePerUser: doc.userAddon?.pricePerUser ?? 199,
          currency: doc.userAddon?.currency || 'INR',
          description:
            doc.userAddon?.description ||
            'Add an extra user slot at any time. Slot is added once your payment is confirmed.',
        },
      }),
    );
  } catch (err) {
    next(err);
  }
});

// --- Public pricing catalogue. Tenants (and prospective tenants) read
//     this to render the pricing page. Only active plans are exposed.
router.get('/plans', async (_req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ displayOrder: 1, price: 1, createdAt: 1 })
      .lean();
    res.json(
      ok(
        plans.map((p) => ({
          id: p._id,
          code: p.code,
          name: p.name,
          description: p.description || '',
          tier: p.tier,
          price: p.price,
          currency: p.currency,
          billingCycle: p.billingCycle,
          effectiveMonthlyAmount: p.effectiveMonthlyAmount,
          trialDays: p.trialDays,
          limits: p.limits,
          features: p.features || [],
          paymentUrl: p.paymentUrl || '',
          savingsLabel: p.savingsLabel || '',
          paymentMethods: p.paymentMethods,
          isFeatured: !!p.isFeatured,
          displayOrder: p.displayOrder ?? 0,
        })),
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/bill/:token', async (req, res, next) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 8) {
      throw new AppError('BAD_TOKEN', 'Invalid share token', 400);
    }
    const sale = await Sale.findOne({ shareToken: token }).lean();
    if (!sale) throw new AppError('NOT_FOUND', 'Bill not found', 404);

    const storeDoc = await Store.findById(sale.storeId).lean();
    const { createdBy, ...publicSale } = sale;

    res.json(
      ok({
        sale: publicSale,
        store: storeDoc
          ? {
              _id: storeDoc._id,
              name: storeDoc.name,
              code: storeDoc.code,
              gstNumber: storeDoc.gstNumber,
              stateCode: storeDoc.stateCode,
              phone: storeDoc.phone,
              email: storeDoc.email,
              logoUrl: storeDoc.logoUrl,
              address: storeDoc.address,
            }
          : null,
      }),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
