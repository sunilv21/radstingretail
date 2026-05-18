/**
 * Cross-collection account lookup.
 *
 * After the multi-tenant split, every "user" the system knows about lives in
 * one of three collections — `superadmins`, `tenantadmins`, or `users`.
 * Code that has only an id or only an email and needs the row should call
 * one of these helpers instead of guessing which collection to query.
 *
 * The JWT carries `userType` so middleware can short-circuit; the helpers
 * here are for the cases where the userType isn't known (legacy tokens,
 * audit-log row resolution, "find any user by email" support tooling).
 */
import SuperAdmin from '../models/SuperAdmin.js';
import TenantAdmin from '../models/TenantAdmin.js';
import User from '../models/User.js';

/**
 * USER_TYPE values — the string written into the JWT `userType` claim and
 * used by middleware / RBAC to decide which collection holds the canonical
 * row. Keep in sync with the JWT signing code in auth.routes.js.
 */
export const USER_TYPE = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  STAFF: 'staff',
});

const TYPE_TO_MODEL = {
  [USER_TYPE.SUPER_ADMIN]: SuperAdmin,
  [USER_TYPE.TENANT_ADMIN]: TenantAdmin,
  [USER_TYPE.STAFF]: User,
};

export function modelForUserType(userType) {
  return TYPE_TO_MODEL[userType] || null;
}

/**
 * Look up an account by id. If userType is known, query directly. Otherwise
 * try all three collections in priority order (super_admin first because
 * those reads are rare and we want the platform check to be authoritative).
 */
export async function findAccountById(id, userType = null) {
  if (!id) return null;
  if (userType && TYPE_TO_MODEL[userType]) {
    const account = await TYPE_TO_MODEL[userType].findById(id);
    return account ? wrap(account, userType) : null;
  }
  const sa = await SuperAdmin.findById(id);
  if (sa) return wrap(sa, USER_TYPE.SUPER_ADMIN);
  const ta = await TenantAdmin.findById(id);
  if (ta) return wrap(ta, USER_TYPE.TENANT_ADMIN);
  const u = await User.findById(id);
  if (u) return wrap(u, USER_TYPE.STAFF);
  return null;
}

/**
 * Look up an account by email — searched in priority order. Used by the
 * tenant login route to figure out whether to authenticate against
 * `tenantadmins` or `users` (NOT super_admin — that login is on a separate
 * endpoint to keep the trust boundary explicit).
 */
export async function findTenantAccountByEmail(email) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return null;
  const ta = await TenantAdmin.findOne({ email: cleanEmail });
  if (ta) return wrap(ta, USER_TYPE.TENANT_ADMIN);
  const u = await User.findOne({ email: cleanEmail });
  if (u) return wrap(u, USER_TYPE.STAFF);
  return null;
}

export async function findSuperAdminByEmail(email) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return null;
  const sa = await SuperAdmin.findOne({ email: cleanEmail });
  return sa ? wrap(sa, USER_TYPE.SUPER_ADMIN) : null;
}

/**
 * Email uniqueness check across every collection — used during tenant
 * onboarding and staff creation so two accounts can never share an email
 * even if they live in different physical collections.
 */
export async function isEmailTaken(email, excludeId = null) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return false;
  const [sa, ta, u] = await Promise.all([
    SuperAdmin.findOne({ email: cleanEmail }).select({ _id: 1 }).lean(),
    TenantAdmin.findOne({ email: cleanEmail }).select({ _id: 1 }).lean(),
    User.findOne({ email: cleanEmail }).select({ _id: 1 }).lean(),
  ]);
  for (const hit of [sa, ta, u]) {
    if (hit && (!excludeId || String(hit._id) !== String(excludeId))) return true;
  }
  return false;
}

/** Standardise the public shape regardless of which collection the row came from. */
function wrap(account, userType) {
  return { account, userType };
}

/**
 * Derive a userType for a row when reading legacy data. Used by the
 * migration script and anywhere we need to decide where a User-shaped
 * record belongs. Order matters — `super_admin` before `admin` because the
 * historical data set has both terms.
 */
export function deriveUserType(role) {
  const r = String(role || '').toLowerCase().replace(/\s+/g, '_');
  if (r === 'super_admin' || r === 'superadmin') return USER_TYPE.SUPER_ADMIN;
  if (r === 'admin') return USER_TYPE.TENANT_ADMIN;
  return USER_TYPE.STAFF;
}
