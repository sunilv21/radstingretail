/**
 * authenticate — verifies the JWT and attaches the canonical row from the
 * right collection (`superadmins` / `tenantadmins` / `users`) onto
 * `req.user`. Every downstream piece of middleware (rbac, audit, scope-by-
 * store, subscription guard) reads from `req.user.userType` to know which
 * collection the row came from.
 *
 * Backward-compat: tokens issued before the multi-tenant split don't have
 * `userType`. We derive it from the legacy `role` claim so old sessions
 * still work without forcing a re-login.
 */
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/response.js';
import {
  USER_TYPE,
  findAccountById,
  deriveUserType,
} from '../services/accountLookup.js';
import Store from '../models/Store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function authenticate(req, _res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(new AppError('NO_TOKEN', 'No token provided', 401));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userType = decoded.userType || deriveUserType(decoded.role);

    const resolved = await findAccountById(decoded.id, userType);
    if (!resolved) return next(new AppError('USER_NOT_FOUND', 'User not found', 401));
    const account = resolved.account;
    if (account.isActive === false) {
      return next(new AppError('ACCOUNT_DISABLED', 'Your account has been disabled', 403));
    }

    // Super admins have no store concept — skip the storeId resolution.
    let activeStoreId = '';
    let storeIds = [];
    if (resolved.userType !== USER_TYPE.SUPER_ADMIN) {
      storeIds = (account.storeIds || []).map((s) => String(s));
      const legacyStoreId = account.storeId ? String(account.storeId) : null;
      if (legacyStoreId && !storeIds.includes(legacyStoreId)) storeIds.push(legacyStoreId);

      // Live-resolve the org's stores for org-wide roles. Without this, a
      // tenant_admin whose account row has `storeIds: []` (because they
      // were onboarded before the auto-default-store change, or because
      // their JWT predates the backfill) ends up with an empty
      // activeStoreId, and every route that does Store.findById(storeId)
      // blows up with a Mongoose CastError → "Invalid id".
      const role = String(account.role || decoded.role || '').toLowerCase();
      const orgWide =
        resolved.userType === USER_TYPE.TENANT_ADMIN ||
        ['accountant', 'ca'].includes(role);
      if (orgWide && account.organizationId) {
        const orgStores = await Store.find({
          organizationId: account.organizationId,
          isActive: { $ne: false },
        })
          .select({ _id: 1 })
          .lean();
        for (const s of orgStores) {
          const id = String(s._id);
          if (!storeIds.includes(id)) storeIds.push(id);
        }
      }

      activeStoreId = String(decoded.storeId || decoded.currentStoreId || '');
      if (!activeStoreId || !storeIds.includes(activeStoreId)) {
        activeStoreId = String(account.primaryStoreId || legacyStoreId || storeIds[0] || '');
      }
    }

    req.user = {
      id: account._id,
      name: account.name,
      email: account.email,
      role: decoded.role || account.role || (resolved.userType === USER_TYPE.TENANT_ADMIN ? 'admin' : ''),
      userType: resolved.userType,
      organizationId: account.organizationId || null,
      storeId: activeStoreId,
      storeIds,
      permissions: account.permissions,
    };
    next();
  } catch (err) {
    next(new AppError('TOKEN_INVALID', 'Invalid or expired token', 401));
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('FORBIDDEN', `Requires one of: ${roles.join(', ')}`, 403));
  }
  next();
};

export { JWT_SECRET };
