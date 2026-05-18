/**
 * Platform sub-router: singleton PlatformSettings.
 * Mounted at `/api/platform/settings`. Inherits `requireSuperAdmin`.
 *
 * One row per cluster. Holds vendor-wide payment gateway config, vendor
 * contact details, brand strings, and the default user-addon price.
 * Secrets are masked on read; the masked sentinel is filtered on write
 * so a save without typing doesn't clobber the real value.
 */
import { Router } from 'express';
import PlatformSettings from '../../models/PlatformSettings.js';
import { ok } from '../../utils/response.js';

const router = Router();
const MASK = '••••••••';

function maskSecret(v) {
  if (!v) return '';
  return MASK + String(v).slice(-4);
}

function publicSettings(s) {
  const o = s.toObject ? s.toObject() : s;
  const pg = o.paymentGateway || {};
  const phonepe = pg.phonepe || {};
  const razorpay = pg.razorpay || {};
  return {
    paymentGateway: {
      url: pg.url || '',
      provider: pg.provider || 'custom',
      currency: pg.currency || 'INR',
      mode: pg.mode || 'live',
      phonepe: {
        merchantId: phonepe.merchantId || '',
        saltKey: maskSecret(phonepe.saltKey),
        saltKeyConfigured: !!phonepe.saltKey,
        saltIndex: phonepe.saltIndex ?? 1,
        environment: phonepe.environment || 'sandbox',
      },
      upi: {
        vpa: pg.upi?.vpa || '',
        payeeName: pg.upi?.payeeName || '',
      },
      razorpay: {
        keyId: razorpay.keyId || '',
        keySecret: maskSecret(razorpay.keySecret),
        keySecretConfigured: !!razorpay.keySecret,
        webhookSecret: maskSecret(razorpay.webhookSecret),
        webhookSecretConfigured: !!razorpay.webhookSecret,
        mode: razorpay.mode || 'test',
      },
    },
    vendorContact: {
      whatsapp: o.vendorContact?.whatsapp || '',
      phone: o.vendorContact?.phone || '',
      email: o.vendorContact?.email || '',
      website: o.vendorContact?.website || '',
    },
    brand: {
      vendorName: o.brand?.vendorName || 'Radsting',
      supportHours: o.brand?.supportHours || '',
    },
    userAddon: {
      pricePerUser: o.userAddon?.pricePerUser ?? 0,
      currency: o.userAddon?.currency || 'INR',
      description: o.userAddon?.description || '',
    },
    updatedAt: o.updatedAt,
  };
}

/** Resolve-or-create — the collection always has exactly one document. */
async function getOrCreateSettings() {
  let s = await PlatformSettings.findOne({});
  if (!s) s = await PlatformSettings.create({});
  return s;
}

/** GET — masked secrets only. */
router.get('/', async (_req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    res.json(ok(publicSettings(s)));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT — partial update. Incoming secret fields that start with the mask
 * are dropped, so a save round-trip without retyping doesn't overwrite
 * the real stored value.
 */
router.put('/', async (req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    const body = req.body || {};

    if (body.paymentGateway && typeof body.paymentGateway === 'object') {
      const pg = body.paymentGateway;
      s.paymentGateway = s.paymentGateway || {};
      if (pg.url !== undefined) s.paymentGateway.url = pg.url;
      if (pg.provider !== undefined) s.paymentGateway.provider = pg.provider;
      if (pg.currency !== undefined) s.paymentGateway.currency = pg.currency;
      if (pg.mode !== undefined) s.paymentGateway.mode = pg.mode;

      if (pg.phonepe && typeof pg.phonepe === 'object') {
        s.paymentGateway.phonepe = s.paymentGateway.phonepe || {};
        const p = pg.phonepe;
        if (p.merchantId !== undefined) s.paymentGateway.phonepe.merchantId = p.merchantId;
        if (p.saltIndex !== undefined) s.paymentGateway.phonepe.saltIndex = Number(p.saltIndex);
        if (p.environment !== undefined) s.paymentGateway.phonepe.environment = p.environment;
        if (
          p.saltKey !== undefined &&
          p.saltKey !== '' &&
          !String(p.saltKey).startsWith(MASK)
        ) {
          s.paymentGateway.phonepe.saltKey = String(p.saltKey).trim();
        }
      }
      if (pg.upi && typeof pg.upi === 'object') {
        s.paymentGateway.upi = s.paymentGateway.upi || {};
        if (pg.upi.vpa !== undefined) s.paymentGateway.upi.vpa = pg.upi.vpa;
        if (pg.upi.payeeName !== undefined) s.paymentGateway.upi.payeeName = pg.upi.payeeName;
      }
      if (pg.razorpay && typeof pg.razorpay === 'object') {
        s.paymentGateway.razorpay = s.paymentGateway.razorpay || {};
        const r = pg.razorpay;
        if (r.keyId !== undefined) s.paymentGateway.razorpay.keyId = r.keyId;
        if (r.mode !== undefined) s.paymentGateway.razorpay.mode = r.mode;
        for (const f of ['keySecret', 'webhookSecret']) {
          if (
            r[f] !== undefined &&
            r[f] !== '' &&
            !String(r[f]).startsWith(MASK)
          ) {
            s.paymentGateway.razorpay[f] = String(r[f]).trim();
          }
        }
      }
      s.markModified('paymentGateway');
    }

    if (body.vendorContact && typeof body.vendorContact === 'object') {
      s.vendorContact = s.vendorContact || {};
      for (const f of ['whatsapp', 'phone', 'email', 'website']) {
        if (body.vendorContact[f] !== undefined) {
          s.vendorContact[f] = body.vendorContact[f];
        }
      }
      s.markModified('vendorContact');
    }

    if (body.brand && typeof body.brand === 'object') {
      s.brand = s.brand || {};
      for (const f of ['vendorName', 'supportHours']) {
        if (body.brand[f] !== undefined) s.brand[f] = body.brand[f];
      }
      s.markModified('brand');
    }

    if (body.userAddon && typeof body.userAddon === 'object') {
      s.userAddon = s.userAddon || {};
      if (body.userAddon.pricePerUser !== undefined) {
        s.userAddon.pricePerUser = Number(body.userAddon.pricePerUser) || 0;
      }
      if (body.userAddon.currency !== undefined) s.userAddon.currency = body.userAddon.currency;
      if (body.userAddon.description !== undefined) {
        s.userAddon.description = body.userAddon.description;
      }
      s.markModified('userAddon');
    }

    await s.save();
    res.json(ok(publicSettings(s)));
  } catch (err) {
    next(err);
  }
});

export default router;
