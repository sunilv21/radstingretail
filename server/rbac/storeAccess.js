import Store from '../models/Store.js';

/**
 * Computes the effective set of storeIds a user can act in. Used by both the
 * /auth/login flow (when signing the JWT) and the auth middleware (when
 * validating an incoming token's currentStoreId).
 *
 * Rules:
 *   - super_admin / admin: every active store in the org. Always. Even if
 *     their storeIds[] is empty or stale (a new branch was just added).
 *   - ca / accountant: same — they're org-scoped readers / book-keepers.
 *   - manager / cashier: only the explicit grants in their storeIds[]. If
 *     empty, fall back to legacy single storeId / primaryStoreId.
 */
export async function effectiveStoreIdsForUser(user) {
  const role = String(user?.role || '').toLowerCase();
  const orgWideRoles = new Set(['super_admin', 'admin', 'ca', 'accountant']);

  // Org-wide roles bypass the explicit grants and always see everything.
  if (orgWideRoles.has(role) && user.organizationId) {
    const all = await Store.find({
      organizationId: user.organizationId,
      isActive: { $ne: false },
    })
      .select({ _id: 1 })
      .lean();
    return all.map((s) => String(s._id));
  }

  // Explicit grants.
  const ids = new Set((user.storeIds || []).map((s) => String(s)));
  if (user.storeId) ids.add(String(user.storeId));
  if (user.primaryStoreId) ids.add(String(user.primaryStoreId));
  return Array.from(ids);
}
