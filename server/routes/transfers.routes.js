import { Router } from 'express';
import { ok, AppError } from '../utils/response.js';
import { TransferService } from '../services/transfer.service.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.get('/', requirePermission('transfers', 'read'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) return res.json(ok([]));
    const rows = await TransferService.list({
      organizationId: req.user.organizationId,
      status: req.query.status,
    });
    res.json(ok(rows));
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission('transfers', 'read'), async (req, res, next) => {
  try {
    res.json(ok(await TransferService.getById({ organizationId: req.user.organizationId, id: req.params.id })));
  } catch (err) { next(err); }
});

router.post('/', requirePermission('transfers', 'create'), async (req, res, next) => {
  try {
    if (!req.user.organizationId) {
      throw new AppError('NO_ORG', 'Your account is not linked to an organization', 400);
    }
    const tr = await TransferService.create({
      organizationId: req.user.organizationId,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(tr));
  } catch (err) { next(err); }
});

router.post('/:id/dispatch', requirePermission('transfers', 'update'), async (req, res, next) => {
  try {
    const tr = await TransferService.dispatch({
      organizationId: req.user.organizationId,
      id: req.params.id,
      userId: req.user.id,
      lineQuantities: req.body?.lineQuantities,
    });
    res.json(ok(tr));
  } catch (err) { next(err); }
});

router.post('/:id/receive', requirePermission('transfers', 'update'), async (req, res, next) => {
  try {
    const tr = await TransferService.receive({
      organizationId: req.user.organizationId,
      id: req.params.id,
      userId: req.user.id,
      lineQuantities: req.body?.lineQuantities,
    });
    res.json(ok(tr));
  } catch (err) { next(err); }
});

router.post('/:id/cancel', requirePermission('transfers', 'update'), async (req, res, next) => {
  try {
    const tr = await TransferService.cancel({
      organizationId: req.user.organizationId,
      id: req.params.id,
      userId: req.user.id,
      reason: req.body?.reason,
    });
    res.json(ok(tr));
  } catch (err) { next(err); }
});

export default router;
