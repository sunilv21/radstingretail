import { Router } from 'express';
import { ok } from '../utils/response.js';
import { AccountingService } from '../services/accounting.service.js';

const router = Router();

router.get('/groups', async (req, res, next) => {
  try {
    res.json(ok(await AccountingService.listGroups({ storeId: req.user.storeId })));
  } catch (err) { next(err); }
});

router.post('/groups', async (req, res, next) => {
  try {
    res.status(201).json(ok(await AccountingService.createGroup({ storeId: req.user.storeId, input: req.body })));
  } catch (err) { next(err); }
});

router.get('/accounts', async (req, res, next) => {
  try {
    res.json(ok(await AccountingService.listAccounts({ storeId: req.user.storeId })));
  } catch (err) { next(err); }
});

router.post('/accounts', async (req, res, next) => {
  try {
    res.status(201).json(ok(await AccountingService.createAccount({ storeId: req.user.storeId, input: req.body })));
  } catch (err) { next(err); }
});

router.get('/accounts/:id/balance', async (req, res, next) => {
  try {
    res.json(ok(await AccountingService.accountBalance({ storeId: req.user.storeId, accountId: req.params.id })));
  } catch (err) { next(err); }
});

router.get('/accounts/:id/ledger', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    res.json(ok(await AccountingService.accountLedger({
      storeId: req.user.storeId,
      accountId: req.params.id,
      from, to,
    })));
  } catch (err) { next(err); }
});

router.get('/vouchers', async (req, res, next) => {
  try {
    const { type, from, to, page = 1, limit = 50 } = req.query;
    const result = await AccountingService.listVouchers({
      storeId: req.user.storeId,
      type,
      from,
      to,
      page: Number(page),
      limit: Number(limit),
    });
    res.json(ok(result.data, result.meta));
  } catch (err) { next(err); }
});

router.post('/vouchers', async (req, res, next) => {
  try {
    const v = await AccountingService.postVoucher({
      storeId: req.user.storeId,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(v));
  } catch (err) { next(err); }
});

router.get('/trial-balance', async (req, res, next) => {
  try {
    res.json(ok(await AccountingService.trialBalance({ storeId: req.user.storeId })));
  } catch (err) { next(err); }
});

router.get('/profit-loss', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    res.json(ok(await AccountingService.profitAndLoss({ storeId: req.user.storeId, from, to })));
  } catch (err) { next(err); }
});

router.get('/balance-sheet', async (req, res, next) => {
  try {
    const { asOf } = req.query;
    res.json(ok(await AccountingService.balanceSheet({ storeId: req.user.storeId, asOf })));
  } catch (err) { next(err); }
});

router.get('/cash-flow', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    res.json(ok(await AccountingService.cashFlow({ storeId: req.user.storeId, from, to })));
  } catch (err) { next(err); }
});

router.get('/day-book', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    res.json(ok(await AccountingService.dayBook({ storeId: req.user.storeId, from, to })));
  } catch (err) { next(err); }
});

// Mutual party settlement — list candidates + post a settlement voucher.
router.get('/party-settlements', async (req, res, next) => {
  try {
    res.json(ok(await AccountingService.listPartySettlements({ storeId: req.user.storeId })));
  } catch (err) { next(err); }
});

router.post('/party-settlements', async (req, res, next) => {
  try {
    const v = await AccountingService.postPartySettlement({
      storeId: req.user.storeId,
      customerId: req.body.customerId,
      supplierId: req.body.supplierId,
      amount: req.body.amount,
      narration: req.body.narration,
      userId: req.user.id,
    });
    res.status(201).json(ok(v));
  } catch (err) { next(err); }
});

router.post('/bank-reconciliation', async (req, res, next) => {
  try {
    res.json(
      ok(
        await AccountingService.bankReconciliation({
          storeId: req.user.storeId,
          accountId: req.body.accountId,
          statement: req.body.statement || [],
        }),
      ),
    );
  } catch (err) { next(err); }
});

export default router;
