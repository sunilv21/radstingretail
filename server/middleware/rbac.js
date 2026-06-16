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

/**
 * Map an HTTP method to a coarse RBAC action. GET/HEAD/OPTIONS → 'read';
 * POST → 'create'; PUT/PATCH → 'update'; DELETE → 'delete'.
 *
 * NOTE: this is the *baseline* per-resource gate. Sub-actions that need finer
 * granularity than the verb implies (e.g. POST /sales/:id/return is a 'void',
 * POST /purchases/:id/pay is an 'update' not a 'create') are tagged explicitly
 * on those routes with `requirePermission(...)`, which runs in addition to
 * this and can only further restrict. Defense in depth, never weaker.
 */
function actionForMethod(method) {
  switch (method) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'read';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'update';
  }
}

/**
 * Router-level RBAC gate bound to a single resource. Mounted in the shared
 * auth stack so every data router is default-deny against the matrix — this
 * is what stops a cashier from POSTing to /accounting, /payroll, /gst, or
 * rewriting store/GSP credentials. Reads are gated too, exactly per the
 * matrix (a role with no grant on the resource can't read it either).
 *
 *   app.use('/api/accounting', ...authStack, enforceResource('accounting'), router)
 */
export function enforceResource(resource) {
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role) return next(new AppError('UNAUTHENTICATED', 'Sign in required', 401));
    const action = actionForMethod(req.method);
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
