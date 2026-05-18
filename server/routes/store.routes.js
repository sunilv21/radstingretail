import { Router } from 'express';
import Store from '../models/Store.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import TenantAdmin from '../models/TenantAdmin.js';
import { ok, AppError } from '../utils/response.js';
import { sendWhatsAppText, fetchPhoneProfile } from '../services/whatsapp.service.js';
import { subscriptionView } from '../utils/subscription.js';
import { getEffectiveLimits } from '../utils/planLimits.js';

const router = Router();

const MASK = '••••••••';
const TEST_LOG_CAP = 10;

function maskSecret(v) {
  if (!v) return '';
  return MASK + String(v).slice(-4);
}

function publicStore(store) {
  const s = store.toObject ? store.toObject() : store;
  const wa = s.whatsapp || {};
  const settings = s.settings || {};
  return {
    ...s,
    settings: {
      allowNegativeStock: !!settings.allowNegativeStock,
      defaultGSTMode: settings.defaultGSTMode || 'exclusive',
      printCopies: Number(settings.printCopies ?? 1),
      enableLoyalty: !!settings.enableLoyalty,
      loyaltyRate: Number(settings.loyaltyRate ?? 0),
      invoiceFooter: settings.invoiceFooter || '',
      defaultLowStockThreshold: Number(settings.defaultLowStockThreshold ?? 5),
      defaultWarrantyMonths: Number(settings.defaultWarrantyMonths ?? 0),
      agingBuckets: Array.isArray(settings.agingBuckets) && settings.agingBuckets.length
        ? settings.agingBuckets : [30, 60, 90],
      eWayBillThreshold: Number(settings.eWayBillThreshold ?? 50000),
      b2cLargeThreshold: Number(settings.b2cLargeThreshold ?? 250000),
    },
    whatsapp: {
      enabled: !!wa.enabled,
      phoneNumberId: wa.phoneNumberId || '',
      businessAccountId: wa.businessAccountId || '',
      accessToken: maskSecret(wa.accessToken),
      apiVersion: wa.apiVersion || 'v21.0',
      defaultCountryCode: wa.defaultCountryCode || '91',
      messageTemplate: wa.messageTemplate || '',
      templateLanguage: wa.templateLanguage || 'en',
      appSecret: maskSecret(wa.appSecret),
      verifyToken: wa.verifyToken || '',
      webhookStatus: wa.webhookStatus || null,
      configured: !!(wa.enabled && wa.phoneNumberId && wa.accessToken),
      webhookReady: !!(wa.enabled && wa.appSecret && wa.verifyToken),
      verifiedProfile: wa.verifiedProfile || null,
      testLog: Array.isArray(wa.testLog) ? wa.testLog.slice(0, TEST_LOG_CAP) : [],
    },
    eInvoice: {
      enabled: !!s.eInvoice?.enabled,
      provider: s.eInvoice?.provider || 'mock',
      environment: s.eInvoice?.environment || 'sandbox',
      gstin: s.eInvoice?.gstin || '',
      username: s.eInvoice?.username || '',
      password: maskSecret(s.eInvoice?.password),
      clientId: s.eInvoice?.clientId || '',
      clientSecret: maskSecret(s.eInvoice?.clientSecret),
      baseUrl: s.eInvoice?.baseUrl || '',
      // Configurable GSP endpoint paths — defaults match OAuth2 convention.
      authPath: s.eInvoice?.authPath || '/auth/token',
      generatePath: s.eInvoice?.generatePath || '/einvoice/generate',
      cancelPath: s.eInvoice?.cancelPath || '/einvoice/cancel',
      ewbGeneratePath: s.eInvoice?.ewbGeneratePath || '/ewaybill/generate',
      ewbCancelPath: s.eInvoice?.ewbCancelPath || '/ewaybill/cancel',
      configured: !!(
        s.eInvoice?.enabled &&
        s.eInvoice?.provider !== 'mock' &&
        s.eInvoice?.baseUrl &&
        s.eInvoice?.clientId &&
        s.eInvoice?.clientSecret
      ),
    },
  };
}

function appendTestLog(store, entry) {
  store.whatsapp = store.whatsapp || {};
  const existing = Array.isArray(store.whatsapp.testLog) ? store.whatsapp.testLog : [];
  store.whatsapp.testLog = [entry, ...existing].slice(0, TEST_LOG_CAP);
}

router.get('/me', async (req, res, next) => {
  try {
    const store = await Store.findById(req.user.storeId);
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
    res.json(ok(publicStore(store)));
  } catch (err) {
    next(err);
  }
});

/**
 * Tenant-side subscription summary — drives the SubscriptionReminder banner
 * and the "X of Y used" indicators on the Branches / Users pages. Returns
 * the org's subscription state, the effective limits, AND the current
 * usage counts so the frontend doesn't need three round-trips.
 */
router.get('/subscription', async (req, res, next) => {
  try {
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }
    const org = await Organization.findById(req.user.organizationId).lean();
    if (!org) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);

    const limits = getEffectiveLimits(org);
    const [stores, warehouses, admins, byRole] = await Promise.all([
      Store.countDocuments({ organizationId: org._id, type: 'store', isActive: { $ne: false } }),
      Store.countDocuments({ organizationId: org._id, type: 'warehouse', isActive: { $ne: false } }),
      TenantAdmin.countDocuments({ organizationId: org._id, isActive: { $ne: false } }),
      User.aggregate([
        { $match: { organizationId: org._id, isActive: { $ne: false } } },
        { $group: { _id: { $toLower: '$role' }, n: { $sum: 1 } } },
      ]),
    ]);
    const roleMap = Object.fromEntries(byRole.map((r) => [r._id, r.n]));

    res.json(
      ok({
        organization: {
          id: org._id,
          name: org.name,
          plan: org.plan,
        },
        subscription: subscriptionView(org),
        limits,
        usage: {
          stores,
          warehouses,
          users: {
            admin: admins,
            manager: roleMap.manager || 0,
            cashier: roleMap.cashier || 0,
            accountant: roleMap.accountant || 0,
            ca: roleMap.ca || 0,
          },
        },
        reminderTemplate: org.reminderTemplate || { trial: '', expiringSoon: '' },
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.put('/me', async (req, res, next) => {
  try {
    const store = await Store.findById(req.user.storeId);
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    const fields = ['name', 'code', 'gstNumber', 'stateCode', 'phone', 'email', 'logoUrl', 'invoicePrefix', 'upiId'];
    for (const f of fields) {
      if (req.body[f] !== undefined) store[f] = req.body[f];
    }
    // GST registration toggle — flipping to "unregistered" clears the
    // GSTIN so a stale value can't reappear on bills of supply.
    if (req.body.gstRegistered !== undefined) {
      store.gstRegistered = !!req.body.gstRegistered;
      if (!store.gstRegistered) store.gstNumber = '';
      if (store.gstRegistered && !String(store.gstNumber || '').trim()) {
        throw new AppError(
          'GSTIN_REQUIRED',
          'Registered branches must have a GSTIN. Switch to "Unregistered" if this branch is not GST-registered.',
          400,
        );
      }
    }
    if (req.body.address && typeof req.body.address === 'object') {
      store.address = { ...(store.address?.toObject?.() || store.address || {}), ...req.body.address };
    }

    if (req.body.whatsapp && typeof req.body.whatsapp === 'object') {
      const incoming = req.body.whatsapp;
      store.whatsapp = store.whatsapp || {};
      const wa = store.whatsapp;

      if (incoming.accessToken !== undefined) {
        if (
          incoming.accessToken !== '' &&
          !String(incoming.accessToken).startsWith(MASK)
        ) {
          wa.accessToken = String(incoming.accessToken).trim();
          wa.verifiedProfile = null;
        }
      }
      if (incoming.appSecret !== undefined) {
        const val = incoming.appSecret;
        if (val !== '' && !String(val).startsWith(MASK)) {
          wa.appSecret = String(val).trim();
        }
      }
      const waFields = [
        'enabled', 'phoneNumberId', 'businessAccountId', 'apiVersion',
        'defaultCountryCode', 'messageTemplate', 'templateLanguage', 'verifyToken',
      ];
      for (const f of waFields) {
        if (incoming[f] !== undefined) {
          if (f === 'phoneNumberId' && incoming[f] !== wa[f]) {
            wa.verifiedProfile = null;
          }
          wa[f] = incoming[f];
        }
      }
      store.markModified('whatsapp');
    }

    if (req.body.settings && typeof req.body.settings === 'object') {
      store.settings = store.settings || {};
      const incoming = req.body.settings;
      const boolFields = ['allowNegativeStock', 'enableLoyalty'];
      const numFields = [
        'printCopies', 'loyaltyRate', 'defaultLowStockThreshold',
        'defaultWarrantyMonths', 'eWayBillThreshold', 'b2cLargeThreshold',
      ];
      const enumFields = { defaultGSTMode: ['inclusive', 'exclusive'] };
      for (const f of boolFields) {
        if (incoming[f] !== undefined) store.settings[f] = !!incoming[f];
      }
      for (const f of numFields) {
        if (incoming[f] !== undefined) {
          const n = Number(incoming[f]);
          if (Number.isFinite(n) && n >= 0) store.settings[f] = n;
        }
      }
      for (const f of Object.keys(enumFields)) {
        if (incoming[f] !== undefined && enumFields[f].includes(incoming[f])) {
          store.settings[f] = incoming[f];
        }
      }
      if (typeof incoming.invoiceFooter === 'string') {
        store.settings.invoiceFooter = incoming.invoiceFooter.slice(0, 500);
      }
      if (Array.isArray(incoming.agingBuckets)) {
        const cleaned = incoming.agingBuckets
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
        if (cleaned.length >= 1 && cleaned.length <= 5) {
          store.settings.agingBuckets = cleaned;
        }
      }
      store.markModified('settings');
    }

    if (req.body.eInvoice && typeof req.body.eInvoice === 'object') {
      store.eInvoice = store.eInvoice || {};
      const ein = store.eInvoice;
      const incoming = req.body.eInvoice;
      // Plain fields — now include the configurable endpoint paths so the
      // merchant can point at any GSP's specific URL layout.
      const plainFields = [
        'enabled',
        'provider',
        'environment',
        'gstin',
        'username',
        'clientId',
        'baseUrl',
        'authPath',
        'generatePath',
        'cancelPath',
        'ewbGeneratePath',
        'ewbCancelPath',
      ];
      for (const f of plainFields) {
        if (incoming[f] !== undefined) ein[f] = incoming[f];
      }
      // Trim the baseUrl so a trailing slash doesn't produce //auth/token.
      if (typeof ein.baseUrl === 'string') ein.baseUrl = ein.baseUrl.trim().replace(/\/$/, '');
      // Secrets — only overwrite if a real value (not the mask) was sent
      for (const f of ['password', 'clientSecret']) {
        const val = incoming[f];
        if (val !== undefined && val !== '' && !String(val).startsWith(MASK)) {
          ein[f] = String(val).trim();
        }
      }
      store.markModified('eInvoice');
    }

    await store.save();
    res.json(ok(publicStore(store)));
  } catch (err) {
    next(err);
  }
});

/**
 * Test the configured e-invoice provider credentials. Auth-only — does not
 * generate a real IRN, doesn't burn any GSP quota beyond a single auth call.
 * Returns provider, environment, token TTL on success; otherwise propagates
 * the AppError so the Settings UI can show the NIC-translated message.
 */
router.post('/einvoice/test', async (req, res, next) => {
  try {
    const { EInvoiceService } = await import('../services/e-invoice.service.js');
    const result = await EInvoiceService.testConnection({ storeId: req.user.storeId });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

router.post('/whatsapp/verify', async (req, res, next) => {
  try {
    const store = await Store.findById(req.user.storeId);
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
    const profile = await fetchPhoneProfile({ store: store.toObject() });
    store.whatsapp = store.whatsapp || {};
    store.whatsapp.verifiedProfile = { ...profile, verifiedAt: new Date().toISOString() };
    store.markModified('whatsapp');
    await store.save();
    res.json(ok(store.whatsapp.verifiedProfile));
  } catch (err) {
    next(err);
  }
});

router.post('/whatsapp/test', async (req, res, next) => {
  let store = null;
  const to = req.body?.to;
  try {
    store = await Store.findById(req.user.storeId);
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
    if (!to) throw new AppError('VALIDATION_ERROR', 'Recipient "to" is required', 400);
    const message =
      req.body?.message ||
      `Hello from ${store.name}! This is a test message from Radsting POS.`;
    const result = await sendWhatsAppText({ store: store.toObject(), to, message });
    appendTestLog(store, {
      to,
      status: 'ok',
      messageId: result.messageId || null,
      whatsappPhone: result.whatsappPhone || null,
      sentAt: new Date().toISOString(),
      sentBy: String(req.user.id),
    });
    store.markModified('whatsapp');
    await store.save();
    res.json(ok(result));
  } catch (err) {
    if (store) {
      appendTestLog(store, {
        to: to || null,
        status: 'failed',
        error: err?.message || 'Unknown error',
        errorCode: err?.code || null,
        sentAt: new Date().toISOString(),
        sentBy: String(req.user.id),
      });
      store.markModified('whatsapp');
      try {
        await store.save();
      } catch {
        /* swallow — original error is more important */
      }
    }
    next(err);
  }
});

export default router;
