/**
 * Plan limits — single source of truth for what each subscription tier
 * permits. The tenant backend uses these to enforce caps on store /
 * user creation; the admin portal uses these to display "X of Y used"
 * indicators and to reveal custom-limits inputs when an enterprise
 * tenant is created.
 *
 * `enterprise` is `null` here on purpose — for that plan, the vendor
 * sets per-tenant `org.customLimits` from the admin portal. Use
 * `getEffectiveLimits(org)` to resolve the right limits for any org.
 */

export const PLAN_LIMITS = {
  free: {
    label: 'Free',
    stores: 1,
    warehouses: 0,
    users: { admin: 1, manager: 0, cashier: 0, accountant: 0, ca: 0 },
  },
  starter: {
    label: 'Starter',
    stores: 2,
    warehouses: 0,
    users: { admin: 1, manager: 1, cashier: 1, accountant: 1, ca: 1 },
  },
  pro: {
    label: 'Pro',
    stores: 4,
    warehouses: 1,
    users: { admin: 1, manager: 2, cashier: 2, accountant: 2, ca: 1 },
  },
  enterprise: null, // resolved per-org via customLimits
};

/** Sum of currently-active (non-expired) per-role user-addon slots. */
function activeAddonByRole(org, now = Date.now()) {
  const out = { admin: 0, manager: 0, cashier: 0, accountant: 0, ca: 0 };
  for (const a of org?.userAddons || []) {
    const exp = a?.expiresAt ? new Date(a.expiresAt).getTime() : 0;
    if (exp <= now) continue;
    const role = String(a.role || '').toLowerCase();
    if (out[role] === undefined) continue;
    out[role] += Math.max(0, Math.floor(Number(a.quantity) || 0));
  }
  return out;
}

/**
 * Returns the limits an org actually operates under.
 *
 *   - `enterprise`: customLimits absolute (vendor sets full matrix)
 *   - any other plan: plan baseline + customLimits (vendor-granted
 *     permanent slots) + non-expired userAddons (paid time-bound).
 *
 * Kept in lockstep with POS system-admin/server/utils/planLimits.js.
 */
export function getEffectiveLimits(org) {
  const plan = String(org?.plan || 'free').toLowerCase();
  const c = org?.customLimits || {};
  const cu = c.users || {};
  const grant = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const addons = activeAddonByRole(org);

  if (plan === 'enterprise') {
    return {
      label: 'Enterprise (custom)',
      stores: Number.isFinite(c.stores) ? c.stores : 999,
      warehouses: Number.isFinite(c.warehouses) ? c.warehouses : 999,
      users: {
        admin: Number.isFinite(cu.admin) ? cu.admin : 999,
        manager: Number.isFinite(cu.manager) ? cu.manager : 999,
        cashier: Number.isFinite(cu.cashier) ? cu.cashier : 999,
        accountant: Number.isFinite(cu.accountant) ? cu.accountant : 999,
        ca: Number.isFinite(cu.ca) ? cu.ca : 999,
      },
    };
  }

  const base = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  return {
    label: base.label,
    stores: base.stores + grant(c.stores),
    warehouses: base.warehouses + grant(c.warehouses),
    users: {
      admin: base.users.admin + grant(cu.admin) + addons.admin,
      manager: base.users.manager + grant(cu.manager) + addons.manager,
      cashier: base.users.cashier + grant(cu.cashier) + addons.cashier,
      accountant: base.users.accountant + grant(cu.accountant) + addons.accountant,
      ca: base.users.ca + grant(cu.ca) + addons.ca,
    },
  };
}

/** Total user cap (sum across all roles) — useful for one-line UI display. */
export function totalUserCap(limits) {
  if (!limits?.users) return 0;
  return Object.values(limits.users).reduce((s, n) => s + (Number(n) || 0), 0);
}
