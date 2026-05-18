import { Router } from 'express';
import { ok } from '../utils/response.js';
import { PurchaseService } from '../services/purchase.service.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, supplierId, page = 1, limit = 20 } = req.query;
    const result = await PurchaseService.list({
      storeId: req.user.storeId,
      status,
      supplierId,
      page: Number(page),
      limit: Number(limit),
    });
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/outstanding/by-supplier', async (req, res, next) => {
  try {
    res.json(ok(await PurchaseService.outstandingBySupplier({ storeId: req.user.storeId })));
  } catch (err) {
    next(err);
  }
});

router.get('/outstanding/by-item', async (req, res, next) => {
  try {
    res.json(ok(await PurchaseService.outstandingByItem({ storeId: req.user.storeId })));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const po = await PurchaseService.getById({ storeId: req.user.storeId, id: req.params.id });
    res.json(ok(po.toObject ? po.toObject() : po));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const po = await PurchaseService.create({
      storeId: req.user.storeId,
      input: req.body,
      userId: req.user.id,
      status: req.body.status === 'draft' ? 'draft' : 'ordered',
    });
    res.status(201).json(ok(po));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submit', async (req, res, next) => {
  try {
    res.json(ok(await PurchaseService.submit({ storeId: req.user.storeId, id: req.params.id })));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/grn', async (req, res, next) => {
  try {
    const result = await PurchaseService.receiveGrn({
      storeId: req.user.storeId,
      id: req.params.id,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(result));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pay', async (req, res, next) => {
  try {
    res.json(
      ok(
        await PurchaseService.payPurchase({
          storeId: req.user.storeId,
          id: req.params.id,
          input: req.body,
          userId: req.user.id,
        }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pre-close', async (req, res, next) => {
  try {
    res.json(
      ok(
        await PurchaseService.preClose({ storeId: req.user.storeId, id: req.params.id, reason: req.body.reason }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/return', async (req, res, next) => {
  try {
    const dn = await PurchaseService.returnPurchase({
      storeId: req.user.storeId,
      purchaseId: req.params.id,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(dn));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    res.json(
      ok(
        await PurchaseService.cancel({ storeId: req.user.storeId, id: req.params.id, reason: req.body.reason }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
