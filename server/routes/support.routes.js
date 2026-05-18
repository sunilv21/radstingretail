/**
 * Tenant-side support requests. Mounted under /api/support and
 * intentionally NOT subscription-guarded — a blocked tenant has to be
 * able to raise a ticket asking the vendor to reactivate them. Auth is
 * still required (we need to know which org the request belongs to).
 *
 * Tenants can:
 *   GET    /api/support/requests            list their org's requests
 *   GET    /api/support/requests/:id        read a single thread + messages
 *   POST   /api/support/requests            open a new ticket
 *   POST   /api/support/requests/:id/reply  append a reply (re-opens if resolved)
 *
 * The vendor reads / replies / status-transitions / deletes via the
 * admin portal (POS system-admin/server/routes/requests.routes.js).
 */
import { Router } from 'express';
import SupportRequest from '../models/SupportRequest.js';
import Organization from '../models/Organization.js';
import { ok, AppError } from '../utils/response.js';

const router = Router();

const TYPES = ['support', 'billing', 'feature', 'bug', 'upgrade', 'general'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function publicRequest(r) {
  return {
    id: r._id,
    organizationId: r.organizationId,
    organizationName: r.organizationName,
    raisedByName: r.raisedByName,
    raisedByEmail: r.raisedByEmail,
    raisedByRole: r.raisedByRole,
    type: r.type,
    priority: r.priority,
    subject: r.subject,
    body: r.body,
    status: r.status,
    messages: (r.messages || []).map((m) => ({
      id: m._id,
      from: m.from,
      authorName: m.authorName,
      body: m.body,
      createdAt: m.createdAt,
    })),
    lastActivityAt: r.lastActivityAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function requireOrg(req) {
  if (!req.user?.organizationId) {
    throw new AppError(
      'NO_ORG',
      'This account is not linked to a tenant organisation',
      400,
    );
  }
  return req.user.organizationId;
}

// LIST requests for the caller's org. Newest activity first.
router.get('/requests', async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const list = await SupportRequest.find({ organizationId: orgId })
      .sort({ lastActivityAt: -1, createdAt: -1 })
      .lean();
    res.json(ok(list.map(publicRequest)));
  } catch (err) {
    next(err);
  }
});

// READ a single thread; only if it belongs to the caller's org.
router.get('/requests/:id', async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const r = await SupportRequest.findOne({ _id: req.params.id, organizationId: orgId });
    if (!r) throw new AppError('REQUEST_NOT_FOUND', 'Request not found', 404);
    res.json(ok(publicRequest(r.toObject())));
  } catch (err) {
    next(err);
  }
});

// CREATE a new ticket for the caller's org.
router.post('/requests', async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const { subject, body, type, priority } = req.body || {};
    if (!subject || !String(subject).trim()) {
      throw new AppError('VALIDATION_ERROR', 'subject is required', 400);
    }
    if (!body || !String(body).trim()) {
      throw new AppError('VALIDATION_ERROR', 'body is required', 400);
    }

    const org = await Organization.findById(orgId).lean();
    if (!org) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);

    const now = new Date();
    const r = await SupportRequest.create({
      organizationId: org._id,
      organizationName: org.name,
      raisedByUserId: req.user.id,
      raisedByName: req.user.name || '',
      raisedByEmail: req.user.email || '',
      raisedByRole: req.user.role || '',
      type: TYPES.includes(type) ? type : 'support',
      priority: PRIORITIES.includes(priority) ? priority : 'normal',
      subject: String(subject).trim().slice(0, 200),
      body: String(body).trim(),
      status: 'open',
      unreadByVendor: true,
      messages: [
        {
          from: 'tenant',
          authorId: req.user.id,
          authorName: req.user.name || '',
          authorEmail: req.user.email || '',
          body: String(body).trim(),
          createdAt: now,
        },
      ],
      lastActivityAt: now,
    });

    res.status(201).json(ok(publicRequest(r.toObject())));
  } catch (err) {
    next(err);
  }
});

// REPLY on a ticket. Re-opens the thread if vendor had marked it resolved.
router.post('/requests/:id/reply', async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const r = await SupportRequest.findOne({ _id: req.params.id, organizationId: orgId });
    if (!r) throw new AppError('REQUEST_NOT_FOUND', 'Request not found', 404);
    if (r.status === 'closed') {
      throw new AppError(
        'REQUEST_CLOSED',
        'This ticket is closed. Open a new one to continue the conversation.',
        409,
      );
    }

    const body = String(req.body?.body || '').trim();
    if (!body) throw new AppError('VALIDATION_ERROR', 'Reply body is required', 400);

    r.messages.push({
      from: 'tenant',
      authorId: req.user.id,
      authorName: req.user.name || '',
      authorEmail: req.user.email || '',
      body,
      createdAt: new Date(),
    });
    r.unreadByVendor = true;
    r.lastActivityAt = new Date();
    if (r.status === 'resolved') r.status = 'open';

    await r.save();
    res.json(ok(publicRequest(r.toObject())));
  } catch (err) {
    next(err);
  }
});

export default router;
