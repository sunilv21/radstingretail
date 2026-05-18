/**
 * Auth routes — split by user-type after the multi-tenant refactor.
 *
 *   POST /auth/login                       (tenant POS app)
 *     looks up { tenantadmins, users } in that priority order. Never queries
 *     the superadmins collection — a leaked tenant password cannot unlock
 *     the platform side.
 *
 *   POST /auth/super-admin/login           (vendor portal)
 *     looks up only the superadmins collection. The vendor portal hits this
 *     endpoint exclusively.
 *
 *   GET  /auth/me                          (any logged-in user)
 *     resolves req.user to its row from the right collection via
 *     `accountLookup.findAccountById`.
 *
 *   POST /auth/switch-store/:storeId       (tenant_admin or staff)
 *     reissues a JWT scoped to the new storeId. Rejects super_admin
 *     because they have no store concept.
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import Store from '../models/Store.js';
import Organization from '../models/Organization.js';
import { ok, AppError } from '../utils/response.js';
import { authenticate, JWT_SECRET } from '../middleware/auth.js';
import { permissionsFor } from '../rbac/matrix.js';
import { subscriptionView } from '../utils/subscription.js';
import {
  USER_TYPE,
  findTenantAccountByEmail,
  findSuperAdminByEmail,
  findAccountById,
} from '../services/accountLookup.js';

const router = Router();

const ROLE_FOR_USER_TYPE = {
  [USER_TYPE.SUPER_ADMIN]: 'super_admin',
  [USER_TYPE.TENANT_ADMIN]: 'admin',
};

/** Effective role string used for RBAC matrix lookups. */
function effectiveRole({ account, userType }) {
  if (userType === USER_TYPE.STAFF) {
    const r = String(account.role || '').toLowerCase();
    return ['manager', 'cashier', 'accountant', 'ca'].includes(r) ? r : 'cashier';
  }
  return ROLE_FOR_USER_TYPE[userType] || 'cashier';
}

/**
 * Resolve every store this account can switch into.
 *  - super_admin: empty set (cross-tenant; store concept doesn't apply).
 *  - tenant_admin: every active store in the org. Always.
 *  - staff: explicit storeIds + primary + legacy storeId. Org-wide for
 *    accountant / ca because the matrix needs cross-branch financial view.
 */
async function pickStoreIdsForAccount({ account, userType }) {
  if (userType === USER_TYPE.SUPER_ADMIN) return [];

  const ids = new Set((account.storeIds || []).map((s) => String(s)));
  if (account.storeId) ids.add(String(account.storeId));
  if (account.primaryStoreId) ids.add(String(account.primaryStoreId));

  if (userType === USER_TYPE.TENANT_ADMIN && account.organizationId) {
    const all = await Store.find({
      organizationId: account.organizationId,
      isActive: { $ne: false },
    })
      .select({ _id: 1 })
      .lean();
    for (const s of all) ids.add(String(s._id));
  }
  if (userType === USER_TYPE.STAFF) {
    const r = String(account.role || '').toLowerCase();
    if (['accountant', 'ca'].includes(r) && account.organizationId) {
      const all = await Store.find({
        organizationId: account.organizationId,
        isActive: { $ne: false },
      })
        .select({ _id: 1 })
        .lean();
      for (const s of all) ids.add(String(s._id));
    }
  }
  return Array.from(ids);
}

async function signTokenFor(resolved, currentStoreId) {
  const { account, userType } = resolved;
  return jwt.sign(
    {
      id: account._id.toString(),
      email: account.email,
      role: effectiveRole(resolved),
      userType,
      organizationId: account.organizationId ? account.organizationId.toString() : null,
      storeId: String(currentStoreId || ''),
      storeIds: await pickStoreIdsForAccount(resolved),
    },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

async function userResponse(resolved, currentStoreId) {
  const { account, userType } = resolved;
  const storeIds = await pickStoreIdsForAccount(resolved);
  const stores = storeIds.length
    ? await Store.find({ _id: { $in: storeIds } }).select({ name: 1, code: 1, type: 1 }).lean()
    : [];
  const role = effectiveRole(resolved);

  // Attach the tenant's subscription state so the frontend can decide
  // whether to render the dashboard or the SubscriptionLock takeover.
  // Super-admins skip this — they don't belong to any org.
  let subscription = null;
  let organizationName = null;
  if (userType !== USER_TYPE.SUPER_ADMIN && account.organizationId) {
    const org = await Organization.findById(account.organizationId)
      .select({ name: 1, plan: 1, isActive: 1, trialEndsAt: 1, subscriptionStartedAt: 1, subscriptionEndsAt: 1, monthlyAmount: 1 })
      .lean();
    if (org) {
      subscription = subscriptionView(org);
      organizationName = org.name;
    }
  }

  return {
    id: account._id,
    name: account.name,
    email: account.email,
    role,
    userType,
    organizationId: account.organizationId || null,
    organizationName,
    subscription,
    storeId: String(currentStoreId || ''),
    storeIds,
    stores,
    permissions: permissionsFor(role),
  };
}

// ---------- TENANT LOGIN ------------------------------------------------
// Used by the tenant POS Next.js app. Looks up tenantadmins first, then
// users (staff). Never touches superadmins.
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const resolved = await findTenantAccountByEmail(email);
    if (!resolved || !(await resolved.account.comparePassword(password || ''))) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    if (resolved.account.isActive === false) {
      throw new AppError(
        'ACCOUNT_DISABLED',
        'Your account has been disabled. Contact your admin.',
        403,
      );
    }
    const storeIds = await pickStoreIdsForAccount(resolved);
    const currentStoreId = String(
      resolved.account.primaryStoreId || resolved.account.storeId || storeIds[0] || '',
    );
    const token = await signTokenFor(resolved, currentStoreId);
    resolved.account.lastLogin = new Date();
    await resolved.account.save();
    res.json(ok({ token, user: await userResponse(resolved, currentStoreId) }));
  } catch (err) {
    next(err);
  }
});

// ---------- VENDOR / SUPER ADMIN LOGIN ----------------------------------
// Used exclusively by the separate vendor portal. Trust boundary: the
// tenant app does NOT have a button that hits this endpoint.
router.post('/super-admin/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const resolved = await findSuperAdminByEmail(email);
    if (!resolved || !(await resolved.account.comparePassword(password || ''))) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    if (resolved.account.isActive === false) {
      throw new AppError(
        'ACCOUNT_DISABLED',
        'Your platform account has been disabled.',
        403,
      );
    }
    const token = await signTokenFor(resolved, '');
    resolved.account.lastLogin = new Date();
    await resolved.account.save();
    res.json(ok({ token, user: await userResponse(resolved, '') }));
  } catch (err) {
    next(err);
  }
});

// ---------- WHO AM I ----------------------------------------------------
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const resolved = await findAccountById(req.user.id, req.user.userType);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    res.json(
      ok({ user: await userResponse(resolved, String(req.user.storeId || '')) }),
    );
  } catch (err) {
    next(err);
  }
});

// ---------- STORE SWITCH ------------------------------------------------
// Tenant-side only. Super_admin has no store concept and isn't issued
// store-scoped tokens, so this endpoint rejects them explicitly.
router.post('/switch-store/:storeId', authenticate, async (req, res, next) => {
  try {
    if (req.user.userType === USER_TYPE.SUPER_ADMIN) {
      throw new AppError('NOT_APPLICABLE', 'Platform admins do not switch stores.', 400);
    }
    const requested = String(req.params.storeId);
    const resolved = await findAccountById(req.user.id, req.user.userType);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    const granted = await pickStoreIdsForAccount(resolved);
    if (!granted.includes(requested)) {
      throw new AppError('STORE_NOT_GRANTED', 'You do not have access to that store', 403);
    }
    const token = await signTokenFor(resolved, requested);
    res.json(ok({ token, user: await userResponse(resolved, requested) }));
  } catch (err) {
    next(err);
  }
});

export default router;
