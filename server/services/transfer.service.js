import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Store from '../models/Store.js';
import StockMovement from '../models/StockMovement.js';
import StoreTransfer from '../models/StoreTransfer.js';
import { AppError } from '../utils/response.js';

const round2 = (n) => Math.round(n * 100) / 100;

function nextTransferNumber(storeDoc) {
  const counters = storeDoc.voucherCounters || new Map();
  const current = Number(counters.get?.('TRF') || 0);
  const next = current + 1;
  counters.set('TRF', next);
  storeDoc.voucherCounters = counters;
  storeDoc.markModified('voucherCounters');
  const year = new Date().getFullYear();
  return `TRF-${year}-${String(next).padStart(5, '0')}`;
}

async function assertSameOrg({ organizationId, fromStoreId, toStoreId }) {
  if (String(fromStoreId) === String(toStoreId)) {
    throw new AppError('SAME_STORE', 'Source and destination must differ', 400);
  }
  const stores = await Store.find({
    _id: { $in: [fromStoreId, toStoreId] },
    organizationId,
  }).lean();
  if (stores.length !== 2) {
    throw new AppError(
      'STORE_OUT_OF_ORG',
      'Both stores must belong to your organization',
      403,
    );
  }
  return stores;
}

export const TransferService = {
  async list({ organizationId, status }) {
    const filter = { organizationId };
    if (status) filter.status = status;
    return StoreTransfer.find(filter).sort({ createdAt: -1 }).lean();
  },

  async getById({ organizationId, id }) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('NOT_FOUND', 'Transfer not found', 404);
    }
    const t = await StoreTransfer.findOne({ _id: id, organizationId }).lean();
    if (!t) throw new AppError('NOT_FOUND', 'Transfer not found', 404);
    return t;
  },

  async create({ organizationId, input, userId }) {
    const fromStoreId = input?.fromStoreId;
    const toStoreId = input?.toStoreId;
    const items = Array.isArray(input?.items) ? input.items : [];
    if (!fromStoreId || !toStoreId) {
      throw new AppError('VALIDATION_ERROR', 'fromStoreId and toStoreId are required', 400);
    }
    if (items.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'At least one item is required', 400);
    }

    await assertSameOrg({ organizationId, fromStoreId, toStoreId });

    // Snapshot product details at request time. Validate stock at the source.
    const productIds = items.map((it) => it.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      storeId: fromStoreId,
    }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const itemRows = items.map((it) => {
      const p = byId.get(String(it.productId));
      if (!p) throw new AppError('PRODUCT_NOT_FOUND', `Product ${it.productId} not in source store`, 404);
      const qty = Number(it.requestedQty || it.quantity || 0);
      if (!(qty > 0)) throw new AppError('VALIDATION_ERROR', `Quantity for ${p.name} must be > 0`, 400);
      return {
        productId: p._id,
        productSnapshot: { name: p.name, sku: p.sku, barcode: p.barcode, hsnCode: p.hsnCode },
        requestedQty: qty,
        dispatchedQty: 0,
        receivedQty: 0,
        costPrice: round2(Number(p.purchasePrice || 0)),
      };
    });

    const session = await mongoose.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        const sourceStore = await Store.findById(fromStoreId).session(session);
        if (!sourceStore) throw new AppError('STORE_NOT_FOUND', 'Source store not found', 404);
        const transferNumber = nextTransferNumber(sourceStore);
        await sourceStore.save({ session });

        const [doc] = await StoreTransfer.create(
          [
            {
              organizationId,
              fromStoreId,
              toStoreId,
              transferNumber,
              items: itemRows,
              status: 'requested',
              notes: input?.notes || '',
              requestedBy: userId,
            },
          ],
          { session },
        );
        created = doc.toObject();
      });
      return created;
    } finally {
      await session.endSession();
    }
  },

  /**
   * Dispatch: deduct stock from the source store, mark the transfer
   * `in_transit`. Per-line dispatchedQty defaults to requestedQty unless
   * overridden by the caller (partial dispatch).
   */
  async dispatch({ organizationId, id, userId, lineQuantities }) {
    const session = await mongoose.startSession();
    try {
      let updated;
      await session.withTransaction(async () => {
        const tr = await StoreTransfer.findOne({ _id: id, organizationId }).session(session);
        if (!tr) throw new AppError('NOT_FOUND', 'Transfer not found', 404);
        if (tr.status !== 'requested') {
          throw new AppError('INVALID_STATUS', `Cannot dispatch a ${tr.status} transfer`, 400);
        }

        const lq = lineQuantities && typeof lineQuantities === 'object' ? lineQuantities : {};
        for (const it of tr.items) {
          const dispatchQty = Number(lq[String(it.productId)] ?? it.requestedQty);
          if (!(dispatchQty > 0) || dispatchQty > it.requestedQty) {
            throw new AppError(
              'INVALID_DISPATCH_QTY',
              `Dispatch qty for ${it.productSnapshot?.name} must be 0..${it.requestedQty}`,
              400,
            );
          }
          const product = await Product.findOne({ _id: it.productId, storeId: tr.fromStoreId }).session(session);
          if (!product) throw new AppError('PRODUCT_NOT_FOUND', `Source product missing for ${it.productSnapshot?.name}`, 404);
          if (product.stock < dispatchQty) {
            throw new AppError(
              'STOCK_INSUFFICIENT',
              `Source store has only ${product.stock} ${product.unit} of ${product.name}`,
              400,
              { productId: product._id, available: product.stock, requested: dispatchQty },
            );
          }

          const previousStock = product.stock;
          product.stock = previousStock - dispatchQty;
          await product.save({ session });

          await StockMovement.create(
            [
              {
                storeId: tr.fromStoreId,
                productId: product._id,
                type: 'out',
                quantity: dispatchQty,
                previousStock,
                newStock: product.stock,
                referenceType: 'transfer',
                referenceId: tr._id,
                reason: `Transfer ${tr.transferNumber} dispatched to other branch`,
                createdBy: userId,
              },
            ],
            { session },
          );

          it.dispatchedQty = dispatchQty;
        }

        tr.status = 'in_transit';
        tr.dispatchedBy = userId;
        tr.dispatchedAt = new Date();
        await tr.save({ session });
        updated = tr.toObject();
      });
      return updated;
    } finally {
      await session.endSession();
    }
  },

  /**
   * Receive at destination: add stock at the dest store. The destination
   * store may not have the product yet — we upsert a new Product row in that
   * case (mirroring the source product's master fields).
   */
  async receive({ organizationId, id, userId, lineQuantities }) {
    const session = await mongoose.startSession();
    try {
      let updated;
      await session.withTransaction(async () => {
        const tr = await StoreTransfer.findOne({ _id: id, organizationId }).session(session);
        if (!tr) throw new AppError('NOT_FOUND', 'Transfer not found', 404);
        if (tr.status !== 'in_transit') {
          throw new AppError('INVALID_STATUS', `Cannot receive a ${tr.status} transfer`, 400);
        }

        const lq = lineQuantities && typeof lineQuantities === 'object' ? lineQuantities : {};
        for (const it of tr.items) {
          const receiveQty = Number(lq[String(it.productId)] ?? it.dispatchedQty);
          if (!(receiveQty > 0) || receiveQty > it.dispatchedQty) {
            throw new AppError(
              'INVALID_RECEIVE_QTY',
              `Receive qty for ${it.productSnapshot?.name} must be 0..${it.dispatchedQty}`,
              400,
            );
          }

          // Source product carries the master config — copy it to dest if
          // the dest store doesn't have the SKU yet.
          const sourceProduct = await Product.findOne({ _id: it.productId, storeId: tr.fromStoreId }).session(session);
          let destProduct = await Product.findOne({
            storeId: tr.toStoreId,
            sku: sourceProduct?.sku || it.productSnapshot.sku,
          }).session(session);

          if (!destProduct) {
            const blueprint = sourceProduct?.toObject?.() || it.productSnapshot;
            destProduct = await Product.create(
              [
                {
                  ...blueprint,
                  _id: undefined,
                  storeId: tr.toStoreId,
                  stock: 0,
                  isActive: true,
                  createdBy: userId,
                },
              ],
              { session },
            ).then((arr) => arr[0]);
          }

          const previousStock = destProduct.stock || 0;
          destProduct.stock = previousStock + receiveQty;
          await destProduct.save({ session });

          await StockMovement.create(
            [
              {
                storeId: tr.toStoreId,
                productId: destProduct._id,
                type: 'in',
                quantity: receiveQty,
                previousStock,
                newStock: destProduct.stock,
                referenceType: 'transfer',
                referenceId: tr._id,
                reason: `Transfer ${tr.transferNumber} received from other branch`,
                createdBy: userId,
              },
            ],
            { session },
          );

          it.receivedQty = receiveQty;
        }

        tr.status = 'received';
        tr.receivedBy = userId;
        tr.receivedAt = new Date();
        await tr.save({ session });
        updated = tr.toObject();
      });
      return updated;
    } finally {
      await session.endSession();
    }
  },

  async cancel({ organizationId, id, userId, reason }) {
    const session = await mongoose.startSession();
    try {
      let updated;
      await session.withTransaction(async () => {
        const tr = await StoreTransfer.findOne({ _id: id, organizationId }).session(session);
        if (!tr) throw new AppError('NOT_FOUND', 'Transfer not found', 404);
        if (tr.status !== 'requested') {
          throw new AppError(
            'INVALID_STATUS',
            'Only requested transfers can be cancelled. In-transit transfers must be received and then reversed via a new transfer.',
            400,
          );
        }
        tr.status = 'cancelled';
        tr.cancelledBy = userId;
        tr.cancelledAt = new Date();
        tr.cancelReason = reason || '';
        await tr.save({ session });
        updated = tr.toObject();
      });
      return updated;
    } finally {
      await session.endSession();
    }
  },
};
