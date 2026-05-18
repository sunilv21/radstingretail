import { Router } from 'express';
import { ExpenseService } from '../services/expense.service.js';
import { ok, AppError } from '../utils/response.js';

const router = Router();

/** Preset list — used by the new-expense dialog to populate the category picker. */
router.get('/categories', async (_req, res, next) => {
  try {
    res.json(ok(ExpenseService.categories()));
  } catch (err) {
    next(err);
  }
});

/** Aggregate by category — feeds the dashboard pie / leaderboard. */
router.get('/breakdown', async (req, res, next) => {
  try {
    const result = await ExpenseService.breakdown({
      storeId: req.user.storeId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

/** Paginated list — the main register view. */
router.get('/', async (req, res, next) => {
  try {
    const { from, to, category, page, limit } = req.query;
    const result = await ExpenseService.list({
      storeId: req.user.storeId,
      from,
      to,
      category,
      page: Number(page) || 1,
      limit: Math.min(200, Number(limit) || 50),
    });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

/** Record one expense → posts a payment voucher atomically. */
router.post('/', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      throw new AppError('VALIDATION_ERROR', 'Body required', 400);
    }
    const voucher = await ExpenseService.create({
      storeId: req.user.storeId,
      userId: req.user.id,
      input: req.body,
    });
    res.status(201).json(ok(voucher));
  } catch (err) {
    next(err);
  }
});

export default router;
