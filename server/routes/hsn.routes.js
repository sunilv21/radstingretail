import { Router } from 'express';
import Product from '../models/Product.js';
import Organization from '../models/Organization.js';
import {
  HSN_MASTER,
  lookupHsn,
  searchHsn,
  verifyHsn,
  validateHsnFormat,
} from '../utils/hsn.js';
import { ok, AppError } from '../utils/response.js';

const router = Router();

/**
 * Lookup-by-code. Returns every master entry that matches the exact code.
 * Multiple entries are possible (e.g. HSN 1701 has 5% for raw sugar and 18%
 * for refined sugar). Callers should decide which prescribed rate to apply.
 */
router.get('/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) throw new AppError('HSN_CODE_REQUIRED', 'Provide an HSN code', 400);
    const entries = lookupHsn(code);
    res.json(
      ok({
        code,
        format: validateHsnFormat(code),
        entries,
        prescribedRates: Array.from(new Set(entries.map((e) => e.gstRate))),
      }),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Type-ahead search by code prefix OR substring of description. Used by the
 * product form autocomplete; capped to 25 hits to keep responses tiny.
 */
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
    const matches = searchHsn(q, limit);
    res.json(
      ok({
        query: q,
        count: matches.length,
        totalMaster: HSN_MASTER.length,
        matches,
      }),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Bulk audit of every product in the active store. Returns a per-product
 * verification status so the audit UI can render a "status pill" column
 * and offer one-click fixes. Heavy-ish endpoint — cap the per-product
 * verify count via pagination if/when stores grow past ~10k SKUs.
 */
router.get('/audit/products', async (req, res, next) => {
  try {
    const { storeId, organizationId } = req.user;
    const org = organizationId ? await Organization.findById(organizationId).lean() : null;
    const minDigits = Math.max(2, Math.min(8, Number(org?.hsnDigitsRequired) || 4));

    const products = await Product.find({ storeId, isActive: true })
      .select({ name: 1, sku: 1, hsnCode: 1, gstRate: 1, stock: 1, sellingPrice: 1 })
      .lean();

    let verifiedCount = 0;
    let unknownCount = 0;
    let mismatchCount = 0;
    let invalidCount = 0;
    let missingCount = 0;

    const rows = products.map((p) => {
      const v = verifyHsn(p.hsnCode, Number(p.gstRate || 0), { minDigits });
      switch (v.status) {
        case 'verified':
          verifiedCount += 1;
          break;
        case 'unknown_hsn':
          unknownCount += 1;
          break;
        case 'rate_mismatch':
          mismatchCount += 1;
          break;
        case 'invalid_format':
          invalidCount += 1;
          break;
        case 'missing':
          missingCount += 1;
          break;
      }
      return {
        productId: p._id,
        name: p.name,
        sku: p.sku,
        hsnCode: p.hsnCode || '',
        appliedRate: Number(p.gstRate || 0),
        status: v.status,
        prescribedRates: v.prescribedRates,
        masterDescription: v.masterMatches[0]?.description || null,
        kind: v.kind,
        reason: v.reason || null,
        digits: v.digits,
      };
    });

    res.json(
      ok({
        minDigits,
        summary: {
          total: products.length,
          verified: verifiedCount,
          rateMismatch: mismatchCount,
          unknown: unknownCount,
          invalidFormat: invalidCount,
          missing: missingCount,
        },
        rows,
      }),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
