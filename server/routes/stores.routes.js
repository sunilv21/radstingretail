import { Router } from 'express';
import jwt from 'jsonwebtoken';
import Store from '../models/Store.js';
import User from '../models/User.js';
import TenantAdmin from '../models/TenantAdmin.js';
import { ok, AppError } from '../utils/response.js';
import { requirePermission } from '../middleware/rbac.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { permissionsFor } from '../rbac/matrix.js';
import { enforceStoreLimit } from '../utils/enforcePlanLimit.js';
import { USER_TYPE } from '../services/accountLookup.js';
import { seedStoreAccounts } from '../services/seedStoreAccounts.js';

/**
 * Build a fresh access token for `account` after their store grants
 * changed. Works for both tenant_admin (org-wide) and staff (explicit
 * grants only). For org-wide roles we resolve every active store in the
 * org so the JWT carries every branch the caller can switch into.
 */
async function reissueAuthForAccount(account, userType, currentStoreId) {
  const ids = new Set((account.storeIds || []).map((s) => String(s)));
  if (account.storeId) ids.add(String(account.storeId));
  if (account.primaryStoreId) ids.add(String(account.primaryStoreId));

  // Tenant admins (and accountant / ca staff) get every active store in
  // their org. Without this, a tenant_admin who created a new branch
  // wouldn't see it in the StoreSwitcher because their personal
  // storeIds list isn't the source of truth for org-wide roles.
  const role = String(account.role || '').toLowerCase();
  const orgWide =
    userType === USER_TYPE.TENANT_ADMIN ||
    ['accountant', 'ca'].includes(role);
  if (orgWide && account.organizationId) {
    const all = await Store.find({
      organizationId: account.organizationId,
      isActive: { $ne: false },
    })
      .select({ _id: 1 })
      .lean();
    for (const s of all) ids.add(String(s._id));
  }

  const storeIds = Array.from(ids);
  const stores = storeIds.length
    ? await Store.find({ _id: { $in: storeIds } }).select({ name: 1, code: 1, type: 1 }).lean()
    : [];

  const effectiveRole =
    userType === USER_TYPE.TENANT_ADMIN ? 'admin' : (account.role || 'cashier');

  const token = jwt.sign(
    {
      id: account._id.toString(),
      email: account.email,
      role: effectiveRole,
      userType,
      organizationId: account.organizationId?.toString() || null,
      storeId: String(currentStoreId || ''),
      storeIds,
    },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
  return {
    token,
    user: {
      id: account._id,
      name: account.name,
      email: account.email,
      role: effectiveRole,
      userType,
      organizationId: account.organizationId,
      storeId: String(currentStoreId || ''),
      storeIds,
      stores,
      permissions: permissionsFor(effectiveRole),
    },
  };
}

const router = Router();

/**
 * Branches under the current org. Owner / admin can list and create new
 * branches; cashiers see only their granted stores via /auth/me.
 */
router.get('/', requirePermission('store', 'read'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) {
      // Legacy single-store users — return only their granted store(s).
      const ids = req.user.storeIds?.length ? req.user.storeIds : [req.user.storeId];
      const stores = await Store.find({ _id: { $in: ids } }).lean();
      return res.json(ok(stores));
    }
    const stores = await Store.find({ organizationId: req.user.organizationId })
      .sort({ name: 1 })
      .lean();
    res.json(ok(stores));
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('store', 'create'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }
    const { name, code, gstNumber, gstRegistered, stateCode, phone, email, invoicePrefix, address, type } = req.body || {};
    if (!name) throw new AppError('VALIDATION_ERROR', 'Branch name is required', 400);

    // Plan-limit gate. Counts current active stores/warehouses for the org
    // and rejects with PLAN_LIMIT_REACHED before any duplicate-code check.
    const locType = type === 'warehouse' ? 'warehouse' : 'store';
    await enforceStoreLimit(req.user.organizationId, locType);

    // GST-registered branches must carry a GSTIN. Unregistered branches
    // store an empty GSTIN regardless of what the form sent.
    const isRegistered = gstRegistered !== false;
    if (isRegistered && !String(gstNumber || '').trim()) {
      throw new AppError(
        'GSTIN_REQUIRED',
        'Registered branches must have a GSTIN. Switch to "Unregistered" if this branch is not GST-registered.',
        400,
      );
    }

    // Code must be unique within the org so reports can pivot by branch code.
    if (code) {
      const dupe = await Store.findOne({
        organizationId: req.user.organizationId,
        code: code.toUpperCase().trim(),
      });
      if (dupe) throw new AppError('CODE_DUPLICATE', `Branch code "${code}" already exists`, 409);
    }

    const store = await Store.create({
      organizationId: req.user.organizationId,
      name: String(name).trim(),
      type: locType,
      code: code ? String(code).toUpperCase().trim() : '',
      gstNumber: isRegistered ? String(gstNumber).trim().toUpperCase() : '',
      gstRegistered: isRegistered,
      stateCode: stateCode || '07',
      phone: phone || '',
      email: email || '',
      invoicePrefix: invoicePrefix || 'INV',
      invoiceCounter: 0,
      address: address || {},
    });

    // Seed the chart of accounts for the new branch. Without this, the
    // first POS sale, purchase GRN, or voucher tries to debit/credit an
    // account that doesn't exist for this storeId and the ledger engine
    // rolls back the whole atomic transaction.
    await seedStoreAccounts(store._id);

    // Grant the creator access to the new branch and reissue their token so
    // the StoreSwitcher and PlanUsageBadge in their browser pick it up
    // immediately. Resolve the creator from the right collection — earlier
    // versions of this handler only checked `users`, which silently no-op'd
    // for tenant_admins (who live in `tenantadmins`) and broke the auto-
    // refresh of the switcher / branch count on their browsers.
    let auth = null;
    try {
      const userType = req.user.userType;
      const Model = userType === USER_TYPE.TENANT_ADMIN ? TenantAdmin : User;
      const creator = await Model.findById(req.user.id);
      if (creator) {
        const ids = new Set((creator.storeIds || []).map((s) => String(s)));
        ids.add(String(store._id));
        creator.storeIds = Array.from(ids);
        if (!creator.primaryStoreId && !creator.storeId) creator.primaryStoreId = store._id;
        await creator.save();
        auth = await reissueAuthForAccount(creator, userType, req.user.storeId);
      }
    } catch (refreshErr) {
      // Branch was created — failure to refresh the token is non-fatal; the
      // user can re-login to see the switcher update.
      console.warn('[stores] auth refresh after create failed:', refreshErr?.message);
    }

    res.status(201).json(ok({ store, ...(auth || {}) }));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePermission('store', 'update'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const store = await Store.findById(id);
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Branch not found', 404);
    if (
      req.user.organizationId &&
      String(store.organizationId) !== String(req.user.organizationId)
    ) {
      throw new AppError('FORBIDDEN', 'Branch belongs to another organization', 403);
    }
    const fields = ['name', 'code', 'gstNumber', 'stateCode', 'phone', 'email', 'invoicePrefix'];
    for (const f of fields) {
      if (req.body[f] !== undefined) store[f] = req.body[f];
    }
    if (req.body.gstRegistered !== undefined) {
      store.gstRegistered = !!req.body.gstRegistered;
      if (!store.gstRegistered) store.gstNumber = '';
      if (store.gstRegistered && !String(store.gstNumber || '').trim()) {
        throw new AppError(
          'GSTIN_REQUIRED',
          'Registered branches must have a GSTIN.',
          400,
        );
      }
    }
    if (req.body.address && typeof req.body.address === 'object') {
      store.address = { ...(store.address?.toObject?.() || store.address || {}), ...req.body.address };
    }
    if (req.body.isActive !== undefined) store.isActive = !!req.body.isActive;
    await store.save();
    res.json(ok(store.toObject()));
  } catch (err) {
    next(err);
  }
});

export default router;
