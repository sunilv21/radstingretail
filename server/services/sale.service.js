import mongoose from 'mongoose';
import crypto from 'crypto';
import Store from '../models/Store.js';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Customer from '../models/Customer.js';
import { AppError } from '../utils/response.js';
import { BillingEngine } from '../engines/billing.engine.js';
import { InventoryEngine } from '../engines/inventory.engine.js';
import { LedgerEngine } from '../engines/ledger.engine.js';
import { ProductUnitService } from './product-unit.service.js';
import { nextInvoiceNumber } from '../utils/barcode.js';
import { nextCreditNoteNumber } from '../utils/numbering.js';

function token() {
  return crypto.randomBytes(16).toString('hex');
}

const VALID_INVOICE_TYPES = new Set([
  'regular', 'sez_with_payment', 'sez_without_payment',
  'export_with_payment', 'export_without_payment',
  'deemed_export', 'nil_rated', 'exempt', 'non_gst',
]);

export const SaleService = {
  async warrantySales({ storeId, phone, activeOnly = false }) {
    const q = { storeId, hasWarranty: true };
    if (phone) q['customerSnapshot.phone'] = { $regex: String(phone).trim() };
    const rows = await Sale.find(q).sort({ createdAt: -1 }).lean();
    const now = new Date();
    const expanded = rows.flatMap((s) =>
      (s.warranties || []).map((w) => ({
        saleId: s._id,
        invoiceNumber: s.invoiceNumber,
        soldAt: s.createdAt,
        customer: s.customerSnapshot,
        productId: w.productId,
        productName: w.productName,
        sku: w.sku,
        quantity: w.quantity,
        warrantyMonths: w.warrantyMonths,
        startsAt: w.startsAt,
        expiresAt: w.expiresAt,
        status: new Date(w.expiresAt) >= now ? 'active' : 'expired',
      })),
    );
    return activeOnly ? expanded.filter((e) => e.status === 'active') : expanded;
  },

  async list({ storeId, page = 1, limit = 20, from, to }) {
    const filter = { storeId };
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
    const [total, data] = await Promise.all([
      Sale.countDocuments(filter),
      Sale.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    return {
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  },

  async getById({ storeId, id }) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    }
    const sale = await Sale.findOne({ _id: id, storeId }).lean();
    if (!sale) throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    return sale;
  },

  async getByShareToken(shareToken) {
    const sale = await Sale.findOne({ shareToken }).lean();
    if (!sale) throw new AppError('SALE_NOT_FOUND', 'Bill not found', 404);
    return sale;
  },

  async calculate({ storeId, items, customerId }) {
    let customer = null;
    if (customerId && mongoose.isValidObjectId(customerId)) {
      customer = await Customer.findById(customerId).lean();
    }
    return BillingEngine.buildCart({
      items,
      storeId,
      customerStateCode: customer?.stateCode,
    });
  },

  async createSale({ storeId, input, userId }) {
    // Idempotency short-circuit: if the client supplied a key and we already
    // committed a sale with the same key, return that sale instead of re-
    // running the transaction. Prevents duplicates when offline replays a
    // request whose response was lost in transit.
    if (input?.idempotencyKey) {
      const existing = await Sale.findOne({
        storeId,
        idempotencyKey: String(input.idempotencyKey),
      }).lean();
      if (existing) return existing;
    }

    // Pre-transaction validation: resolve warranty + serialised lines so we
    // can fail fast with a useful error before opening the DB transaction.
    const storeDoc = await Store.findById(storeId);
    if (!storeDoc) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    const productIds = (input.items || []).map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, storeId }).lean();
    const productById = new Map(products.map((p) => [String(p._id), p]));

    const warrantyLines = [];
    for (const it of input.items || []) {
      const product = productById.get(String(it.productId));
      if (product && Number(product.warrantyMonths || 0) > 0) {
        warrantyLines.push({
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          quantity: Number(it.quantity || 1),
          warrantyMonths: Number(product.warrantyMonths),
        });
      }
    }

    // Serialised products must carry a unitId + quantity=1
    const unitAssignments = [];
    const seenUnitIds = new Set();
    (input.items || []).forEach((it, idx) => {
      const product = productById.get(String(it.productId));
      if (!product?.isSerialised) return;
      const qty = Number(it.quantity || 1);
      if (qty !== 1) {
        throw new AppError(
          'SERIALISED_QTY_ONE',
          `${product.name} is serial-tracked — each unit is a separate line (qty must be 1).`,
          400,
        );
      }
      if (!it.unitId) {
        throw new AppError(
          'UNIT_REQUIRED',
          `${product.name} is serial-tracked — scan a specific unit before checkout.`,
          400,
        );
      }
      if (seenUnitIds.has(String(it.unitId))) {
        throw new AppError('UNIT_DUPLICATE', `Same unit appears on multiple cart lines`, 400);
      }
      seenUnitIds.add(String(it.unitId));
      unitAssignments.push({ lineIndex: idx, unitId: it.unitId, product });
    });

    // Resolve / upsert customer (inline customerInfo support)
    let customer;
    if (input.customerInfo && input.customerInfo.phone) {
      customer = await Customer.findOne({ storeId, phone: input.customerInfo.phone });
      if (customer) {
        if (input.customerInfo.name) customer.name = input.customerInfo.name;
        if (input.customerInfo.address) customer.address = input.customerInfo.address;
        if (input.customerInfo.email) customer.email = input.customerInfo.email;
        await customer.save();
      } else {
        customer = await Customer.create({
          storeId,
          name: input.customerInfo.name || 'Customer',
          phone: input.customerInfo.phone,
          email: input.customerInfo.email || '',
          gstNumber: input.customerInfo.gstNumber || '',
          stateCode: input.customerInfo.stateCode || storeDoc.stateCode || '07',
          address: input.customerInfo.address || '',
        });
      }
    } else if (input.customerId && mongoose.isValidObjectId(input.customerId)) {
      customer = await Customer.findById(input.customerId);
      if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    } else {
      // Walk-in — synthetic customer snapshot only, not persisted
      customer = {
        _id: null,
        name: 'Walk-in Customer',
        phone: '',
        email: '',
        gstNumber: '',
        stateCode: storeDoc.stateCode,
        address: '',
      };
    }

    // Warranty sale → full customer identity required
    if (warrantyLines.length > 0) {
      if (!customer.name || customer.name === 'Walk-in Customer') {
        throw new AppError('CUSTOMER_REQUIRED', 'Customer name is required for warranty products', 400, { warrantyLines });
      }
      if (!customer.phone) {
        throw new AppError('CUSTOMER_PHONE_REQUIRED', 'Customer mobile number is required for warranty products', 400, { warrantyLines });
      }
      if (!customer.address) {
        throw new AppError('CUSTOMER_ADDRESS_REQUIRED', 'Customer address is required for warranty products', 400, { warrantyLines });
      }
    }

    // --- atomic block ---
    const mSession = await mongoose.startSession();
    try {
      let createdSale;
      await mSession.withTransaction(async () => {
        // Rebuild cart totals inside the session so we read fresh product prices
        const cart = await BillingEngine.buildCart({
          items: input.items,
          storeId,
          customerStateCode: customer.stateCode,
          session: mSession,
        });
        await InventoryEngine.validateStock(cart.items, {
          storeId,
          session: mSession,
          allowNegative: !!storeDoc.settings?.allowNegativeStock,
        });
        const { paid, change } = BillingEngine.validatePayments(input.payments || [], cart.grandTotal);

        // Sequential invoice number via the range-pre-allocation allocator.
        // This is intentionally NOT a write inside the sale transaction — the
        // allocator reserves blocks with its own atomic op, so there's no
        // per-store hot-doc contention serializing concurrent sales. (See
        // utils/sequence.js + production-scaling-plan §1.)
        const invoiceNumber = await nextInvoiceNumber(storeDoc);

        // amountPaid = actual money received. Every non-credit tender counts
        // (cash, upi, card, bank, wallet); only 'credit' is an IOU that lands
        // later via /sales/:id/payment. 'bank' was previously omitted, which
        // wrongly marked a fully-paid bank sale as a credit sale and inflated
        // the customer's outstanding.
        const cashPaid = (input.payments || [])
          .filter((p) => p.mode && p.mode !== 'credit')
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        const amountPaidForDoc = Math.min(cashPaid, cart.grandTotal);

        const saleCreatedAt = new Date();
        const itemsWithWarranty = cart.items.map((it, idx) => {
          const inputLine = (input.items || [])[idx] || {};
          const unitAssign = unitAssignments.find((u) => u.lineIndex === idx);
          const w = warrantyLines.find((wl) => String(wl.productId) === String(it.productId));

          let out = { ...it };
          if (w) {
            const expiresAt = new Date(saleCreatedAt);
            expiresAt.setMonth(expiresAt.getMonth() + w.warrantyMonths);
            out.warrantyMonths = w.warrantyMonths;
            out.warrantyExpiresAt = expiresAt;
          }
          if (unitAssign) {
            out.unitId = unitAssign.unitId;
          } else if (inputLine.unitId) {
            out.unitId = inputLine.unitId;
          }
          return out;
        });

        const hasWarranty = warrantyLines.length > 0;
        const warranties = warrantyLines.map((w) => {
          const expiresAt = new Date(saleCreatedAt);
          expiresAt.setMonth(expiresAt.getMonth() + w.warrantyMonths);
          return {
            productId: w.productId,
            productName: w.productName,
            sku: w.sku,
            quantity: w.quantity,
            warrantyMonths: w.warrantyMonths,
            startsAt: saleCreatedAt,
            expiresAt,
          };
        });

        const [savedSale] = await Sale.create(
          [
            {
              invoiceNumber,
              shareToken: token(),
              storeId,
              customerId: customer._id || null,
              customerSnapshot: {
                name: customer.name,
                phone: customer.phone,
                email: customer.email || '',
                gstNumber: customer.gstNumber,
                stateCode: customer.stateCode || storeDoc.stateCode,
                address: customer.address,
              },
              // Place of Supply: customer's state, falls back to the store's state
              // for walk-ins. Drives GSTR-1 inter/intra-state classification.
              placeOfSupply: customer.stateCode || storeDoc.stateCode || '',
              invoiceType: VALID_INVOICE_TYPES.has(input.invoiceType) ? input.invoiceType : 'regular',
              exportDetails: input.exportDetails || undefined,
              hasWarranty,
              warranties,
              items: itemsWithWarranty,
              subtotal: cart.subtotal,
              totalDiscount: cart.totalDiscount,
              totalTax: cart.totalTax,
              roundOff: cart.roundOff,
              grandTotal: cart.grandTotal,
              payments: (input.payments || []).map((p) => ({
                mode: p.mode,
                amount: Number(p.amount || 0),
                reference: p.reference || '',
              })),
              amountPaid: amountPaidForDoc,
              change,
              paymentStatus:
                amountPaidForDoc + 0.01 >= cart.grandTotal
                  ? 'paid'
                  : amountPaidForDoc > 0
                    ? 'partial'
                    : 'credit',
              saleType: 'pos',
              status: 'completed',
              notes: input.notes || '',
              // Only set the key when the client supplied one. Writing `null`
              // would make the partial unique index collide across keyless
              // sales — leave the field ABSENT instead. (See Sale.js index.)
              ...(input?.idempotencyKey ? { idempotencyKey: String(input.idempotencyKey) } : {}),
              createdBy: userId,
              createdAt: saleCreatedAt,
            },
          ],
          { session: mSession },
        );

        // Fill in unit rows on the already-saved line items so serial numbers
        // persist on the invoice. We resolve each one before marking sold.
        for (const assignment of unitAssignments) {
          const marked = await ProductUnitService.markSold({
            storeId,
            serialNoOrId: assignment.unitId,
            saleId: savedSale._id,
            soldAt: saleCreatedAt,
            warrantyMonths: Number(assignment.product.warrantyMonths || 0),
            session: mSession,
          });
          // Backfill the sale line with the resolved serial number
          const line = savedSale.items.find((l) => String(l.unitId) === String(marked._id));
          if (line) line.serialNo = marked.serialNo;
        }
        await savedSale.save({ session: mSession });

        await InventoryEngine.deductStock(cart.items, {
          storeId,
          referenceType: 'sale',
          referenceId: savedSale._id,
          createdBy: userId,
          session: mSession,
        });

        await LedgerEngine.recordSale(savedSale.toObject(), { createdBy: userId, session: mSession });

        // Bump customer outstanding for any unpaid portion. This drives the
        // party-settlement page and customer-dues reports — without it,
        // credit sales would be invisible to outstanding-receivables queries.
        const unpaid = Number((cart.grandTotal - amountPaidForDoc).toFixed(2));
        if (customer._id && unpaid > 0.01) {
          await Customer.updateOne(
            { _id: customer._id },
            { $inc: { outstandingBalance: unpaid } },
            { session: mSession },
          );
        }

        createdSale = savedSale.toObject();
      });
      return createdSale;
    } finally {
      await mSession.endSession();
    }
  },

  /**
   * Issue a Credit Note against an existing sale. Creates a NEW sale doc with
   * status='returned', linked to the original via returnRef, with a CN-… number.
   * Atomically reverses stock + ledger; original invoice stays immutable.
   *
   * input.items = [{ productId, quantity }]  — what's being returned
   * input.reason — narration on the credit note
   * input.refundMode — 'cash' | 'bank' | 'credit'  (how the refund is settled)
   */
  async returnSale({ storeId, saleId, input, userId }) {
    if (!mongoose.isValidObjectId(saleId)) {
      throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    }
    const original = await Sale.findOne({ _id: saleId, storeId }).lean();
    if (!original) throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    if (original.status === 'returned') {
      throw new AppError('ALREADY_RETURNED', 'This invoice is already a credit note', 400);
    }
    if (original.status === 'voided') {
      throw new AppError('SALE_VOIDED', 'Voided sales cannot be returned — they were never finalised', 400);
    }

    const returnItemsInput = Array.isArray(input?.items) ? input.items : [];
    if (returnItemsInput.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'At least one line must be returned', 400);
    }

    // Build the credit-note line set by matching against the original sale's items.
    // Pro-rate the line totals so partial returns post the correct amounts.
    const returnedItems = [];
    for (const r of returnItemsInput) {
      const orig = (original.items || []).find((it) => String(it.productId) === String(r.productId));
      if (!orig) {
        throw new AppError(
          'INVALID_RETURN_ITEM',
          `Product ${r.productId} is not on invoice ${original.invoiceNumber}`,
          400,
        );
      }
      const returnQty = Number(r.quantity || 0);
      if (!(returnQty > 0) || returnQty > orig.quantity) {
        throw new AppError(
          'INVALID_RETURN_QTY',
          `Return qty ${returnQty} for ${orig.productSnapshot?.name} must be 1..${orig.quantity}`,
          400,
        );
      }
      const ratio = returnQty / orig.quantity;
      returnedItems.push({
        ...orig,
        quantity: returnQty,
        basePrice: round2(orig.basePrice * ratio),
        discountAmount: round2((orig.discountAmount || 0) * ratio),
        taxableAmount: round2((orig.taxableAmount || 0) * ratio),
        cgst: round2((orig.cgst || 0) * ratio),
        sgst: round2((orig.sgst || 0) * ratio),
        igst: round2((orig.igst || 0) * ratio),
        totalTax: round2((orig.totalTax || 0) * ratio),
        totalAmount: round2((orig.totalAmount || 0) * ratio),
      });
    }

    // Build the credit-note totals from the per-line values (which are already
    // correctly proportioned for both GST-inclusive and exclusive pricing),
    // NOT from gross basePrice. Using `basePrice` here double-counted tax on
    // inclusive lines and over-refunded the customer. grandTotal is the sum of
    // the line totals actually paid; subtotal is the ex-tax taxable base so
    // `subtotal + tax == grandTotal` holds and the ledger reversal
    // (revenue = grandTotal − tax) lands on the correct taxable figure.
    const taxableTotal = round2(returnedItems.reduce((s, l) => s + (l.taxableAmount || 0), 0));
    const totalDiscount = round2(returnedItems.reduce((s, l) => s + (l.discountAmount || 0), 0));
    const totalTax = round2(returnedItems.reduce((s, l) => s + l.totalTax, 0));
    const grandTotal = round2(returnedItems.reduce((s, l) => s + (l.totalAmount || 0), 0));
    const subtotal = taxableTotal;
    const refundMode = ['cash', 'bank', 'credit'].includes(input?.refundMode)
      ? input.refundMode
      : 'cash';

    const mSession = await mongoose.startSession();
    try {
      let result;
      await mSession.withTransaction(async () => {
        const store = await Store.findById(storeId).session(mSession);
        if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
        const cnNumber = nextCreditNoteNumber(store);
        await store.save({ session: mSession });

        const createdAt = new Date();
        const [creditNote] = await Sale.create(
          [
            {
              invoiceNumber: cnNumber,
              shareToken: token(),
              storeId,
              customerId: original.customerId,
              customerSnapshot: original.customerSnapshot,
              placeOfSupply: original.placeOfSupply,
              invoiceType: original.invoiceType,
              items: returnedItems,
              subtotal,
              totalDiscount,
              totalTax,
              roundOff: 0,
              grandTotal,
              payments: [{ mode: refundMode, amount: grandTotal, reference: '' }],
              amountPaid: refundMode === 'credit' ? 0 : grandTotal,
              change: 0,
              paymentStatus: refundMode === 'credit' ? 'credit' : 'paid',
              saleType: 'pos',
              status: 'returned',
              returnRef: original._id,
              hasWarranty: false,
              warranties: [],
              notes: input?.reason || `Credit note against ${original.invoiceNumber}`,
              createdBy: userId,
              createdAt,
            },
          ],
          { session: mSession },
        );

        // Stock back IN — InventoryEngine.addStock with referenceType='return'
        await InventoryEngine.addStock(
          returnedItems.map((it) => ({ productId: it.productId, quantity: it.quantity })),
          {
            storeId,
            referenceType: 'return',
            referenceId: creditNote._id,
            createdBy: userId,
            reason: `Credit note ${cnNumber}`,
            session: mSession,
          },
        );

        // Mark serialised units that were sold on the original sale as returned.
        const returnedUnitIds = returnedItems
          .map((it) => it.unitId)
          .filter(Boolean);
        if (returnedUnitIds.length) {
          await ProductUnit.updateMany(
            { _id: { $in: returnedUnitIds }, storeId },
            { $set: { status: 'returned' } },
            { session: mSession },
          );
        }

        // Reverse ledger
        await LedgerEngine.recordSaleReturn(creditNote.toObject(), { createdBy: userId, session: mSession });

        // If refund is being adjusted against credit (forgive customer's debt)
        // OR the original sale was unpaid, reduce the customer's outstanding by
        // the original-debt portion this CN cancels. Cash/bank refunds don't
        // touch outstanding — those are settled in cash, not via debt waiver.
        if (original.customerId && refundMode === 'credit') {
          const cust = await Customer.findOne({ _id: original.customerId, storeId }).session(mSession);
          if (cust) {
            const newBal = Math.max(0, Number((Number(cust.outstandingBalance || 0) - grandTotal).toFixed(2)));
            cust.outstandingBalance = newBal;
            await cust.save({ session: mSession });
          }
        }

        result = creditNote.toObject();
      });
      return result;
    } finally {
      await mSession.endSession();
    }
  },
  /**
   * Record a customer payment against an existing credit / partial sale.
   * Appends to sale.payments[], recomputes amountPaid + paymentStatus, and
   * posts ledger (Dr Cash/Bank, Cr Sundry Debtors).
   *
   * input = { mode: 'cash'|'upi'|'card'|'bank', amount: number, reference?: string }
   */
  async recordPayment({ storeId, saleId, input, userId }) {
    if (!mongoose.isValidObjectId(saleId)) {
      throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    }
    const mode = input?.mode;
    const amount = Number(input?.amount || 0);
    const reference = input?.reference || '';

    const validModes = ['cash', 'upi', 'card', 'bank'];
    if (!validModes.includes(mode)) {
      throw new AppError('VALIDATION_ERROR', `Payment mode must be one of: ${validModes.join(', ')}`, 400);
    }
    if (!(amount > 0)) {
      throw new AppError('VALIDATION_ERROR', 'Payment amount must be greater than zero', 400);
    }

    const mSession = await mongoose.startSession();
    try {
      let updated;
      await mSession.withTransaction(async () => {
        const sale = await Sale.findOne({ _id: saleId, storeId }).session(mSession);
        if (!sale) throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
        if (sale.status === 'returned') {
          throw new AppError('SALE_RETURNED', 'Cannot record payment on a credit note', 400);
        }
        if (sale.status === 'voided') {
          throw new AppError('SALE_VOIDED', 'Cannot record payment on a voided sale', 400);
        }
        if (sale.paymentStatus === 'paid') {
          throw new AppError('ALREADY_PAID', 'This invoice is already fully paid', 400);
        }

        const currentPaid = Number(sale.amountPaid || 0);
        const outstanding = Number(sale.grandTotal || 0) - currentPaid;
        if (amount > outstanding + 0.01) {
          throw new AppError(
            'AMOUNT_EXCEEDS_OUTSTANDING',
            `Payment ₹${amount.toFixed(2)} exceeds outstanding ₹${outstanding.toFixed(2)}`,
            400,
          );
        }

        // Persist the new payment entry. Use 'cash' as the schema-allowed alias
        // for 'bank' since the schema enum doesn't include 'bank'; the ledger
        // posts under 'bank' accountType independently.
        const persistMode = mode === 'bank' ? 'cash' : mode;
        sale.payments.push({ mode: persistMode, amount, reference });

        const newPaid = round2(currentPaid + amount);
        sale.amountPaid = newPaid;
        sale.paymentStatus =
          newPaid + 0.01 >= Number(sale.grandTotal || 0)
            ? 'paid'
            : newPaid > 0
              ? 'partial'
              : 'credit';
        await sale.save({ session: mSession });

        await LedgerEngine.recordSalePayment(
          {
            storeId,
            saleId: sale._id,
            invoiceNumber: sale.invoiceNumber,
            customerName: sale.customerSnapshot?.name,
            amount,
            mode,
            reference,
            createdBy: userId,
          },
          { session: mSession },
        );

        // Decrement customer outstanding by the same amount (clamped at 0 so
        // we never go negative if the customer-balance field drifted).
        if (sale.customerId) {
          const cust = await Customer.findOne({ _id: sale.customerId, storeId }).session(mSession);
          if (cust) {
            const newBal = Math.max(0, Number((Number(cust.outstandingBalance || 0) - amount).toFixed(2)));
            cust.outstandingBalance = newBal;
            await cust.save({ session: mSession });
          }
        }

        updated = sale.toObject();
      });
      return updated;
    } finally {
      await mSession.endSession();
    }
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
