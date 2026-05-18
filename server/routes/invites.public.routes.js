/**
 * Un-authenticated invite-acceptance routes. The invite token IS the auth.
 * Mounted at /api/invites in the public section so the invitee can hit
 * these endpoints before they have an account.
 */
import { Router } from 'express';
import User from '../models/User.js';
import Store from '../models/Store.js';
import InviteToken from '../models/InviteToken.js';
import { ok, AppError } from '../utils/response.js';

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const invite = await InviteToken.findOne({ token: String(req.params.token) }).lean();
    if (!invite) throw new AppError('INVITE_NOT_FOUND', 'Invitation link is invalid', 404);
    if (invite.usedAt) throw new AppError('INVITE_USED', 'This invitation was already used', 410);
    if (invite.revokedAt) throw new AppError('INVITE_REVOKED', 'This invitation was revoked', 410);
    if (new Date(invite.expiresAt) < new Date()) {
      throw new AppError('INVITE_EXPIRED', 'This invitation has expired', 410);
    }
    res.json(ok({
      email: invite.email,
      role: invite.role,
      organizationId: invite.organizationId,
    }));
  } catch (err) {
    next(err);
  }
});

router.post('/:token/accept', async (req, res, next) => {
  try {
    const { name, password } = req.body || {};
    if (!password || password.length < 6) {
      throw new AppError('VALIDATION_ERROR', 'Password must be at least 6 characters', 400);
    }
    const invite = await InviteToken.findOne({ token: String(req.params.token) });
    if (!invite) throw new AppError('INVITE_NOT_FOUND', 'Invitation link is invalid', 404);
    if (invite.usedAt) throw new AppError('INVITE_USED', 'This invitation was already used', 410);
    if (invite.revokedAt) throw new AppError('INVITE_REVOKED', 'This invitation was revoked', 410);
    if (new Date(invite.expiresAt) < new Date()) {
      throw new AppError('INVITE_EXPIRED', 'This invitation has expired', 410);
    }

    const dupe = await User.findOne({ email: invite.email });
    if (dupe) throw new AppError('USER_EXISTS', 'An account already exists for this email', 409);

    // CAs / accountants get cross-branch access automatically — they need to
    // see books across every branch in the org. Other roles keep the explicit
    // storeIds the admin picked.
    let effectiveStoreIds = (invite.storeIds || []).map((s) => String(s));
    if (
      effectiveStoreIds.length === 0 &&
      ['ca', 'accountant'].includes(invite.role)
    ) {
      const orgStores = await Store.find({
        organizationId: invite.organizationId,
        isActive: { $ne: false },
      }).select({ _id: 1 }).lean();
      effectiveStoreIds = orgStores.map((s) => String(s._id));
    }

    const user = await User.create({
      name: name?.trim() || invite.name || invite.email.split('@')[0],
      email: invite.email,
      password,
      role: invite.role,
      organizationId: invite.organizationId,
      storeIds: effectiveStoreIds,
      primaryStoreId: effectiveStoreIds[0] || null,
      isActive: true,
    });

    invite.usedAt = new Date();
    await invite.save();

    res.status(201).json(ok({ ok: true, email: user.email, role: user.role }));
  } catch (err) {
    next(err);
  }
});

export default router;
