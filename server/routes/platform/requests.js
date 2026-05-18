/**
 * Platform sub-router: support / billing / feature-request inbox.
 * Mounted at `/api/platform/requests/*`. Inherits `requireSuperAdmin`.
 *
 * Tenants POST new requests through /api/support (support.routes.js).
 * This surface is the vendor side: list, drill-down, reply, change status.
 */
import { Router } from 'express';
import SupportRequest from '../../models/SupportRequest.js';
import { ok, AppError } from '../../utils/response.js';

const router = Router();

const ALLOWED_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

function publicRequest(r) {
  const o = r.toObject ? r.toObject() : r;
  return {
    id: o._id,
    organizationId: o.organizationId,
    organizationName: o.organizationName || '',
    raisedByUserId: o.raisedByUserId || null,
    raisedByName: o.raisedByName || '',
    raisedByEmail: o.raisedByEmail || '',
    raisedByRole: o.raisedByRole || '',
    type: o.type,
    priority: o.priority,
    subject: o.subject,
    body: o.body || '',
    status: o.status,
    unreadByVendor: !!o.unreadByVendor,
    messages: (o.messages || []).map((m) => ({
      id: m._id || m.id,
      from: m.from,
      authorName: m.authorName || '',
      authorEmail: m.authorEmail || '',
      body: m.body,
      createdAt: m.createdAt,
    })),
    lastActivityAt: o.lastActivityAt || o.updatedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function buildSummary(rows) {
  const s = { open: 0, in_progress: 0, resolved: 0, closed: 0, unread: 0 };
  for (const r of rows) {
    if (s[r.status] !== undefined) s[r.status] += 1;
    if (r.unreadByVendor) s.unread += 1;
  }
  return s;
}

/** LIST — supports ?status=...&limit=N. Always returns summary. */
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    // Some admin pages pass status='new' as a synonym for the unread filter.
    const filter = {};
    if (status === 'new') {
      filter.unreadByVendor = true;
    } else if (ALLOWED_STATUSES.includes(status)) {
      filter.status = status;
    }

    const [rows, allForSummary] = await Promise.all([
      SupportRequest.find(filter).sort({ lastActivityAt: -1, createdAt: -1 }).limit(limit).lean(),
      SupportRequest.find({}).select('status unreadByVendor').lean(),
    ]);

    res.json(
      ok({
        requests: rows.map(publicRequest),
        summary: buildSummary(allForSummary),
      }),
    );
  } catch (err) {
    next(err);
  }
});

/** GET one — full detail + thread; marks unread=false on read. */
router.get('/:id', async (req, res, next) => {
  try {
    const r = await SupportRequest.findById(req.params.id);
    if (!r) throw new AppError('REQUEST_NOT_FOUND', 'Request not found', 404);
    if (r.unreadByVendor) {
      r.unreadByVendor = false;
      await r.save();
    }
    res.json(ok(publicRequest(r)));
  } catch (err) {
    next(err);
  }
});

/** POST message — vendor replies. Auto-promotes status to 'in_progress'. */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const r = await SupportRequest.findById(req.params.id);
    if (!r) throw new AppError('REQUEST_NOT_FOUND', 'Request not found', 404);
    const body = String(req.body?.body || '').trim();
    if (!body) throw new AppError('VALIDATION_ERROR', 'Message body is required', 400);

    r.messages.push({
      from: 'vendor',
      authorId: req.user?.id || null,
      authorName: req.user?.name || 'Vendor',
      authorEmail: req.user?.email || '',
      body,
      createdAt: new Date(),
    });
    r.lastActivityAt = new Date();
    r.unreadByVendor = false;
    // If the request was still 'open', a vendor reply implicitly moves it
    // to 'in_progress'. Vendor can manually close via the status route.
    if (r.status === 'open') r.status = 'in_progress';
    await r.save();
    res.status(201).json(ok(publicRequest(r)));
  } catch (err) {
    next(err);
  }
});

/** PUT status — vendor changes the lifecycle bucket. */
router.put('/:id/status', async (req, res, next) => {
  try {
    const status = String(req.body?.status || '');
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `status must be one of ${ALLOWED_STATUSES.join(', ')}`,
        400,
      );
    }
    const r = await SupportRequest.findById(req.params.id);
    if (!r) throw new AppError('REQUEST_NOT_FOUND', 'Request not found', 404);
    r.status = status;
    r.lastActivityAt = new Date();
    if (status === 'resolved' || status === 'closed') {
      r.unreadByVendor = false;
    }
    await r.save();
    res.json(ok(publicRequest(r)));
  } catch (err) {
    next(err);
  }
});

/** DELETE — hard delete a request thread. */
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await SupportRequest.deleteOne({ _id: req.params.id });
    if (r.deletedCount === 0) {
      throw new AppError('REQUEST_NOT_FOUND', 'Request not found', 404);
    }
    res.json(ok({ deleted: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
