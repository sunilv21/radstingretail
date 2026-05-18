/**
 * Client-side mirror of `server/utils/planLimits.js`. Keep in lockstep —
 * the server is authoritative, but the UI uses these to render
 * "X of Y used" indicators without an extra round-trip.
 */

export type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise'

export interface UserCaps {
  admin: number
  manager: number
  cashier: number
  accountant: number
  ca: number
}

export interface PlanLimits {
  label: string
  stores: number
  warehouses: number
  users: UserCaps
}

export const PLAN_LIMITS: Record<Exclude<PlanKey, 'enterprise'>, PlanLimits> = {
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
}

export interface CustomLimitsInput {
  // Allow null too — the DB stores explicit "no override" as null. The
  // server (getEffectiveLimits) treats null and undefined identically.
  stores?: number | null
  warehouses?: number | null
  users?: { [K in keyof UserCaps]?: number | null }
}

/**
 * For `enterprise` plans, customLimits are ABSOLUTE — the vendor sets
 * the full cap matrix. For every other plan, customLimits are
 * ADDITIVE: extra slots granted on top of the plan's built-in
 * defaults (the user_addon payment flow `+= quantity` to these).
 *
 * Kept in lockstep with `server/utils/planLimits.js` on both repos.
 */
export function getEffectiveLimits(plan: string | undefined, customLimits?: CustomLimitsInput | null): PlanLimits {
  const k = String(plan || 'free').toLowerCase() as PlanKey
  const c = customLimits || {}
  const u = c.users || {}
  const grant = (v: number | null | undefined) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  if (k === 'enterprise') {
    return {
      label: 'Enterprise (custom)',
      stores: Number.isFinite(c.stores) ? (c.stores as number) : 999,
      warehouses: Number.isFinite(c.warehouses) ? (c.warehouses as number) : 999,
      users: {
        admin: Number.isFinite(u.admin) ? (u.admin as number) : 999,
        manager: Number.isFinite(u.manager) ? (u.manager as number) : 999,
        cashier: Number.isFinite(u.cashier) ? (u.cashier as number) : 999,
        accountant: Number.isFinite(u.accountant) ? (u.accountant as number) : 999,
        ca: Number.isFinite(u.ca) ? (u.ca as number) : 999,
      },
    }
  }

  const base = PLAN_LIMITS[k as Exclude<PlanKey, 'enterprise'>] || PLAN_LIMITS.free
  return {
    label: base.label,
    stores: base.stores + grant(c.stores),
    warehouses: base.warehouses + grant(c.warehouses),
    users: {
      admin: base.users.admin + grant(u.admin),
      manager: base.users.manager + grant(u.manager),
      cashier: base.users.cashier + grant(u.cashier),
      accountant: base.users.accountant + grant(u.accountant),
      ca: base.users.ca + grant(u.ca),
    },
  }
}

export function totalUserCap(limits: PlanLimits): number {
  return Object.values(limits.users).reduce((s, n) => s + (n || 0), 0)
}
