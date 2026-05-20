import Store from '../models/Store.js';
import Product from '../models/Product.js';
import { AppError } from '../utils/response.js';
import { GSTEngine } from './gst.engine.js';

export const BillingEngine = {
  async buildCart({ items, storeId, customerStateCode, session }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('CART_EMPTY', 'Cart cannot be empty', 400);
    }
    const storeDoc = await Store.findById(storeId).session(session || null).lean();
    if (!storeDoc) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    const productIds = items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, storeId })
      .session(session || null)
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

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
