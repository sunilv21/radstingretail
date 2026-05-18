import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { ok } from '../utils/response.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.get('/', requirePermission('audit', 'read'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.organizationId) filter.organizationId = req.user.organizationId;
    if (req.query.userId) filter.userId = String(req.query.userId);
    if (req.query.resource) filter.resource = String(req.query.resource);
    if (req.query.action) filter.action = String(req.query.action);
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(String(req.query.from));
      if (req.query.to) filter.createdAt.$lte = new Date(String(req.query.to));
    }
    const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 100));
    const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

export default router;
