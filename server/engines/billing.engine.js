import Store from '../models/Store.js';
import Product from '../models/Product.js';
import { AppError } from '../utils/response.js';
import { GSTEngine } from './gst.engine.js';

export const BillingEngine = {
  /**
   * @param {object}   opts
   * @param {object}  [opts.store]    Pre-fetched store doc — pass it to AVOID a
   *   second `Store.findById` when the caller already read it (the sale hot
   *   path does, for warranty/serial pre-validation). Halves the per-sale store
   *   reads under load.
   * @param {Map|Array} [opts.products] Pre-fetched products (Map keyed by string
   *   `_id`, or an array). Same idea — skip the second `Product.find`. Stock is
   *   authoritatively re-checked by the atomic guard in deductStockFast, so a
   *   just-pre-transaction snapshot here is safe.
   */
  async buildCart({ items, storeId, customerStateCode, session, store, products }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('CART_EMPTY', 'Cart cannot be empty', 400);
    }
    const storeDoc = store || (await Store.findById(storeId).session(session || null).lean());
    if (!storeDoc) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    let byId;
    if (products) {
      byId = products instanceof Map ? products : new Map(products.map((p) => [String(p._id), p]));
    } else {
      const productIds = items.map((i) => i.productId);
      const fetched = await Product.find({ _id: { $in: productIds }, storeId })
        .session(session || null)
        .lean();
      byId = new Map(fetched.map((p) => [String(p._id), p]));
    }

    // Store-level fallback for products that don't set the flag explicitly.
    // settings.defaultGSTMode: 'inclusive' | 'exclusive' (exclusive default).
    const storeInclusiveDefault = storeDoc.settings?.defaultGSTMode === 'inclusive';

    const resolved = items.map((it) => {
      const product = byId.get(String(it.productId));
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', `Product ${it.productId} not found`, 404);
      }
      const quantity = Number(it.quantity || 1);
      if (quantity <= 0) {
        throw new AppError('INVALID_QUANTITY', `Quantity for ${product.name} must be > 0`, 400);
      }
      const sellingPrice = Number(it.sellingPrice ?? product.sellingPrice);
      // Resolve GST-inclusive flag with this precedence:
      //   1. explicit per-line override from the request (rare),
      //   2. the product's own priceIncludesGst flag,
      //   3. the store's defaultGSTMode.
      // Passing this into the GST engine is what stops inclusive prices
      // from being taxed a second time.
      const priceIncludesGst =
        it.priceIncludesGst !== undefined
          ? !!it.priceIncludesGst
          : product.priceIncludesGst !== undefined
            ? !!product.priceIncludesGst
            : storeInclusiveDefault;
      return {
        productId: product._id,
        productSnapshot: {
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          hsnCode: product.hsnCode,
        },
        quantity,
        unit: product.unit,
        sellingPrice,
        basePrice: sellingPrice * quantity,
        discount: Number(it.discount || 0),
        discountType: it.discountType || 'flat',
        gstRate: Number(product.gstRate || 0),
        priceIncludesGst,
        // Transient, non-persisted carriers (Mongoose strict mode drops them on
        // Sale.create): let the sale path validate stock + record stock-movement
        // before/after values WITHOUT a second DB read of the same products.
        _stock: Number(product.stock || 0),
        _isActive: product.isActive !== false,
        _name: product.name,
        _unit: product.unit,
      };
    });

    return GSTEngine.computeCartTotals(resolved, {
      storeStateCode: storeDoc.stateCode,
      customerStateCode: customerStateCode || storeDoc.stateCode,
    });
  },

  validatePayments(payments, grandTotal) {
    if (!Array.isArray(payments) || payments.length === 0) {
      throw new AppError('PAYMENT_REQUIRED', 'At least one payment is required', 400);
    }
    const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    if (paid + 0.01 < grandTotal) {
      throw new AppError(
        'PAYMENT_INSUFFICIENT',
        `Payments ₹${paid.toFixed(2)} less than total ₹${grandTotal.toFixed(2)}`,
        400,
        { paid, grandTotal },
      );
    }
    const change = Math.max(0, paid - grandTotal);
    return { paid, change };
  },
};
