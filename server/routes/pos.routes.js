import { Router } from 'express';
import { ok } from '../utils/response.js';
import { ProductService } from '../services/product.service.js';
import { SaleService } from '../services/sale.service.js';

const router = Router();

router.get('/lookup/:barcode', async (req, res, next) => {
  try {
    const product = await ProductService.getByBarcode({
      storeId: req.user.storeId,
      barcode: req.params.barcode,
    });
    res.json(ok(product));
  } catch (err) {
    next(err);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { q = '', limit = 15 } = req.query;
    const result = await ProductService.list({
      storeId: req.user.storeId,
      query: q,
      limit: Number(limit),
    });
    res.json(ok(result.data));
  } catch (err) {
    next(err);
  }
});

router.post('/calculate', async (req, res, next) => {
  try {
    const cart = await SaleService.calculate({
      storeId: req.user.storeId,
      items: req.body.items || [],
      customerId: req.body.customerId,
    });
    res.json(ok(cart));
  } catch (err) {
    next(err);
  }
});

export default router;
