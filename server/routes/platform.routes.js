/**
 * Platform-level routes — used by the software vendor (super_admin) to
 * manage tenant organizations and their owner-admins. Every request here
 * runs WITHOUT org-scoping, so the guard at the top of the chain is doing
 * the heavy lifting.
 */
import { Router } from 'express';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import TenantAdmin from '../models/TenantAdmin.js';
import SuperAdmin from '../models/SuperAdmin.js';
import Store from '../models/Store.js';
import { ok, AppError } from '../utils/response.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import { subscriptionView } from '../utils/subscription.js';
import { invalidateOrgCache } from '../middleware/subscriptionGuard.js';
import { isEmailTaken, USER_TYPE } from '../services/accountLookup.js';
import { getEffectiveLimits } from '../utils/planLimits.js';

// Sub-routers — each owns a slice of the admin portal API surface.
// All inherit `requireSuperAdmin` since they're mounted under this router.
import plansRouter from './platform/plans.js';
import paymentsRouter from './platform/payments.js';
import requestsRouter from './platform/requests.js';
import settingsRouter from './platform/settings.js';

const router = Router();
router.use(requireSuperAdmin);

// Mount sub-routers FIRST so their paths take precedence over any
// catch-all defined later in this file.
router.use('/plans', plansRouter);
router.use('/payments', paymentsRouter);
router.use('/requests', requestsRouter);
router.use('/settings', settingsRouter);

const DAY_MS = 86_400_000;

function publicOrg(org, owner, counts) {
  return {
    id: org._id,
    name: org.name,
    plan: org.plan,
    centralGstin: org.centralGstin,
    pan: org.pan,
    isActive: org.isActive !== false,
    createdAt: org.createdAt,
    vendorNote: org.vendorNote || '',
    subscription: subscriptionView(org),
    limits: getEffectiveLimits(org),
    customLimits: org.customLimits || null,
    reminderTemplate: org.reminderTemplate || { trial: '', expiringSoon: '' },
    owner: owner
      ? {
          id: owner._id,
          name: owner.name,
          email: owner.email,
          role: owner.role,
          isActive: owner.isActive !== false,
          lastLogin: owner.lastLogin,
        }
      : null,
    counts: {
      stores: counts?.stores ?? 0,
      warehouses: counts?.warehouses ?? 0,
      users: counts?.users ?? 0,
    },
  };
}

// --- LIST every tenant org with its owner + headline stats. -------------
//     Owner now lives in `tenantadmins`. User count = staff + admin.
router.get('/organizations', async (_req, res, next) => {
  try {
    const orgs = await Organization.find({}).sort({ createdAt: -1 }).lean();
    if (orgs.length === 0) return res.json(ok([]));
    const orgIds = orgs.map((o) => o._id);
    const ownerIds = orgs.map((o) => o.ownerUserId).filter(Boolean);

    const [owners, locations, staffPerOrg, adminsPerOrg] = await Promise.all([
      // Some legacy installs may still have admin rows in `users`. Try both.
      Promise.all([
        TenantAdmin.find({ _id: { $in: ownerIds } }).lean(),
        User.find({ _id: { $in: ownerIds } }).lean(),
      ]).then(([t, u]) => [...t, ...u]),
      // Group by org AND type so we count stores and warehouses separately
      // — they have separate caps on the Pro plan.
      Store.aggregate([
        { $match: { organizationId: { $in: orgIds } } },
        { $group: { _id: { org: '$organizationId', type: '$type' }, n: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { organizationId: { $in: orgIds } } },
        { $group: { _id: '$organizationId', n: { $sum: 1 } } },
      ]),
      TenantAdmin.aggregate([
        { $match: { organizationId: { $in: orgIds } } },
        { $group: { _id: '$organizationId', n: { $sum: 1 } } },
      ]),
    ]);
    const ownersById = new Map(owners.map((u) => [String(u._id), u]));
    const storeCount = new Map();
    const warehouseCount = new Map();
    for (const row of locations) {
      const orgKey = String(row._id?.org || '');
      const t = row._id?.type === 'warehouse' ? 'warehouse' : 'store';
      const map = t === 'warehouse' ? warehouseCount : storeCount;
      map.set(orgKey, (map.get(orgKey) || 0) + row.n);
    }
    const staffCount = new Map(staffPerOrg.map((s) => [String(s._id), s.n]));
    const adminCount = new Map(adminsPerOrg.map((s) => [String(s._id), s.n]));

    res.json(
      ok(
        orgs.map((o) => {
          const orgKey = String(o._id);
          const totalUsers = (staffCount.get(orgKey) || 0) + (adminCount.get(orgKey) || 0);
          return publicOrg(o, ownersById.get(String(o.ownerUserId)), {
            stores: storeCount.get(orgKey) || 0,
            warehouses: warehouseCount.get(orgKey) || 0,
            users: totalUsers,
          });
        }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

// --- CREATE a new tenant org + its owner-admin in one shot. -------------
//     Body: { orgName, plan?, centralGstin?, ownerName, ownerEmail, ownerPassword }
router.post('/organizations', async (req, res, next) => {
  try {
    const {
      orgName,
      plan,
      centralGstin,
      pan,
      ownerName,
      ownerEmail,
      ownerPassword,
      trialDays,
      monthlyAmount,
      customLimits,
      reminderTemplate,
    } = req.body || {};

    if (!orgName || !ownerName || !ownerEmail || !ownerPassword) {
      throw new AppError(
        'VALIDATION_ERROR',
        'orgName, ownerName, ownerEmail and ownerPassword are required',
        400,
      );
    }
    if (String(ownerPassword).length < 8) {
      throw new AppError('WEAK_PASSWORD', 'Owner password must be at least 8 characters', 400);
    }
    const cleanEmail = String(ownerEmail).toLowerCase().trim();
    if (await isEmailTaken(cleanEmail)) {
      throw new AppError('USER_EXISTS', `An account with email ${cleanEmail} already exists`, 409);
    }

    // Trial window — defaults to 14 days. Pass `trialDays: 0` to skip the
    // trial entirely (e.g. a contract customer who paid upfront — vendor
    // then sets subscriptionEndsAt directly via PUT).
    const tDays = trialDays === undefined ? 14 : Math.max(0, Math.min(365, Number(trialDays) || 0));
    const trialEndsAt = tDays > 0 ? new Date(Date.now() + tDays * DAY_MS) : null;

    // Two-pass: TenantAdmin first (so the Org has an ownerUserId), then Org,
    // then back-link the org id onto the admin row. The owner now lives in
    // `tenantadmins`, never in `users`.
    const owner = await TenantAdmin.create({
      name: String(ownerName).trim(),
      email: cleanEmail,
      password: String(ownerPassword),
      isActive: true,
    });
    const org = await Organization.create({
      name: String(orgName).trim(),
      ownerUserId: owner._id,
      plan: String(plan || 'free').toLowerCase(),
      centralGstin: centralGstin || '',
      pan: pan || '',
      isActive: true,
      trialEndsAt,
      monthlyAmount: Math.max(0, Number(monthlyAmount) || 0),
      customLimits: customLimits && typeof customLimits === 'object' ? customLimits : undefined,
      reminderTemplate:
        reminderTemplate && typeof reminderTemplate === 'object'
          ? {
              trial: String(reminderTemplate.trial || ''),
              expiringSoon: String(reminderTemplate.expiringSoon || ''),
            }
          : undefined,
    });
    owner.organizationId = org._id;

    // Materialise the implicit "main" store every plan grants on day
    // zero. Without this, fresh tenants display "0 / 1 stores used"
    // and the first user-created branch is treated as the 1st instead
    // of the 2nd. Same logic mirrored in the admin portal's repo.
    const mainStore = await Store.create({
      organizationId: org._id,
      name: String(orgName).trim(),
      type: 'store',
      isActive: true,
    });

    // Wire the new store back onto the tenant_admin row so JWTs issued at
    // first login carry a valid storeId straight away. Without this, the
    // authenticate middleware has to fall back to a live org lookup on
    // every request — works, but slower.
    owner.storeIds = [mainStore._id];
    owner.primaryStoreId = mainStore._id;
    await owner.save();

    res.status(201).json(ok(publicOrg(org, owner, { stores: 1, warehouses: 0, users: 1 })));
  } catch (err) {
    next(err);
  }
});

// --- TOGGLE / UPDATE org. Body: { isActive?, name?, plan?, centralGstin?, pan? }
//     When isActive is set to false we cascade-disable every user under the
//     org so nobody on that tenant can log in. Setting it back to true
//     re-enables them so the vendor can pause / resume an account.
router.put('/organizations/:id', async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);

    if (req.body.name !== undefined) org.name = String(req.body.name).trim();
    if (req.body.plan !== undefined) org.plan = String(req.body.plan);
    if (req.body.centralGstin !== undefined) org.centralGstin = req.body.centralGstin || '';
    if (req.body.pan !== undefined) org.pan = req.body.pan || '';
    if (req.body.vendorNote !== undefined) org.vendorNote = String(req.body.vendorNote || '');
    if (req.body.monthlyAmount !== undefined) {
      org.monthlyAmount = Math.max(0, Number(req.body.monthlyAmount) || 0);
    }
    if (req.body.customLimits !== undefined && typeof req.body.customLimits === 'object') {
      org.customLimits = req.body.customLimits;
    }
    if (req.body.reminderTemplate !== undefined && typeof req.body.reminderTemplate === 'object') {
      org.reminderTemplate = {
        trial: String(req.body.reminderTemplate.trial || ''),
        expiringSoon: String(req.body.reminderTemplate.expiringSoon || ''),
      };
    }

    if (req.body.isActive !== undefined) {
      org.isActive = !!req.body.isActive;
      // We deliberately do NOT cascade isActive onto users / tenantadmins.
      // The org-level isActive flag is read by subscriptionGuard, which
      // returns 402 SUBSCRIPTION_BLOCKED on every data route. Keeping
      // user accounts logged-in-able lets them see the SubscriptionLock
      // screen instead of being kicked out with a generic
      // ACCOUNT_DISABLED error from the login route.
    }

    await org.save();
    invalidateOrgCache(org._id);
    res.json(ok({ updated: true }));
  } catch (err) {
    next(err);
  }
});

// --- DELETE a tenant. Soft by default; hard with `?mode=permanent`.
//     Hard delete requires `?confirm=<org name>` to prevent fat-finger
//     accidents. Removes Organization + TenantAdmins + Users + Stores.
router.delete('/organizations/:id', async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);

    const mode = String(req.query.mode || '').toLowerCase();
    if (mode === 'permanent') {
      const provided = String(req.query.confirm || '').trim();
      if (provided.toLowerCase() !== String(org.name).toLowerCase()) {
        throw new AppError(
          'CONFIRMATION_MISMATCH',
          `To permanently delete this tenant, pass ?confirm=<org name>. Expected "${org.name}".`,
          400,
        );
      }

      const [ta, u, st] = await Promise.all([
        TenantAdmin.deleteMany({ organizationId: org._id }),
        User.deleteMany({ organizationId: org._id }),
        Store.deleteMany({ organizationId: org._id }),
      ]);
      await Organization.deleteOne({ _id: org._id });
      invalidateOrgCache(org._id);
      return res.json(
        ok({
          deleted: true,
          mode: 'permanent',
          removed: {
            tenantAdmins: ta.deletedCount,
            users: u.deletedCount,
            stores: st.deletedCount,
            organization: 1,
          },
        }),
      );
    }

    // Default: soft-delete = flip org.isActive only. subscriptionGuard
    // handles access control. We do NOT touch user rows so the affected
    // tenant can log in and see the SubscriptionLock screen.
    org.isActive = false;
    await org.save();
    invalidateOrgCache(org._id);
    res.json(ok({ deactivated: true, mode: 'soft' }));
  } catch (err) {
    next(err);
  }
});

// --- SUBSCRIPTION management — extend / start / mark-paid / pause.
//     Body shape:
//       { action: 'start_trial', days }                 → new trial window
//       { action: 'extend_trial', days }                → push trialEndsAt
//       { action: 'activate', months, monthlyAmount? }  → flip to paid for N months
//       { action: 'extend_subscription', months }       → push subscriptionEndsAt
//       { action: 'set_plan', plan, monthlyAmount? }    → change tier
//       { action: 'set_monthly_amount', monthlyAmount } → change MRR only
//       { action: 'cancel' }                            → end subscription now
router.post('/organizations/:id/subscription', async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);
    const { action } = req.body || {};
    const now = Date.now();

    switch (action) {
      case 'start_trial': {
        const days = Math.max(1, Math.min(365, Number(req.body.days) || 14));
        org.trialEndsAt = new Date(now + days * DAY_MS);
        org.subscriptionEndsAt = null;
        org.subscriptionStartedAt = null;
        break;
      }
      case 'extend_trial': {
        const days = Math.max(1, Math.min(365, Number(req.body.days) || 7));
        const base = org.trialEndsAt && new Date(org.trialEndsAt).getTime() > now
          ? new Date(org.trialEndsAt).getTime()
          : now;
        org.trialEndsAt = new Date(base + days * DAY_MS);
        break;
      }
      case 'activate': {
        const months = Math.max(1, Math.min(120, Number(req.body.months) || 1));
        org.subscriptionStartedAt = new Date(now);
        org.subscriptionEndsAt = new Date(now + months * 30 * DAY_MS);
        if (req.body.monthlyAmount !== undefined) {
          org.monthlyAmount = Math.max(0, Number(req.body.monthlyAmount) || 0);
        }
        break;
      }
      case 'extend_subscription': {
        const months = Math.max(1, Math.min(120, Number(req.body.months) || 1));
        const base = org.subscriptionEndsAt && new Date(org.subscriptionEndsAt).getTime() > now
          ? new Date(org.subscriptionEndsAt).getTime()
          : now;
        org.subscriptionEndsAt = new Date(base + months * 30 * DAY_MS);
        if (!org.subscriptionStartedAt) org.subscriptionStartedAt = new Date(now);
        break;
      }
      case 'set_plan': {
        if (!req.body.plan) throw new AppError('VALIDATION_ERROR', 'plan is required', 400);
        org.plan = String(req.body.plan);
        if (req.body.monthlyAmount !== undefined) {
          org.monthlyAmount = Math.max(0, Number(req.body.monthlyAmount) || 0);
        }
        break;
      }
      case 'set_monthly_amount': {
        org.monthlyAmount = Math.max(0, Number(req.body.monthlyAmount) || 0);
        break;
      }
      case 'cancel': {
        org.subscriptionEndsAt = new Date(now);
        org.trialEndsAt = null;
        break;
      }
      default:
        throw new AppError('VALIDATION_ERROR', `Unknown action: ${action}`, 400);
    }

    await org.save();
    invalidateOrgCache(org._id);
    res.json(ok({ subscription: subscriptionView(org) }));
  } catch (err) {
    next(err);
  }
});

// --- VENDOR DASHBOARD summary — totals + status distribution + MRR. ----
router.get('/dashboard', async (_req, res, next) => {
  try {
    const orgs = await Organization.find({}).lean();
    const tally = { total: orgs.length, trial: 0, active: 0, expired: 0, blocked: 0 };
    let mrr = 0;
    let activePayingTenants = 0;
    const expiringSoon = []; // < 7 days from expiry

    for (const o of orgs) {
      const v = subscriptionView(o);
      tally[v.status] = (tally[v.status] || 0) + 1;
      if (v.status === 'active') {
        mrr += v.monthlyAmount || 0;
        activePayingTenants += 1;
      }
      if (
        (v.status === 'active' || v.status === 'trial') &&
        v.daysRemaining !== null &&
        v.daysRemaining <= 7
      ) {
        expiringSoon.push({
          id: o._id,
          name: o.name,
          status: v.status,
          daysRemaining: v.daysRemaining,
        });
      }
    }
    expiringSoon.sort((a, b) => a.daysRemaining - b.daysRemaining);

    const [storeCount, userCount] = await Promise.all([
      Store.countDocuments({}),
      User.countDocuments({}),
    ]);

    res.json(
      ok({
        tenants: tally,
        mrr,
        arr: mrr * 12,
        activePayingTenants,
        averageRevenuePerTenant: activePayingTenants > 0 ? Math.round(mrr / activePayingTenants) : 0,
        totalStores: storeCount,
        totalUsers: userCount,
        expiringSoon: expiringSoon.slice(0, 10),
      }),
    );
  } catch (err) {
    next(err);
  }
});

// --- LIST every account across every org + collection.
//     Cross-tenant support tool — returns rows from { tenantadmins, users,
//     superadmins } merged, each tagged with its userType so the vendor UI
//     can render origin-aware actions. Filterable by email or org. -------
router.get('/users', async (req, res, next) => {
  try {
    const baseFilter = {};
    if (req.query.email) baseFilter.email = String(req.query.email).toLowerCase().trim();

    const orgFilter = req.query.organizationId
      ? { ...baseFilter, organizationId: req.query.organizationId }
      : baseFilter;

    // Super admins have no org; only include them when no org filter is set.
    const tasks = [
      TenantAdmin.find(orgFilter).sort({ createdAt: -1 }).limit(500).lean(),
      User.find(orgFilter).sort({ createdAt: -1 }).limit(500).lean(),
    ];
    if (!req.query.organizationId) {
      tasks.push(SuperAdmin.find(baseFilter).sort({ createdAt: -1 }).limit(500).lean());
    }
    const [admins, staff, supers] = await Promise.all(tasks);

    const tag = (rows, userType, role) =>
      rows.map((r) => ({
        id: r._id,
        name: r.name,
        email: r.email,
        role: role || r.role,
        userType,
        organizationId: r.organizationId || null,
        isActive: r.isActive !== false,
        lastLogin: r.lastLogin,
        createdAt: r.createdAt,
      }));

    const merged = [
      ...tag(supers || [], USER_TYPE.SUPER_ADMIN, 'super_admin'),
      ...tag(admins || [], USER_TYPE.TENANT_ADMIN, 'admin'),
      ...tag(staff || [], USER_TYPE.STAFF),
    ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json(ok(merged));
  } catch (err) {
    next(err);
  }
});

// Resolve a user-id to the right collection. Tenant_admin first because
// listed-by-id support flows usually concern the org owner. Super admin
// id collisions are vanishingly unlikely but we still scan all three.
async function findAnyAccount(id) {
  const [ta, u, sa] = await Promise.all([
    TenantAdmin.findById(id),
    User.findById(id),
    SuperAdmin.findById(id),
  ]);
  if (ta) return { account: ta, userType: USER_TYPE.TENANT_ADMIN };
  if (u) return { account: u, userType: USER_TYPE.STAFF };
  if (sa) return { account: sa, userType: USER_TYPE.SUPER_ADMIN };
  return null;
}

// --- UPDATE any account's identity. Cross-collection — picks the right
//     model from findAnyAccount. Body fields are all optional:
//        { name, email, phone }
//     Email uniqueness is enforced ACROSS the three collections.
router.put('/users/:id', async (req, res, next) => {
  try {
    const resolved = await findAnyAccount(req.params.id);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    const account = resolved.account;

    if (req.body.name !== undefined) account.name = String(req.body.name).trim();
    if (req.body.phone !== undefined) account.phone = String(req.body.phone || '').trim();
    if (req.body.email !== undefined) {
      const cleanEmail = String(req.body.email).toLowerCase().trim();
      if (!cleanEmail) {
        throw new AppError('VALIDATION_ERROR', 'email cannot be empty', 400);
      }
      if (cleanEmail !== String(account.email).toLowerCase()) {
        if (await isEmailTaken(cleanEmail, account._id)) {
          throw new AppError('USER_EXISTS', `Email ${cleanEmail} is already in use.`, 409);
        }
        account.email = cleanEmail;
      }
    }
    await account.save();

    res.json(
      ok({
        id: account._id,
        name: account.name,
        email: account.email,
        userType: resolved.userType,
        organizationId: account.organizationId || null,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// --- RESET PASSWORD for any account. Vendor support tool. Min 8 chars.
router.put('/users/:id/password', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 8) {
      throw new AppError('WEAK_PASSWORD', 'Password must be at least 8 characters', 400);
    }
    const resolved = await findAnyAccount(req.params.id);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    resolved.account.password = String(password);
    await resolved.account.save();
    res.json(ok({ id: resolved.account._id, updated: true }));
  } catch (err) {
    next(err);
  }
});

// --- ENABLE / DISABLE any account across any collection. ----------------
router.put('/users/:id/active', async (req, res, next) => {
  try {
    if (req.body.isActive === undefined) {
      throw new AppError('VALIDATION_ERROR', 'isActive boolean is required', 400);
    }
    const resolved = await findAnyAccount(req.params.id);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    resolved.account.isActive = !!req.body.isActive;
    await resolved.account.save();
    res.json(ok({ id: resolved.account._id, isActive: resolved.account.isActive }));
  } catch (err) {
    next(err);
  }
});

// --- HARD DELETE any account (vendor only). Refuses to nuke the calling
//     super_admin so the vendor can't lock themselves out. ----------------
router.delete('/users/:id', async (req, res, next) => {
  try {
    const resolved = await findAnyAccount(req.params.id);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (String(resolved.account._id) === String(req.user.id)) {
      throw new AppError('SELF_DELETE', 'You cannot delete your own super_admin account from here.', 400);
    }
    const Model = resolved.userType === USER_TYPE.SUPER_ADMIN
      ? SuperAdmin
      : resolved.userType === USER_TYPE.TENANT_ADMIN
        ? TenantAdmin
        : User;
    await Model.deleteOne({ _id: resolved.account._id });
    res.json(ok({ deleted: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
