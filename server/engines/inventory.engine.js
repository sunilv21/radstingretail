import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { AppError } from '../utils/response.js';

export const InventoryEngine = {
  async validateStock(items, { allowNegative = false, storeId, session } = {}) {
    const ids = items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: ids }, ...(storeId ? { storeId } : {}) })
      .session(session || null)
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    for (const it of items) {
      const product = byId.get(String(it.productId));
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', `Product ${it.productId} not found`, 404);
      }
      if (!product.isActive) {
        throw new AppError('PRODUCT_INACTIVE', `${product.name} is not active`, 400);
      }
      if (!allowNegative && product.stock < it.quantity) {
        throw new AppError(
          'STOCK_INSUFFICIENT',
          `Only ${product.stock} ${product.unit} of ${product.name} in stock`,
          400,
          { productId: product._id, available: product.stock, requested: it.quantity },
        );
      }
    }
  },

  /**
   * In-memory stock check for the sale path. The cart items carry `_stock` /
   * `_isActive` from BillingEngine.buildCart (which already read the products
   * inside the transaction), so we validate WITHOUT a second `Product.find`.
   * The atomic guard in deductStockFast is the race-safe backstop.
   */
  assertStock(cartItems, { allowNegative = false } = {}) {
    for (const it of cartItems) {
      if (it._isActive === false) {
        throw new AppError('PRODUCT_INACTIVE', `${it._name || it.productId} is not active`, 400);
      }
      if (!allowNegative && Number(it._stock ?? 0) < Number(it.quantity || 0)) {
        throw new AppError(
          'STOCK_INSUFFICIENT',
          `Only ${it._stock ?? 0} ${it._unit || ''} of ${it._name || it.productId} in stock`,
          400,
          { productId: it.productId, available: it._stock ?? 0, requested: it.quantity },
        );
      }
    }
  },

  /**
   * Sale-path stock deduction. ONE `bulkWrite` of atomic `$inc` for all lines
   * (instead of N round-trips), each guarded by `stock >= qty` when negative
   * stock is disallowed — so it's race-safe AND short (less time holding doc
   * locks inside the transaction). Stock-movement before/after values come from
   * the `_stock` carried on the cart (best-effort audit values; the authoritative
   * stock is the atomically-decremented Product doc). Requires cart items with
   * `_stock` — use the plain `deductStock` for callers that don't have it.
   */
  async deductStockFast(cartItems, { storeId, referenceType, referenceId, createdBy, allowNegative = false, session }) {
    if (!cartItems.length) return;
    const ops = cartItems.map((it) => ({
      updateOne: {
        filter: allowNegative
          ? { _id: it.productId, storeId }
          : { _id: it.productId, storeId, stock: { $gte: it.quantity } },
        update: { $inc: { stock: -it.quantity } },
      },
    }));
    const res = await Product.bulkWrite(ops, { session, ordered: false });
    const matched = res.matchedCount ?? res.nMatched ?? 0;
    if (matched < cartItems.length) {
      // A guarded update didn't match → that product lacked stock (or vanished)
      // between buildCart and now. Throw to abort the whole transaction.
      throw new AppError(
        'STOCK_INSUFFICIENT',
        'Stock changed during checkout — one or more items no longer have enough stock. Please retry.',
        409,
      );
    }
    const movements = cartItems.map((it) => {
      const prev = Number(it._stock ?? 0);
      return {
        storeId,
        productId: it.productId,
        type: 'out',
        quantity: it.quantity,
        previousStock: prev,
        newStock: prev - it.quantity,
        referenceType,
        referenceId,
        reason: `${referenceType} ${referenceId}`,
        createdBy,
      };
    });
    await StockMovement.insertMany(movements, { session });
  },

  async deductStock(items, { storeId, referenceType, referenceId, createdBy, session }) {
    // Atomic `$inc` instead of read-modify-save: one round-trip per item (not
    // two), and — crucially under concurrency — it can't lose updates or pile
    // up WriteConflicts the way a findOne+save read-modify-write does. Stock
    // movements are batched into a single insertMany at the end to cut the
    // transaction's write count. All within the caller's session (atomic).
    const movements = [];
    for (const it of items) {
      const updated = await Product.findOneAndUpdate(
        { _id: it.productId, storeId },
        { $inc: { stock: -it.quantity } },
        { session, new: true },
      );
      if (!updated) {
        throw new AppError('PRODUCT_NOT_FOUND', `Product ${it.productId} not found`, 404);
      }
      const newStock = updated.stock;
      movements.push({
        storeId,
        productId: updated._id,
        type: 'out',
        quantity: it.quantity,
        previousStock: newStock + it.quantity,
        newStock,
        referenceType,
        referenceId,
        reason: `${referenceType} ${referenceId}`,
        createdBy,
      });
    }
    if (movements.length) await StockMovement.insertMany(movements, { session });
  },

  async addStock(items, { storeId, referenceType, referenceId, createdBy, reason, session }) {
    const movements = [];
    for (const it of items) {
      const updated = await Product.findOneAndUpdate(
        { _id: it.productId, storeId },
        { $inc: { stock: it.quantity } },
        { session, new: true },
      );
      if (!updated) continue; // unknown product — skip (matches prior behaviour)
      const newStock = updated.stock;
      movements.push({
        storeId,
        productId: updated._id,
        type: 'in',
        quantity: it.quantity,
        previousStock: newStock - it.quantity,
        newStock,
        referenceType,
        referenceId,
        reason: reason || `${referenceType} ${referenceId}`,
        createdBy,
      });
    }
    if (movements.length) await StockMovement.insertMany(movements, { session });
  },

  async adjustStock({ productId, newQuantity, reason, storeId, createdBy }) {
    const product = await Product.findOne({ _id: productId, storeId });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    const previousStock = product.stock;
    const delta = newQuantity - previousStock;
    product.stock = newQuantity;
    await product.save();

    await StockMovement.create({
      storeId,
      productId,
      type: 'adjustment',
      quantity: Math.abs(delta),
      previousStock,
      newStock: product.stock,
      referenceType: 'manual',
      referenceId: null,
      reason: reason || 'Manual adjustment',
      createdBy,
    });
    return product.toObject();
  },
};
