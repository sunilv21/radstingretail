import mongoose from 'mongoose';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import { AppError } from '../utils/response.js';

const SERIAL_RE = /^[\x20-\x7E]{4,512}$/;
function isValidSerial(s) {
  return typeof s === 'string' && SERIAL_RE.test(s);
}

async function loadSerialisedProduct(storeId, productId, session) {
  const p = await Product.findOne({ _id: productId, storeId }).session(session || null);
  if (!p) throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
  if (!p.isSerialised) {
    throw new AppError('PRODUCT_NOT_SERIALISED', 'Enable "Serial tracking" on the product first', 400);
  }
  return p;
}

async function recomputeStock(product, session) {
  const count = await ProductUnit.countDocuments({
    storeId: product.storeId,
    productId: product._id,
    status: 'in_stock',
  }).session(session || null);
  product.stock = count;
  await product.save({ session });
}

export const ProductUnitService = {
  async list({ storeId, productId, status }) {
    const filter = { storeId, productId };
    if (status) filter.status = status;
    return ProductUnit.find(filter).sort({ addedAt: -1 }).lean();
  },

  async getBySerial({ storeId, serialNo }) {
    const u = await ProductUnit.findOne({ storeId, serialNo }).lean();
    if (!u) throw new AppError('UNIT_NOT_FOUND', `No unit with serial ${serialNo}`, 404);
    return u;
  },

  // Bulk add — inside a transaction so stock count + unit rows stay consistent.
  async addMany({ storeId, productId, serials, addedBy }) {
    const list = Array.isArray(serials) ? serials : [serials];
    const cleaned = [];
    const dupeInRequest = new Set();
    for (const raw of list) {
      const s = String(raw ?? '').trim();
      if (!s) continue;
      if (!isValidSerial(s)) {
        throw new AppError(
          'SERIAL_INVALID',
          `Serial "${s.slice(0, 40)}…" must be 4–512 printable characters`,
          400,
        );
      }
      if (dupeInRequest.has(s)) {
        throw new AppError('SERIAL_DUPLICATE', `Duplicate serial in request: ${s}`, 400);
      }
      dupeInRequest.add(s);
      cleaned.push(s);
    }
    if (cleaned.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'At least one serial is required', 400);
    }

    const existing = await ProductUnit.find({
      storeId,
      serialNo: { $in: cleaned },
    }).lean();
    if (existing.length) {
      const first = existing[0];
      throw new AppError(
        'SERIAL_DUPLICATE',
        `Serial ${first.serialNo} already registered${
          String(first.productId) !== String(productId) ? ' on another product' : ''
        }`,
        400,
      );
    }

    const session = await mongoose.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        const product = await loadSerialisedProduct(storeId, productId, session);
        const now = new Date();
        const docs = cleaned.map((s) => ({
          storeId,
          productId: product._id,
          serialNo: s,
          status: 'in_stock',
          addedAt: now,
          addedBy,
        }));
        created = await ProductUnit.insertMany(docs, { session });
        await recomputeStock(product, session);
      });
      return created;
    } finally {
      await session.endSession();
    }
  },

  async removeBySerial({ storeId, productId, serialNo }) {
    const session = await mongoose.startSession();
    try {
      let removed;
      await session.withTransaction(async () => {
        const product = await loadSerialisedProduct(storeId, productId, session);
        const unit = await ProductUnit.findOne({ storeId, productId, serialNo }).session(session);
        if (!unit) throw new AppError('UNIT_NOT_FOUND', 'Unit not found', 404);
        if (unit.status !== 'in_stock') {
          throw new AppError(
            'UNIT_NOT_REMOVABLE',
            `Unit is "${unit.status}" — only in-stock units can be removed`,
            400,
          );
        }
        await ProductUnit.deleteOne({ _id: unit._id }, { session });
        await recomputeStock(product, session);
        removed = unit.toObject();
      });
      return removed;
    } finally {
      await session.endSession();
    }
  },

  // Called inside sale.service.js's atomic block. Marks a unit sold + stamps
  // warranty. The caller owns the session + rollback.
  async markSold({ storeId, serialNoOrId, saleId, soldAt, warrantyMonths = 0, session }) {
    const query = mongoose.isValidObjectId(serialNoOrId)
      ? { _id: serialNoOrId, storeId }
      : { serialNo: serialNoOrId, storeId };
    const unit = await ProductUnit.findOne(query).session(session);
    if (!unit) {
      throw new AppError('UNIT_NOT_FOUND', `Unit ${serialNoOrId} not found`, 404);
    }
    if (unit.status !== 'in_stock') {
      throw new AppError('UNIT_ALREADY_SOLD', `Unit ${unit.serialNo} is already ${unit.status}`, 400);
    }
    unit.status = 'sold';
    unit.saleId = saleId;
    unit.soldAt = soldAt;
    if (warrantyMonths > 0) {
      const starts = new Date(soldAt);
      const expires = new Date(soldAt);
      expires.setMonth(expires.getMonth() + warrantyMonths);
      unit.warrantyStartsAt = starts;
      unit.warrantyExpiresAt = expires;
    }
    await unit.save({ session });
    return unit;
  },
};
