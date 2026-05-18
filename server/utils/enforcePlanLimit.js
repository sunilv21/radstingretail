/**
 * Plan-limit enforcement helpers. Throws AppError('PLAN_LIMIT_REACHED', 403)
 * with a clear, actionable message when a tenant hits their cap.
 */
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import User from '../models/User.js';
import TenantAdmin from '../models/TenantAdmin.js';
import { AppError } from './response.js';
import { getEffectiveLimits } from './planLimits.js';

/**
 * Ensure adding one more store/warehouse won't break the tenant's plan.
 *
 * @param {string} organizationId
 * @param {'store'|'warehouse'} type
 */
export async function enforceStoreLimit(organizationId, type = 'store') {
  if (!organizationId) return;
  const org = await Organization.findById(organizationId).lean();
  if (!org) return; // upstream will 404
  const limits = getEffectiveLimits(org);

  const cap = type === 'warehouse' ? limits.warehouses : limits.stores;
  const currentCount = await Store.countDocuments({
    organizationId: org._id,
    type,
    isActive: { $ne: false },
  });

  if (currentCount >= cap) {
    const noun = type === 'warehouse' ? 'warehouse' : 'store';
    throw new AppError(
      'PLAN_LIMIT_REACHED',
      `Your ${limits.label} plan allows up to ${cap} ${noun}${cap === 1 ? '' : 's'}. ` +
        `You already have ${currentCount}. Ask your software vendor to upgrade your plan to add more.`,
      403,
      { resource: 'stores', type, current: currentCount, cap, plan: org.plan },
    );
  }
}

/**
 * Ensure adding one more user with the given role won't break the cap.
 * Counts BOTH tenantadmins (role 'admin') and users (other roles).
 */
export async function enforceUserLimit(organizationId, role) {
  if (!organizationId) return;
  const org = await Organization.findById(organizationId).lean();
  if (!org) return;
  const limits = getEffectiveLimits(org);

  const r = String(role || '').toLowerCase();
  const cap = limits.users[r];
  if (!Number.isFinite(cap)) {
    // Unknown role — let role validation upstream catch it.
    return;
  }

  let currentCount = 0;
  if (r === 'admin') {
    currentCount = await TenantAdmin.countDocuments({
      organizationId: org._id,
      isActive: { $ne: false },
    });
  } else {
    currentCount = await User.countDocuments({
      organizationId: org._id,
      role: { $regex: new RegExp(`^${r}$`, 'i') },
      isActive: { $ne: false },
    });
  }

  if (currentCount >= cap) {
    throw new AppError(
      'PLAN_LIMIT_REACHED',
      cap === 0
        ? `Your ${limits.label} plan does not include the "${r}" role. Upgrade to add ${r}s.`
        : `Your ${limits.label} plan allows up to ${cap} ${r}${cap === 1 ? '' : 's'}. ` +
          `You already have ${currentCount}. Upgrade your plan to add more.`,
      403,
      { resource: 'users', role: r, current: currentCount, cap, plan: org.plan },
    );
  }
}
