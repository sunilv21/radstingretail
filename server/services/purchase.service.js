import mongoose from 'mongoose';
import Store from '../models/Store.js';
import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';
import Supplier from '../models/Supplier.js';
import Account from '../models/Account.js';
import AccountGroup from '../models/AccountGroup.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { AppError } from '../utils/response.js';
import { GSTEngine } from '../engines/gst.engine.js';
import { InventoryEngine } from '../engines/inventory.engine.js';
import { LedgerEngine } from '../engines/ledger.engine.js';
import { nextPoNumber, nextGrnNumber, nextDebitNoteNumber } from '../utils/numbering.js';

/**
 * Map ancillary expense type → human-readable account name. Each type gets
 * its own sub-account under "Direct Expenses" so the P&L splits cleanly
 * (labour vs freight vs packaging, etc.).
 */
const ANCILLARY_TYPE_LABEL = {
  labour: 'Direct Labour',
  packaging: 'Packaging Expenses',
  freight: 'Freight Inwards',
  octroi: 'Octroi & Entry Tax',
  loading: 'Loading Charges',
  unloading: 'Unloading Charges',
  transport: 'Transportation Inwards',
  insurance: 'Goods Insurance',
  customs: 'Customs Duty',
  other: 'Other Direct Expenses',
};

/**
 * Ensure a per-type expense account under "Direct Expenses" group exists,
 * creating both the group and the account if missing. Idempotent and
 * session-aware (operates inside the active mongoose transaction).
 */
async function ensureAncillaryExpenseAccount(storeId, label, session) {
  let group = await AccountGroup.findOne({ storeId, name: 'Direct Expenses' }).session(session);
  if (!group) {
    [group] = await AccountGroup.create(
      [{ storeId, name: 'Direct Expenses', parentId: null, nature: 'expense' }],
      { session, ordered: true },
    );
  }
  let account = await Account.findOne({ storeId, name: label }).session(session);
  if (!account) {
    [account] = await Account.create(
      [{ storeId, name: label, groupId: group._id, openingBalance: 0 }],
      { session, ordered: true },
    );
  }
  return account;
}

function computeLineTotals(items, { storeStateCode, supplierStateCode }) {
  return items.map((it) => {
    const base = Number(it.orderedQty) * Number(it.purchasePrice);
    const discount = Number(it.discount || 0);
    const discountType = it.discountType || 'flat';
    const inclusive = !!it.priceIncludesGst;
    const tax = GSTEngine.computeItemTax(
      {
        basePrice: base,
        quantity: Number(it.orderedQty),
        sellingPrice: Number(it.purchasePrice),
        discount,
        discountType,
        gstRate: Number(it.gstRate || 0),
        priceIncludesGst: inclusive,
      },
      { storeStateCode, customerStateCode: supplierStateCode },
    );
    return {
      productId: it.productId,
      productSnapshot: it.productSnapshot,
      orderedQty: Number(it.orderedQty),
      receivedQty: 0,
      purchasePrice: Number(it.purchasePrice),
      gstRate: Number(it.gstRate || 0),
      priceIncludesGst: inclusive,
      basePrice: tax.basePrice,
      discountAmount: tax.discountAmount,
      taxableAmount: tax.taxableAmount,
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
      totalTax: tax.totalTax,
      totalAmount: tax.totalAmount,
      batchNumber: it.batchNumber || '',
      expiryDate: it.expiryDate || null,
    };
  });
}

// Aggregate from the per-line engine output. Sums must be done against the
// post-extraction values (taxableAmount, totalTax, totalAmount) so the
// invariant grandTotal = sum(totalAmount) holds whether lines are
// GST-inclusive or GST-exclusive — mixing both on the same PO is allowed.
function aggregate(items) {
  const subtotal = items.reduce(
    (s, i) => s + Number(i.taxableAmount || 0) + Number(i.discountAmount || 0),
    0,
  );
  const totalDiscount = items.reduce((s, i) => s + Number(i.discountAmount || 0), 0);
  const totalTax = items.reduce((s, i) => s + Number(i.totalTax || 0), 0);
  const grandTotal = items.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  return {
    subtotal: Number(subtotal.toFixed(2)),
    totalDiscount: Number(totalDiscount.toFixed(2)),
    totalTax: Number(totalTax.toFixed(2)),
    grandTotal: Number(grandTotal.toFixed(2)),
  };
}

async function resolveItems(input, storeId, session) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError('PO_EMPTY', 'Purchase order must include at least one item', 400);
  }
  const ids = input.items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: ids }, storeId })
    .session(session || null)
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return input.items.map((it) => {
    const product = byId.get(String(it.productId));
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', `Product ${it.productId} not found`, 404);
    return {
      ...it,
      productSnapshot: { name: product.name, sku: product.sku, hsnCode: product.hsnCode },
      gstRate: it.gstRate ?? product.gstRate,
      purchasePrice: it.purchasePrice ?? product.purchasePrice,
      // Per-line override > product flag. We don't fall back to the store
      // default here because purchase-side pricing is supplier-quoted and
      // should be explicit per PO line.
      priceIncludesGst:
        it.priceIncludesGst !== undefined
          ? !!it.priceIncludesGst
          : !!product.priceIncludesGst,
    };
  });
}

export const PurchaseService = {
  async list({ storeId, status, supplierId, page = 1, limit = 20 }) {
    const filter = { storeId };
    if (status) filter.status = status;
    if (supplierId && mongoose.isValidObjectId(supplierId)) filter.supplierId = supplierId;
    const [total, data] = await Promise.all([
      Purchase.countDocuments(filter),
      Purchase.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async getById({ storeId, id }) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('PO_NOT_FOUND', 'Purchase order not found', 404);
    }
    const po = await Purchase.findOne({ _id: id, storeId });
    if (!po) throw new AppError('PO_NOT_FOUND', 'Purchase order not found', 404);
    return po;
  },

  async create({ storeId, input, userId, status = 'ordered' }) {
    const mSession = await mongoose.startSession();
    try {
      let created;
      await mSession.withTransaction(async () => {
        const storeDoc = await Store.findById(storeId).session(mSession);
        if (!storeDoc) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
        const supplier = await Supplier.findById(input.supplierId).session(mSession);
        if (!supplier || String(supplier.storeId) !== String(storeId)) {
          throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);
        }

        const resolvedItems = await resolveItems(input, storeId, mSession);
        const items = computeLineTotals(resolvedItems, {
          storeStateCode: storeDoc.stateCode,
          supplierStateCode: supplier.stateCode || storeDoc.stateCode,
        });
        const totals = aggregate(items);
        const poNumber = nextPoNumber(storeDoc);
        await storeDoc.save({ session: mSession });

        const [po] = await Purchase.create(
          [
            {
              poNumber,
              storeId,
              supplierId: supplier._id,
              supplierSnapshot: {
                name: supplier.name,
                phone: supplier.phone,
                gstNumber: supplier.gstNumber,
                stateCode: supplier.stateCode,
                address: supplier.address,
              },
              status,
              items,
              ...totals,
              paymentStatus: 'unpaid',
              amountPaid: 0,
              reverseCharge: !!input.reverseCharge,
              invoiceType: ['regular', 'sez_with_payment', 'sez_without_payment', 'import_of_goods', 'import_of_services', 'deemed_export'].includes(input.invoiceType)
                ? input.invoiceType
                : 'regular',
              dueDate: input.dueDate || null,
              notes: input.notes || '',
              expectedDate: input.expectedDate || null,
              receiptRefs: [],
              createdBy: userId,
            },
          ],
          { session: mSession },
        );
        created = po.toObject();
      });
      return created;
    } finally {
      await mSession.endSession();
    }
  },

  async submit({ storeId, id }) {
    const po = await PurchaseService.getById({ storeId, id });
    if (po.status !== 'draft') {
      throw new AppError('PO_STATE', `Cannot submit a PO in status "${po.status}"`, 400);
    }
    po.status = 'ordered';
    await po.save();
    return po.toObject();
  },

  async preClose({ storeId, id, reason }) {
    const po = await PurchaseService.getById({ storeId, id });
    if (!['ordered', 'partial'].includes(po.status)) {
      throw new AppError('PO_STATE', `Cannot pre-close a PO in status "${po.status}"`, 400);
    }
    po.status = 'closed';
    po.closedReason = reason || '';
    po.closedAt = new Date();
    await po.save();
    return po.toObject();
  },

  async cancel({ storeId, id, reason }) {
    const po = await PurchaseService.getById({ storeId, id });
    if (po.status !== 'draft' && po.status !== 'ordered') {
      throw new AppError('PO_STATE', `Cannot cancel a PO in status "${po.status}"`, 400);
    }
    if (po.items.some((i) => i.receivedQty > 0)) {
      throw new AppError('PO_HAS_RECEIPTS', 'Cancel blocked — some items have been received. Use pre-close instead.', 400);
    }
    po.status = 'cancelled';
    po.closedReason = reason || '';
    po.closedAt = new Date();
    await po.save();
    return po.toObject();
  },

  async receiveGrn({ storeId, id, input, userId }) {
    const mSession = await mongoose.startSession();
    try {
      let result;
      await mSession.withTransaction(async () => {
        const po = await Purchase.findOne({ _id: id, storeId }).session(mSession);
        if (!po) throw new AppError('PO_NOT_FOUND', 'Purchase order not found', 404);
        if (!['ordered', 'partial'].includes(po.status)) {
          throw new AppError('PO_STATE', `Cannot GRN a PO in status "${po.status}"`, 400);
        }
        const storeDoc = await Store.findById(storeId).session(mSession);

        const lines = Array.isArray(input.items) ? input.items : [];
        if (lines.length === 0) {
          throw new AppError('GRN_EMPTY', 'GRN must include at least one item', 400);
        }

        const grnItems = [];
        for (const line of lines) {
          const poItem = po.items.find((i) => String(i.productId) === String(line.productId));
          if (!poItem) {
            throw new AppError('GRN_INVALID_ITEM', `Product ${line.productId} is not in PO ${po.poNumber}`, 400);
          }
          const qty = Number(line.quantity || 0);
          if (qty <= 0) continue;
          const outstanding = poItem.orderedQty - poItem.receivedQty;
          if (qty > outstanding) {
            throw new AppError(
              'GRN_OVER_RECEIVED',
              `Cannot receive ${qty} of ${poItem.productSnapshot?.name} — only ${outstanding} outstanding on this PO`,
              400,
              { ordered: poItem.orderedQty, received: poItem.receivedQty, requested: qty },
            );
          }
          poItem.receivedQty += qty;
          grnItems.push({
            productId: poItem.productId,
            productSnapshot: poItem.productSnapshot,
            quantity: qty,
            purchasePrice: poItem.purchasePrice,
            gstRate: poItem.gstRate,
            // Carry the GST mode forward so GRN totals/ledger postings
            // extract tax instead of stacking it on top of an inclusive
            // supplier-quoted price.
            priceIncludesGst: !!poItem.priceIncludesGst,
            batchNumber: line.batchNumber || poItem.batchNumber || '',
            expiryDate: line.expiryDate || poItem.expiryDate || null,
          });
        }
        if (grnItems.length === 0) {
          throw new AppError('GRN_EMPTY', 'No receivable quantities in this GRN', 400);
        }

        // ---- Ancillary expenses (labour, packaging, freight, …) ----
        // Pulled from the input; each line is either rolled into landed
        // cost (bumps product.purchasePrice) or posted as a separate
        // operating-expense ledger entry. Validated + normalised here so
        // the rest of the flow can rely on clean numbers.
        const rawAncillary = Array.isArray(input.ancillaryExpenses)
          ? input.ancillaryExpenses
          : [];
        const validTypes = new Set([
          'labour', 'packaging', 'freight', 'octroi', 'loading',
          'unloading', 'transport', 'insurance', 'customs', 'other',
        ]);
        const ancillaryExpenses = rawAncillary
          .map((a) => ({
            type: validTypes.has(a?.type) ? a.type : 'other',
            description: String(a?.description || '').slice(0, 200),
            amount: Math.max(0, Number(a?.amount || 0)),
            includeInLandedCost: !!a?.includeInLandedCost,
            paidVia: ['cash', 'bank', 'upi', 'card', 'cheque', 'supplier']
              .includes(a?.paidVia) ? a.paidVia : 'cash',
            paidTo: String(a?.paidTo || '').slice(0, 80),
          }))
          .filter((a) => a.amount > 0);

        const landedCostTotal = ancillaryExpenses
          .filter((a) => a.includeInLandedCost)
          .reduce((s, a) => s + a.amount, 0);

        // Distribute landed-cost amount across grnItems proportional to their
        // value (qty × purchasePrice). This bumps each line's effective
        // purchasePrice so downstream stock valuation reflects true cost.
        if (landedCostTotal > 0) {
          const baseValue = grnItems.reduce(
            (s, i) => s + i.quantity * i.purchasePrice,
            0,
          );
          if (baseValue > 0) {
            for (const it of grnItems) {
              const lineValue = it.quantity * it.purchasePrice;
              const share = (lineValue / baseValue) * landedCostTotal;
              // Per-unit landed-cost addition.
              const perUnit = share / it.quantity;
              it.purchasePrice = Number((it.purchasePrice + perUnit).toFixed(4));
            }
          }
        }

        const grnNumber = nextGrnNumber(storeDoc);
        await storeDoc.save({ session: mSession });

        await InventoryEngine.addStock(
          grnItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          {
            storeId,
            referenceType: 'purchase',
            referenceId: po._id,
            createdBy: userId,
            reason: `GRN ${grnNumber} for ${po.poNumber}`,
            session: mSession,
          },
        );

        // If landed cost was distributed, sync the product master so the
        // bumped per-unit purchase price drives future margin reports.
        // We weight against the new total stock so the existing on-hand
        // value isn't disturbed retroactively.
        if (landedCostTotal > 0) {
          for (const it of grnItems) {
            await Product.updateOne(
              { _id: it.productId, storeId },
              { $set: { purchasePrice: it.purchasePrice } },
              { session: mSession },
            );
          }
        }

        // Sum taxable / tax / total per-line so inclusive lines get their
        // tax extracted (rather than re-applied on top of an already-
        // taxed quote). Mirrors GSTEngine.computeItemTax invariants.
        let grnSubtotal = 0;
        let grnTax = 0;
        let grnTotal = 0;
        for (const i of grnItems) {
          const gross = i.quantity * i.purchasePrice;
          const rate = Number(i.gstRate || 0);
          if (i.priceIncludesGst && rate > 0) {
            const taxable = gross / (1 + rate / 100);
            grnSubtotal += taxable;
            grnTax += gross - taxable;
            grnTotal += gross;
          } else {
            const taxOnTop = gross * (rate / 100);
            grnSubtotal += gross;
            grnTax += taxOnTop;
            grnTotal += gross + taxOnTop;
          }
        }
        grnTotal = Number(grnTotal.toFixed(2));

        await LedgerEngine.recordPurchaseReceipt(
          {
            storeId,
            supplierId: po.supplierId,
            purchaseId: po._id,
            grnNumber,
            subtotal: Number(grnSubtotal.toFixed(2)),
            totalTax: Number(grnTax.toFixed(2)),
            grandTotal: grnTotal,
            createdBy: userId,
          },
          { session: mSession },
        );

        // Supplier outstanding
        await Supplier.updateOne(
          { _id: po.supplierId },
          { $inc: { outstandingBalance: grnTotal } },
          { session: mSession },
        );

        // ---- Operating-expense ledger entries (non-landed-cost ancillary) ----
        // Each type gets one debit on its own sub-account so the P&L splits
        // cleanly. Cash account gets the corresponding credit. Bundling by
        // type keeps the ledger compact even when the user adds several
        // small lines (e.g. multiple labour entries).
        const operatingByType = new Map();
        for (const a of ancillaryExpenses) {
          if (a.includeInLandedCost) continue;
          const curr = operatingByType.get(a.type) || 0;
          operatingByType.set(a.type, curr + a.amount);
        }
        if (operatingByType.size > 0) {
          const cashAccount = await Account.findOne({ storeId, name: 'Cash' }).session(mSession);
          if (!cashAccount) {
            throw new AppError(
              'CASH_ACCOUNT_MISSING',
              'No "Cash" account in chart-of-accounts. Seed chart first.',
              500,
            );
          }
          for (const [type, amount] of operatingByType) {
            const label = ANCILLARY_TYPE_LABEL[type] || ANCILLARY_TYPE_LABEL.other;
            const expAccount = await ensureAncillaryExpenseAccount(storeId, label, mSession);
            await LedgerEntry.create(
              [
                {
                  storeId,
                  entryType: 'debit',
                  accountType: 'expense',
                  accountId: expAccount._id,
                  amount: Number(amount.toFixed(2)),
                  referenceType: 'purchase',
                  referenceId: po._id,
                  narration: `${label} on GRN ${grnNumber} (${po.poNumber})`,
                  createdBy: userId,
                },
                {
                  storeId,
                  entryType: 'credit',
                  accountType: 'cash',
                  accountId: cashAccount._id,
                  amount: Number(amount.toFixed(2)),
                  referenceType: 'purchase',
                  referenceId: po._id,
                  narration: `${label} paid for GRN ${grnNumber}`,
                  createdBy: userId,
                },
              ],
              { session: mSession, ordered: true },
            );
          }
        }

        const ancillaryTotal = ancillaryExpenses.reduce((s, a) => s + a.amount, 0);

        const allReceived = po.items.every((i) => i.receivedQty >= i.orderedQty);
        po.status = allReceived ? 'received' : 'partial';
        po.receiptRefs.push({
          grnNumber,
          items: grnItems,
          total: grnTotal,
          ancillaryTotal: Number(ancillaryTotal.toFixed(2)),
          ancillaryExpenses,
          receivedAt: new Date(),
          receivedBy: userId,
        });
        await po.save({ session: mSession });

        result = {
          po: po.toObject(),
          grnNumber,
          grnTotal,
          ancillaryTotal: Number(ancillaryTotal.toFixed(2)),
          landedCostTotal: Number(landedCostTotal.toFixed(2)),
        };
      });
      return result;
    } finally {
      await mSession.endSession();
    }
  },

  async payPurchase({ storeId, id, input, userId }) {
    const amount = Number(input.amount || 0);
    if (amount <= 0) throw new AppError('VALIDATION_ERROR', 'amount must be > 0', 400);
    const mode = input.mode || 'cash';
    if (!['cash', 'bank', 'upi'].includes(mode)) {
      throw new AppError('VALIDATION_ERROR', 'mode must be cash|bank|upi', 400);
    }

    const mSession = await mongoose.startSession();
    try {
      let updated;
      await mSession.withTransaction(async () => {
        const po = await Purchase.findOne({ _id: id, storeId }).session(mSession);
        if (!po) throw new AppError('PO_NOT_FOUND', 'Purchase order not found', 404);

        await LedgerEngine.recordPurchasePayment(
          {
            storeId,
            supplierId: po.supplierId,
            purchaseId: po._id,
            amount,
            mode,
            reference: input.reference || '',
            createdBy: userId,
          },
          { session: mSession },
        );

        po.amountPaid = Number(((po.amountPaid || 0) + amount).toFixed(2));
        po.paymentStatus = po.amountPaid + 0.01 >= po.grandTotal ? 'paid' : 'partial';
        await po.save({ session: mSession });

        await Supplier.updateOne(
          { _id: po.supplierId },
          { $inc: { outstandingBalance: -amount } },
          { session: mSession },
        );

        updated = po.toObject();
      });
      return updated;
    } finally {
      await mSession.endSession();
    }
  },

  async outstandingBySupplier({ storeId }) {
    const rows = await Purchase.find({
      storeId,
      status: { $in: ['ordered', 'partial'] },
    }).lean();
    const bySupplier = new Map();
    for (const p of rows) {
      const key = String(p.supplierId);
      const bucket = bySupplier.get(key) || {
        supplierId: p.supplierId,
        supplierName: p.supplierSnapshot?.name || 'Unknown',
        poCount: 0,
        outstandingQty: 0,
        outstandingValue: 0,
      };
      bucket.poCount += 1;
      for (const it of p.items) {
        const qty = Math.max(0, it.orderedQty - it.receivedQty);
        bucket.outstandingQty += qty;
        bucket.outstandingValue += qty * it.purchasePrice;
      }
      bySupplier.set(key, bucket);
    }
    return Array.from(bySupplier.values());
  },

  async outstandingByItem({ storeId }) {
    const rows = await Purchase.find({
      storeId,
      status: { $in: ['ordered', 'partial'] },
    }).lean();
    const byProduct = new Map();
    for (const p of rows) {
      for (const it of p.items) {
        const qty = Math.max(0, it.orderedQty - it.receivedQty);
        if (qty <= 0) continue;
        const key = String(it.productId);
        const bucket = byProduct.get(key) || {
          productId: it.productId,
          productName: it.productSnapshot?.name || 'Unknown',
          outstandingQty: 0,
          poRefs: [],
        };
        bucket.outstandingQty += qty;
        bucket.poRefs.push({ poNumber: p.poNumber, purchaseId: p._id, qty });
        byProduct.set(key, bucket);
      }
    }
    return Array.from(byProduct.values());
  },

  /**
   * Issue a Debit Note against a received PO. Creates a NEW purchase doc with
   * status='returned', linked via returnRef, with a DN-… number.
   * Atomically reverses stock + Input GST credit + supplier payable.
   *
   * input.items = [{ productId, quantity }] — what's being returned
   * input.reason — narration on the debit note
   */
  async returnPurchase({ storeId, purchaseId, input, userId }) {
    if (!mongoose.isValidObjectId(purchaseId)) {
      throw new AppError('PO_NOT_FOUND', 'Purchase order not found', 404);
    }

    const returnLines = Array.isArray(input?.items) ? input.items : [];
    if (returnLines.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'At least one line must be returned', 400);
    }

    const mSession = await mongoose.startSession();
    try {
      let result;
      await mSession.withTransaction(async () => {
        const original = await Purchase.findOne({ _id: purchaseId, storeId }).session(mSession);
        if (!original) throw new AppError('PO_NOT_FOUND', 'Purchase order not found', 404);
        if (!['received', 'partial', 'closed'].includes(original.status)) {
          throw new AppError('PO_STATE', `Cannot return a PO in status "${original.status}" — receive goods first`, 400);
        }

        // Match return lines against received quantities and pro-rate the values.
        const dnItems = [];
        for (const r of returnLines) {
          const orig = original.items.find((it) => String(it.productId) === String(r.productId));
          if (!orig) {
            throw new AppError(
              'INVALID_RETURN_ITEM',
              `Product ${r.productId} is not on PO ${original.poNumber}`,
              400,
            );
          }
          const qty = Number(r.quantity || 0);
          if (!(qty > 0) || qty > orig.receivedQty) {
            throw new AppError(
              'INVALID_RETURN_QTY',
              `Return qty ${qty} for ${orig.productSnapshot?.name} must be 1..${orig.receivedQty} (received)`,
              400,
            );
          }
          const ratio = qty / orig.receivedQty;
          dnItems.push({
            productId: orig.productId,
            productSnapshot: orig.productSnapshot,
            orderedQty: qty,
            receivedQty: qty,
            purchasePrice: orig.purchasePrice,
            gstRate: orig.gstRate,
            cgst: round2((orig.cgst || 0) * ratio),
            sgst: round2((orig.sgst || 0) * ratio),
            igst: round2((orig.igst || 0) * ratio),
            taxableAmount: round2((orig.taxableAmount || 0) * ratio),
            totalTax: round2((orig.totalTax || 0) * ratio),
            totalAmount: round2((orig.totalAmount || 0) * ratio),
          });
        }

        const subtotal = round2(dnItems.reduce((s, l) => s + l.taxableAmount, 0));
        const totalTax = round2(dnItems.reduce((s, l) => s + l.totalTax, 0));
        const grandTotal = Number((subtotal + totalTax).toFixed(2));

        const store = await Store.findById(storeId).session(mSession);
        const dnNumber = nextDebitNoteNumber(store);
        await store.save({ session: mSession });

        const [debitNote] = await Purchase.create(
          [
            {
              poNumber: dnNumber,
              storeId,
              supplierId: original.supplierId,
              supplierSnapshot: original.supplierSnapshot,
              status: 'returned',
              returnRef: original._id,
              items: dnItems,
              subtotal,
              totalDiscount: 0,
              totalTax,
              grandTotal,
              paymentStatus: 'unpaid',
              amountPaid: 0,
              reverseCharge: !!original.reverseCharge,
              invoiceType: original.invoiceType || 'regular',
              receiptRefs: [],
              notes: input?.reason || `Debit note against ${original.poNumber}`,
              createdBy: userId,
            },
          ],
          { session: mSession },
        );

        // Stock back OUT (we're returning goods)
        await InventoryEngine.deductStock(
          dnItems.map((it) => ({ productId: it.productId, quantity: it.receivedQty })),
          {
            storeId,
            referenceType: 'return',
            referenceId: debitNote._id,
            createdBy: userId,
            session: mSession,
          },
        );

        await LedgerEngine.recordPurchaseReturn(
          {
            storeId,
            supplierId: original.supplierId,
            purchaseId: debitNote._id,
            dnNumber,
            subtotal,
            totalTax,
            grandTotal,
            createdBy: userId,
          },
          { session: mSession },
        );

        // Reduce supplier outstanding (we owe them less now)
        await Supplier.updateOne(
          { _id: original.supplierId },
          { $inc: { outstandingBalance: -grandTotal } },
          { session: mSession },
        );

        // Roll back the receivedQty on the original PO so re-receive isn't possible
        for (const dnIt of dnItems) {
          const orig = original.items.find((it) => String(it.productId) === String(dnIt.productId));
          if (orig) orig.receivedQty = Math.max(0, orig.receivedQty - dnIt.receivedQty);
        }
        await original.save({ session: mSession });

        result = debitNote.toObject();
      });
      return result;
    } finally {
      await mSession.endSession();
    }
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
