import { canActOn, isReadOnlyRole } from '../rbac/matrix.js';
import { AppError } from '../utils/response.js';

/**
 * Express middleware factory: gates a route on (resource, action). Usage:
 *
 *   router.post('/whatever', requirePermission('sales', 'create'), handler)
 *
 * Pulls the role from req.user (set by the auth middleware). Returns 403 if
 * the role can't perform the action on the resource.
 */
export function requirePermission(resource, action) {
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role) return next(new AppError('UNAUTHENTICATED', 'Sign in required', 401));
    if (!canActOn(role, resource, action)) {
      return next(
        new AppError(
          'FORBIDDEN',
          `Your role (${role}) is not allowed to ${action} ${resource}`,
          403,
        ),
      );
    }
    next();
  };
}

/**
 * Blanket guard for an entire router: every non-GET request is rejected if
 * the user's role is read-only. Cheaper than tagging every endpoint manually.
 *
 *   router.use(blockWritesForReadOnlyRoles)
 */
export function blockWritesForReadOnlyRoles(req, _res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (isReadOnlyRole(req.user?.role)) {
    return next(new AppError('READ_ONLY', 'Your account is read-only', 403));
  }
  next();
}
