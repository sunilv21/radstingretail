import { Router } from 'express';
import { ok } from '../utils/response.js';
import { GSTService } from '../services/gst.service.js';

const router = Router();

router.get('/summary/:period', async (req, res, next) => {
  try {
    res.json(ok(await GSTService.summary({ storeId: req.user.storeId, period: req.params.period })));
  } catch (err) { next(err); }
});

router.get('/gstr1/:period', async (req, res, next) => {
  try {
    res.json(ok(await GSTService.gstr1({ storeId: req.user.storeId, period: req.params.period })));
  } catch (err) { next(err); }
});

router.get('/gstr3b/:period', async (req, res, next) => {
  try {
    res.json(ok(await GSTService.gstr3b({ storeId: req.user.storeId, period: req.params.period })));
  } catch (err) { next(err); }
});

router.get('/hsn/:period', async (req, res, next) => {
  try {
    res.json(ok(await GSTService.hsnSummary({ storeId: req.user.storeId, period: req.params.period })));
  } catch (err) { next(err); }
});

router.get('/gstr9/:fy', async (req, res, next) => {
  try {
    res.json(ok(await GSTService.gstr9({ storeId: req.user.storeId, financialYear: req.params.fy })));
  } catch (err) { next(err); }
});

router.post('/reconcile/2a/:period', async (req, res, next) => {
  try {
    const result = await GSTService.reconcileGstr2a({
      storeId: req.user.storeId,
      period: req.params.period,
      payload: req.body,
    });
    res.json(ok(result));
  } catch (err) { next(err); }
});

router.get('/export/gstr1/:period', async (req, res, next) => {
  try {
    const data = await GSTService.exportGstr1Json({ storeId: req.user.storeId, period: req.params.period });
    res.setHeader('Content-Disposition', `attachment; filename="gstr1-${req.params.period}.json"`);
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
