/**
 * Subscription guard — runs after `authenticate`, blocks tenants whose
 * subscription has expired or been hard-blocked by the vendor. The vendor's
 * own `super_admin` account is never gated (so they can still log in to
 * unblock customers). Tenants without an organizationId are also bypassed
 * (legacy single-store users) — those would never be expired anyway.
 *
 * On block:
 *   HTTP 402 Payment Required
 *   { error: { code: 'SUBSCRIPTION_EXPIRED' | 'SUBSCRIPTION_BLOCKED', ... } }
 *
 * The frontend interprets this code and shows a "renew your subscription"
 * banner instead of letting the user click around a half-broken UI.
 */
import Organization from '../models/Organization.js';
import {
  deriveSubscriptionStatus,
  isActiveStatus,
  subscriptionView,
} from '../utils/subscription.js';
import { AppError } from '../utils/response.js';
import { USER_TYPE } from '../services/accountLookup.js';

// In-memory cache so we don't hit Mongo on every request. 30-second TTL —
// long enough to skip thousands of repeats during normal use, short enough
// that the vendor's "Extend subscription" click takes effect almost
// immediately on the customer's next request.
const cache = new Map();
const TTL_MS = 30_000;

function getOrgFromCache(id) {
  const hit = cache.get(String(id));
  if (!hit) return null;
  if (Date.now() - hit.t > TTL_MS) {
    cache.delete(String(id));
    return null;
  }
  return hit.org;
}
function setOrgInCache(id, org) {
  cache.set(String(id), { org, t: Date.now() });
}
export function invalidateOrgCache(id) {
  if (id) cache.delete(String(id));
  else cache.clear();
}

export async function subscriptionGuard(req, _res, next) {
  try {
    if (!req.user) return next(); // public route — auth middleware handles 401
    // Super admins are vendor-side and bypass tenant subscription checks.
    if (req.user.userType === USER_TYPE.SUPER_ADMIN) return next();
    const orgId = req.user.organizationId;
    if (!orgId) return next();

    let org = getOrgFromCache(orgId);
    if (!org) {
      org = await Organization.findById(orgId).lean();
      if (org) setOrgInCache(orgId, org);
    }
    if (!org) return next(); // no org row — let downstream return 404

    const status = deriveSubscriptionStatus(org);
    req.subscription = subscriptionView(org);

    if (isActiveStatus(status)) return next();

    const code = status === 'blocked' ? 'SUBSCRIPTION_BLOCKED' : 'SUBSCRIPTION_EXPIRED';
    const message =
      status === 'blocked'
        ? 'This account has been suspended by the platform. Contact your software vendor to reactivate.'
        : 'Your subscription has expired. Renew to restore access.';
    return next(new AppError(code, message, 402, { status, orgId: String(orgId) }));
  } catch (err) {
    next(err);
  }
}
