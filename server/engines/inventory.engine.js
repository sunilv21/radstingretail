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

  async deductStock(items, { storeId, referenceType, referenceId, createdBy, session }) {
    for (const it of items) {
      const product = await Product.findOne({ _id: it.productId, storeId }).session(session);
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', `Product ${it.productId} not found`, 404);
      }
      const previousStock = product.stock;
      product.stock = previousStock - it.quantity;
      await product.save({ session });

      await StockMovement.create(
        [
          {
            storeId,
            productId: product._id,
            type: 'out',
            quantity: it.quantity,
            previousStock,
            newStock: product.stock,
            referenceType,
            referenceId,
            reason: `${referenceType} ${referenceId}`,
            createdBy,
          },
        ],
        { session },
      );
    }
  },

  async addStock(items, { storeId, referenceType, referenceId, createdBy, reason, session }) {
    for (const it of items) {
      const product = await Product.findOne({ _id: it.productId, storeId }).session(session);
      if (!product) continue;
      const previousStock = product.stock;
      product.stock = previousStock + it.quantity;
      await product.save({ session });

      await StockMovement.create(
        [
          {
            storeId,
            productId: product._id,
            type: 'in',
            quantity: it.quantity,
            previousStock,
            newStock: product.stock,
            referenceType,
            referenceId,
            reason: reason || `${referenceType} ${referenceId}`,
            createdBy,
          },
        ],
        { session },
      );
    }
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
