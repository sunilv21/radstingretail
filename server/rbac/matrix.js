/**
 * Role-based access control matrix. Single source of truth — both the API
 * middleware and the frontend's permission helper consume this shape.
 *
 * Matrix shape:
 *   ROLE → RESOURCE → ALLOWED ACTIONS
 *
 * Actions are coarse-grained: 'read' | 'create' | 'update' | 'delete' | 'void'
 * + a few resource-specific verbs ('approve', 'export'). Resources mirror our
 * route prefixes ('sales', 'products', 'gst', 'accounting', 'reports', …).
 */

export const ALL_ACTIONS = [
  'read', 'create', 'update', 'delete', 'void', 'approve', 'export',
];

const ALL = '*'; // shorthand for "every action this resource exposes"

/** Roles → resources → allowed actions. */
const MATRIX = {
  super_admin: { '*': [ALL] },

  admin: {
    sales:       [ALL],
    products:    [ALL],
    inventory:   [ALL],
    purchases:   [ALL],
    customers:   [ALL],
    suppliers:   [ALL],
    accounting:  [ALL],
    gst:         [ALL],
    reports:     [ALL],
    payroll:     [ALL],
    store:       [ALL],
    transfers:   [ALL],
    users:       [ALL],
    org:         ['read', 'update'],   // can edit own org but not delete it
    audit:       ['read'],
  },

  manager: {
    sales:       ['read', 'create', 'update', 'void'],
    products:    [ALL],
    inventory:   [ALL],
    purchases:   ['read', 'create', 'update'],
    customers:   [ALL],
    suppliers:   [ALL],
    accounting:  ['read'],
    gst:         ['read'],
    reports:     ['read', 'export'],
    payroll:     ['read'],
    transfers:   ['read', 'create', 'update'],
    store:       ['read'],
    users:       ['read'],
    audit:       ['read'],
  },

  cashier: {
    // Floor-level role: sells, restocks, raises POs, transfers stock.
    // Strictly no finance, no GST, no payroll, no reports, no audit, no
    // user-management, no settings. They can ADD products + suppliers
    // (needed to ring sales and raise POs) but cannot delete or void.
    sales:       ['read', 'create'],
    products:    ['read', 'create', 'update'],
    inventory:   ['read', 'update'],
    purchases:   ['read', 'create'],
    customers:   ['read', 'create'],
    suppliers:   ['read', 'create'],
    transfers:   ['read', 'create'],
    store:       ['read'],
  },

  accountant: {
    sales:       ['read'],
    purchases:   ['read'],
    customers:   ['read'],
    suppliers:   ['read'],
    accounting:  [ALL],             // full CRUD on vouchers + ledger
    gst:         [ALL, 'export'],
    reports:     ['read', 'export'],
    payroll:     ['read'],
    store:       ['read'],
    audit:       ['read'],
  },

  /**
   * External chartered accountant invited by the merchant. Read-only
   * everywhere they're allowed; PII (customer phone/email/address) is
   * redacted at the response layer regardless of UI.
   */
  ca: {
    sales:       ['read'],
    purchases:   ['read'],
    accounting:  ['read', 'export'],
    gst:         ['read', 'export'],
    reports:     ['read', 'export'],
    store:       ['read'],
  },
};

/**
 * Normalise the legacy capitalised roles ("Admin" / "Manager" / "Cashier" /
 * "Accountant") to the canonical lower-snake-case form.
 */
function normaliseRole(role) {
  const r = String(role || '').toLowerCase().replace(/\s+/g, '_');
  if (r === 'super_admin' || r === 'superadmin') return 'super_admin';
  if (r === 'admin') return 'admin';
  if (r === 'manager') return 'manager';
  if (r === 'cashier') return 'cashier';
  if (r === 'accountant') return 'accountant';
  if (r === 'ca' || r === 'auditor') return 'ca';
  return null;
}

/**
 * Returns true if the role is allowed to perform `action` on `resource`.
 * Wildcards: super_admin gets everything; any role with `'*'` as a resource
 * gets the action wildcard for every resource.
 */
export function canActOn(role, resource, action) {
  const r = normaliseRole(role);
  if (!r) return false;
  const grants = MATRIX[r];
  if (!grants) return false;

  const hits = [
    grants['*'],
    grants[resource],
  ].filter(Boolean);
  for (const allowed of hits) {
    if (allowed.includes('*')) return true;
    if (allowed.includes(action)) return true;
  }
  return false;
}

/**
 * Returns the full permission summary for a role — useful for sending to the
 * frontend so it can hide buttons proactively (server-side enforcement still
 * runs on every request).
 */
export function permissionsFor(role) {
  const r = normaliseRole(role);
  if (!r) return {};
  return MATRIX[r] || {};
}

export function isReadOnlyRole(role) {
  const r = normaliseRole(role);
  if (!r) return true;
  if (r === 'ca') return true;
  return false;
}

export { normaliseRole };
