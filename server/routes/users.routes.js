import { Router } from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import TenantAdmin from '../models/TenantAdmin.js';
import Store from '../models/Store.js';
import InviteToken from '../models/InviteToken.js';
import { ok, AppError } from '../utils/response.js';
import { requirePermission } from '../middleware/rbac.js';
import { authenticate } from '../middleware/auth.js';
import { normaliseRole } from '../rbac/matrix.js';
import { isEmailTaken, USER_TYPE } from '../services/accountLookup.js';
import { enforceUserLimit } from '../utils/enforcePlanLimit.js';

const router = Router();

// Staff-only roles. The tenant admin themselves lives in `tenantadmins` and
// is created via the platform onboarding flow — NOT through this endpoint.
const VALID_ROLES = ['manager', 'cashier', 'accountant', 'ca'];
const INVITE_TTL_DAYS = 14;
const CA_INVITE_TTL_DAYS = 90;

function publicUser(u) {
  return {
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    organizationId: u.organizationId,
    storeIds: u.storeIds || [],
    primaryStoreId: u.primaryStoreId,
    isActive: u.isActive !== false,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
  };
}

// --- CREATE USER directly (admin sets password — no invite link).
//     Works for every staff role including CA. The 90-day time-bound
//     `Invite CA` flow still exists alongside this for external auditors
//     who shouldn't get a permanent account. ---
router.post('/', requirePermission('users', 'create'), async (req, res, next) => {
  try {
    const { name, email, role, storeIds, password, primaryStoreId } = req.body || {};

    if (!email || !role || !password) {
      throw new AppError('VALIDATION_ERROR', 'name, email, role and password are required', 400);
    }
    if (!String(name || '').trim()) {
      throw new AppError('VALIDATION_ERROR', 'name is required', 400);
    }
    const cleanRole = normaliseRole(role);
    if (!VALID_ROLES.includes(cleanRole)) {
      throw new AppError('VALIDATION_ERROR', `role must be one of: ${VALID_ROLES.join(', ')}`, 400);
    }
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }
    if (String(password).length < 8) {
      throw new AppError('WEAK_PASSWORD', 'Password must be at least 8 characters', 400);
    }

    const cleanEmail = String(email).toLowerCase().trim();
    if (await isEmailTaken(cleanEmail)) {
      throw new AppError(
        'USER_EXISTS',
        `An account with email ${cleanEmail} already exists.`,
        409,
      );
    }

    // Plan-limit gate. Counts active staff in this org with the same role.
    await enforceUserLimit(req.user.organizationId, cleanRole);

    // Validate every requested store belongs to this org.
    let requestedIds = Array.isArray(storeIds) ? storeIds.map((s) => String(s)) : [];
    if (requestedIds.length) {
      const orgStores = await Store.find({
        _id: { $in: requestedIds },
        organizationId: req.user.organizationId,
      }).select({ _id: 1 }).lean();
      if (orgStores.length !== requestedIds.length) {
        throw new AppError('FORBIDDEN', 'One or more stores are outside your organization', 403);
      }
    }

    // CA auditors are org-wide by design — if none specified, auto-grant
    // every store in the org. Matches the behaviour of the CA invite-accept
    // path so direct-create and invite-accept produce identical CA records.
    if (cleanRole === 'ca' && requestedIds.length === 0) {
      const orgStores = await Store.find({
        organizationId: req.user.organizationId,
      }).select({ _id: 1 }).lean();
      requestedIds = orgStores.map((s) => String(s._id));
    }

    const primary = primaryStoreId && requestedIds.includes(String(primaryStoreId))
      ? String(primaryStoreId)
      : (requestedIds[0] || null);

    // bcrypt hashing happens in the User pre-save hook.
    const user = await User.create({
      name: String(name).trim(),
      email: cleanEmail,
      password: String(password),
      role: cleanRole,
      organizationId: req.user.organizationId,
      storeIds: requestedIds,
      primaryStoreId: primary,
      isActive: true,
    });

    res.status(201).json(ok(publicUser(user)));
  } catch (err) {
    next(err);
  }
});

// --- LIST USERS in your organization (admins + staff merged). ---
router.get('/', requirePermission('users', 'read'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) return res.json(ok([]));
    const orgId = req.user.organizationId;

    const [admins, staff] = await Promise.all([
      TenantAdmin.find({ organizationId: orgId }).sort({ createdAt: -1 }).lean(),
      User.find({ organizationId: orgId }).sort({ createdAt: -1 }).lean(),
    ]);

    const merged = [
      ...admins.map((a) => ({ ...publicUser(a), role: 'admin', userType: USER_TYPE.TENANT_ADMIN })),
      ...staff.map((u) => ({ ...publicUser(u), userType: USER_TYPE.STAFF })),
    ];

    // Optional client-side filter by role.
    const roleFilter = req.query.role ? String(req.query.role) : null;
    const result = roleFilter ? merged.filter((u) => u.role === roleFilter) : merged;

    result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

// --- INVITE: creates a token; in dev we also return the accept URL so the
//     admin can copy-paste it (no SMTP required). When email/SMS provider is
//     configured, this is where we fire it off. ---
router.post('/invite', requirePermission('users', 'create'), async (req, res, next) => {
  try {
    const { email, name, role, storeIds } = req.body || {};
    if (!email || !role) {
      throw new AppError('VALIDATION_ERROR', 'email and role are required', 400);
    }
    if (!VALID_ROLES.includes(normaliseRole(role))) {
      throw new AppError('VALIDATION_ERROR', `role must be one of: ${VALID_ROLES.join(', ')}`, 400);
    }
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw new AppError(
        'USER_EXISTS',
        `A user with email ${cleanEmail} already exists. Edit their role instead.`,
        409,
      );
    }

    // Validate all requested storeIds belong to this org. CA invites don't
    // need any store grant — they get full-org read access.
    const requestedIds = Array.isArray(storeIds) ? storeIds : [];
    if (requestedIds.length) {
      const orgStores = await Store.find({
        _id: { $in: requestedIds },
        organizationId: req.user.organizationId,
      }).select({ _id: 1 }).lean();
      if (orgStores.length !== requestedIds.length) {
        throw new AppError('FORBIDDEN', 'One or more stores are outside your organization', 403);
      }
    }

    const tokenStr = crypto.randomBytes(24).toString('hex');
    const ttlDays = role === 'ca' ? CA_INVITE_TTL_DAYS : INVITE_TTL_DAYS;
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    const invite = await InviteToken.create({
      token: tokenStr,
      organizationId: req.user.organizationId,
      email: cleanEmail,
      name: name || '',
      role: normaliseRole(role),
      storeIds: requestedIds,
      invitedBy: req.user.id,
      expiresAt,
    });

    // Build the accept URL the admin can hand off. Frontend handles the form.
    const appBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${appBase}/invite/${invite.token}`;

    res.status(201).json(
      ok({
        invite: {
          id: invite._id,
          email: invite.email,
          role: invite.role,
          storeIds: invite.storeIds,
          expiresAt: invite.expiresAt,
        },
        acceptUrl,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// --- LIST PENDING INVITES ---
router.get('/invites', requirePermission('users', 'read'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) return res.json(ok([]));
    const invites = await InviteToken.find({
      organizationId: req.user.organizationId,
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json(ok(invites.map((i) => ({
      id: i._id,
      email: i.email,
      role: i.role,
      storeIds: i.storeIds,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }))));
  } catch (err) {
    next(err);
  }
});

// --- REVOKE INVITE ---
router.delete('/invites/:id', requirePermission('users', 'delete'), async (req, res, next) => {
  try {
    const invite = await InviteToken.findById(req.params.id);
    if (!invite || String(invite.organizationId) !== String(req.user.organizationId)) {
      throw new AppError('NOT_FOUND', 'Invite not found', 404);
    }
    invite.revokedAt = new Date();
    await invite.save();
    res.json(ok({ revoked: true }));
  } catch (err) {
    next(err);
  }
});

// (Public invite lookup + accept moved to server/routes/invites.public.routes.js)

/**
 * Resolve `:id` to either a TenantAdmin row or a User row scoped to the
 * caller's org. Used by PUT / RESET-PASSWORD / DELETE so the routes can
 * operate on the org admin (in `tenantadmins`) or any staff member (in
 * `users`) without the caller having to specify which collection.
 */
async function findOrgAccount(id, orgId) {
  if (!orgId) return null;
  const ta = await TenantAdmin.findById(id);
  if (ta) {
    if (String(ta.organizationId) !== String(orgId)) return { forbidden: true };
    return { account: ta, userType: USER_TYPE.TENANT_ADMIN };
  }
  const u = await User.findById(id);
  if (u) {
    if (String(u.organizationId) !== String(orgId)) return { forbidden: true };
    return { account: u, userType: USER_TYPE.STAFF };
  }
  return null;
}

// --- UPDATE user. Org admin (TenantAdmin) gets name + storeIds + isActive.
//     Staff (User) also accepts role. Cannot remove the last active admin
//     and cannot promote a staff user to admin via this endpoint (that's a
//     platform-side action — vendor moves the row, or the existing admin
//     creates a new one).                                                 -*/
router.put('/:id', requirePermission('users', 'update'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }
    const resolved = await findOrgAccount(req.params.id, req.user.organizationId);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (resolved.forbidden) {
      throw new AppError('FORBIDDEN', 'User belongs to a different organization', 403);
    }
    const { account, userType } = resolved;
    const isAdminRow = userType === USER_TYPE.TENANT_ADMIN;

    if (req.body.name !== undefined) account.name = String(req.body.name).trim();

    if (req.body.role !== undefined && !isAdminRow) {
      const r = normaliseRole(req.body.role);
      if (!VALID_ROLES.includes(r)) {
        throw new AppError('VALIDATION_ERROR', `role must be one of: ${VALID_ROLES.join(', ')}`, 400);
      }
      account.role = r;
    } else if (req.body.role !== undefined && isAdminRow) {
      // Demoting the org owner away from admin is a platform-side concern —
      // it would orphan the org. Reject from the tenant-side endpoint.
      throw new AppError(
        'FORBIDDEN_ROLE',
        'The org admin role cannot be changed from this endpoint.',
        403,
      );
    }

    if (Array.isArray(req.body.storeIds)) {
      const requested = req.body.storeIds.map((s) => String(s));
      const orgStores = await Store.find({
        _id: { $in: requested },
        organizationId: req.user.organizationId,
      }).select({ _id: 1 }).lean();
      if (orgStores.length !== requested.length) {
        throw new AppError('FORBIDDEN', 'One or more stores are outside your organization', 403);
      }
      account.storeIds = requested;
      if (!requested.includes(String(account.primaryStoreId))) {
        account.primaryStoreId = requested[0] || null;
      }
    }

    if (req.body.isActive !== undefined) {
      account.isActive = !!req.body.isActive;
      // LAST_ADMIN safeguard: an admin cannot disable the only remaining
      // active admin in their org.
      if (isAdminRow && account.isActive === false) {
        const remaining = await TenantAdmin.countDocuments({
          organizationId: req.user.organizationId,
          isActive: true,
          _id: { $ne: account._id },
        });
        if (remaining === 0) {
          throw new AppError(
            'LAST_ADMIN',
            'Cannot disable the last active admin of this organization. Add another admin first.',
            400,
          );
        }
      }
    }

    await account.save();
    res.json(ok({
      ...publicUser(account),
      role: isAdminRow ? 'admin' : account.role,
      userType,
    }));
  } catch (err) {
    next(err);
  }
});

// --- RESET PASSWORD (admin sets a new password for any user in the org). --*/
router.put('/:id/password', requirePermission('users', 'update'), async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 8) {
      throw new AppError('WEAK_PASSWORD', 'Password must be at least 8 characters', 400);
    }
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }
    const resolved = await findOrgAccount(req.params.id, req.user.organizationId);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (resolved.forbidden) {
      throw new AppError('FORBIDDEN', 'User belongs to a different organization', 403);
    }
    resolved.account.password = String(password);
    await resolved.account.save();
    res.json(ok({ updated: true }));
  } catch (err) {
    next(err);
  }
});

// --- DEACTIVATE (soft-delete; never hard-delete tenant users for audit). --*/
router.delete('/:id', requirePermission('users', 'delete'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }
    const resolved = await findOrgAccount(req.params.id, req.user.organizationId);
    if (!resolved) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (resolved.forbidden) {
      throw new AppError('FORBIDDEN', 'User belongs to a different organization', 403);
    }
    if (resolved.userType === USER_TYPE.TENANT_ADMIN) {
      const remaining = await TenantAdmin.countDocuments({
        organizationId: req.user.organizationId,
        isActive: true,
        _id: { $ne: resolved.account._id },
      });
      if (remaining === 0) {
        throw new AppError(
          'LAST_ADMIN',
          'Cannot disable the last active admin of this organization.',
          400,
        );
      }
    }
    resolved.account.isActive = false;
    await resolved.account.save();
    res.json(ok({ deactivated: true }));
  } catch (err) {
    next(err);
  }
});

export default router;

// authenticate is re-exported here only to keep the imports tidy in index.js;
// actual mounting still happens with the explicit `authenticate` middleware.
export { authenticate };
