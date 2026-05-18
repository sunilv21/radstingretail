import { AppError } from '../utils/response.js';
import { USER_TYPE } from '../services/accountLookup.js';

/**
 * Platform-level guard: only the software vendor (super_admin) may pass.
 * Reads the `userType` claim that `authenticate` placed on req.user — the
 * plain `role` string is no longer authoritative because legacy tokens may
 * still carry the old admin/super_admin string for compatibility.
 */
export function requireSuperAdmin(req, _res, next) {
  if (!req.user) {
    return next(new AppError('UNAUTHORISED', 'Login required', 401));
  }
  if (req.user.userType !== USER_TYPE.SUPER_ADMIN) {
    return next(
      new AppError(
        'PLATFORM_ONLY',
        'This endpoint is restricted to the software vendor (super_admin).',
        403,
      ),
    );
  }
  next();
}
