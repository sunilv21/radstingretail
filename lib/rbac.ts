/**
 * Frontend mirror of `server/rbac/matrix.js`. Keep them in lockstep — the
 * server is the authority (it always re-checks every request), but the UI
 * uses this to hide buttons for things the user can't do.
 */

import type { AuthUser, Role } from './types'

const MATRIX: Record<Role, Record<string, string[]>> = {
  super_admin: { '*': ['*'] },

  admin: {
    sales:      ['*'],
    products:   ['*'],
    inventory:  ['*'],
    purchases:  ['*'],
    customers:  ['*'],
    suppliers:  ['*'],
    accounting: ['*'],
    gst:        ['*'],
    reports:    ['*'],
    payroll:    ['*'],
    store:      ['*'],
    transfers:  ['*'],
    users:      ['*'],
    org:        ['read', 'update'],
    audit:      ['read'],
  },

  manager: {
    sales:      ['read', 'create', 'update', 'void'],
    products:   ['*'],
    inventory:  ['*'],
    purchases:  ['read', 'create', 'update'],
    customers:  ['*'],
    suppliers:  ['*'],
    accounting: ['read'],
    gst:        ['read'],
    reports:    ['read', 'export'],
    payroll:    ['read'],
    transfers:  ['read', 'create', 'update'],
    store:      ['read'],
    users:      ['read'],
    audit:      ['read'],
  },

  cashier: {
    // Floor-level role — sells, restocks, raises POs, transfers stock.
    // No finance / GST / reports / payroll / audit / users / settings.
    sales:     ['read', 'create'],
    products:  ['read', 'create', 'update'],
    inventory: ['read', 'update'],
    purchases: ['read', 'create'],
    customers: ['read', 'create'],
    suppliers: ['read', 'create'],
    transfers: ['read', 'create'],
    store:     ['read'],
  },

  accountant: {
    sales:      ['read'],
    purchases:  ['read'],
    customers:  ['read'],
    suppliers:  ['read'],
    accounting: ['*'],
    gst:        ['*', 'export'],
    reports:    ['read', 'export'],
    payroll:    ['read'],
    store:      ['read'],
    audit:      ['read'],
  },

  ca: {
    sales:      ['read'],
    purchases:  ['read'],
    accounting: ['read', 'export'],
    gst:        ['read', 'export'],
    reports:    ['read', 'export'],
    store:      ['read'],
  },
}

function normaliseRole(role: string | undefined | null): Role | null {
  if (!role) return null
  const r = String(role).toLowerCase().replace(/\s+/g, '_')
  if (r === 'super_admin' || r === 'superadmin') return 'super_admin'
  if (r === 'admin') return 'admin'
  if (r === 'manager') return 'manager'
  if (r === 'cashier') return 'cashier'
  if (r === 'accountant') return 'accountant'
  if (r === 'ca' || r === 'auditor') return 'ca'
  return null
}

/**
 * Offline sessions (restored from a cached credential, no server token) are
 * restricted to billing-safe actions regardless of the user's online role.
 * Finance / settings / users / payroll / reports are blocked offline — the
 * server isn't there to authorise them and they shouldn't be done blind. The
 * effective offline permission is the INTERSECTION of the role's grants and
 * this allowlist.
 */
const OFFLINE_ALLOW: Record<string, string[]> = {
  sales:     ['read', 'create'],
  products:  ['read'],
  inventory: ['read'],
  customers: ['read', 'create'],
  suppliers: ['read'],
}

function isOfflineSessionFlag(): boolean {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem('session-offline') === '1' } catch { return false }
}

function roleAllows(grants: Record<string, string[]>, resource: string, action: string): boolean {
  for (const allowed of [grants['*'], grants[resource]].filter(Boolean) as string[][]) {
    if (allowed.includes('*')) return true
    if (allowed.includes(action)) return true
  }
  return false
}

export function can(
  user: AuthUser | null | undefined,
  resource: string,
  action: string,
): boolean {
  const r = normaliseRole(user?.role)
  if (!r) return false
  const grants = MATRIX[r]
  if (!grants) return false
  if (!roleAllows(grants, resource, action)) return false
  // Offline: further restrict to the billing-safe allowlist.
  if (isOfflineSessionFlag()) {
    return (OFFLINE_ALLOW[resource] || []).includes(action)
  }
  return true
}

export function isReadOnly(user: AuthUser | null | undefined): boolean {
  const r = normaliseRole(user?.role)
  return r === 'ca'
}

/** Read the user blob the auth flow stuck into localStorage. */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('user')
    if (!raw || raw === 'null' || raw === 'undefined') return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

/**
 * True when the user's currently-selected branch is a warehouse. Drives the
 * "warehouse mode" UI — sidebar hides POS/Sales/Warranties/GST/Customers/
 * Party-settlement, and the dashboard swaps to a stock-centric variant.
 */
export function isActiveWarehouse(user: AuthUser | null | undefined): boolean {
  if (!user?.storeId || !user.stores) return false
  const active = user.stores.find((s) => String(s._id) === String(user.storeId))
  return active?.type === 'warehouse'
}
