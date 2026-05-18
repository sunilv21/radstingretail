import { Router } from 'express';
import StockMovement from '../models/StockMovement.js';
import { ok } from '../utils/response.js';
import { ProductService } from '../services/product.service.js';
import { ProductUnitService } from '../services/product-unit.service.js';
import { InventoryEngine } from '../engines/inventory.engine.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { q = '', category, lowStock, page = 1, limit = 50 } = req.query;
    const result = await ProductService.list({
      storeId: req.user.storeId,
      query: q,
      category,
      lowStock: lowStock === 'true',
      page: Number(page),
      limit: Number(limit),
    });
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/generate-barcode', (_req, res, next) => {
  try {
    res.json(ok({ barcode: ProductService.generateBarcode() }));
  } catch (err) {
    next(err);
  }
});

router.get('/by-barcode/:barcode', async (req, res, next) => {
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

router.get('/:id', async (req, res, next) => {
  try {
    const product = await ProductService.getById({ storeId: req.user.storeId, id: req.params.id });
    res.json(ok(product));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const product = await ProductService.create({
      storeId: req.user.storeId,
      organizationId: req.user.organizationId,
      input: req.body,
      createdBy: req.user.id,
    });
    res.status(201).json(ok(product));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const product = await ProductService.update({
      storeId: req.user.storeId,
      organizationId: req.user.organizationId,
      id: req.params.id,
      input: req.body,
    });
    res.json(ok(product));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await ProductService.softDelete({ storeId: req.user.storeId, id: req.params.id });
    res.json(ok({ deleted: true }));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/adjust-stock', async (req, res, next) => {
  try {
    const product = await InventoryEngine.adjustStock({
      productId: req.params.id,
      newQuantity: Number(req.body.newQuantity),
      reason: req.body.reason || 'Manual adjustment',
      storeId: req.user.storeId,
      createdBy: req.user.id,
    });
    res.json(ok(product));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/units', async (req, res, next) => {
  try {
    const rows = await ProductUnitService.list({
      storeId: req.user.storeId,
      productId: req.params.id,
      status: req.query.status,
    });
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/units', async (req, res, next) => {
  try {
    const created = await ProductUnitService.addMany({
      storeId: req.user.storeId,
      productId: req.params.id,
      serials: req.body?.serials || [],
      addedBy: req.user.id,
    });
    res.status(201).json(ok(created));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/units/:serialNo', async (req, res, next) => {
  try {
    await ProductUnitService.removeBySerial({
      storeId: req.user.storeId,
      productId: req.params.id,
      serialNo: decodeURIComponent(req.params.serialNo),
    });
    res.json(ok({ deleted: true }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/movements', async (req, res, next) => {
  try {
    const rows = await StockMovement.find({
      storeId: req.user.storeId,
      productId: req.params.id,
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

export default router;
