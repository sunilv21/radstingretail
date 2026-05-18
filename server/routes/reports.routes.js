import { Router } from 'express';
import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { ok } from '../utils/response.js';

function toObjId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

const router = Router();

router.get('/dashboard', async (req, res, next) => {
  try {
    const { storeId } = req.user;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [salesAgg, todaySalesAgg, products, recentSales] = await Promise.all([
      Sale.aggregate([
        { $match: { storeId: toObjId(storeId) } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { storeId: toObjId(storeId), createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
      Product.find({ storeId, isActive: true }).lean(),
      Sale.find({ storeId }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const totalSales = salesAgg[0]?.total || 0;
    const todaysSales = todaySalesAgg[0]?.total || 0;
    const todaysInvoices = todaySalesAgg[0]?.count || 0;
    const totalInventoryValue = products.reduce((s, p) => s + p.sellingPrice * p.stock, 0);
    const lowStockItems = products.filter((p) => p.stock <= p.minStock).length;
    const outOfStock = products.filter((p) => p.stock <= 0).length;

    res.json(
      ok({
        totalSales,
        todaysSales,
        todaysInvoices,
        totalInventoryValue,
        lowStockItems,
        outOfStock,
        totalProducts: products.length,
        recentSales: recentSales.map((s) => ({
          _id: s._id,
          invoiceNumber: s.invoiceNumber,
          customer: s.customerSnapshot?.name || 'Walk-in',
          grandTotal: s.grandTotal,
          createdAt: s.createdAt,
        })),
      }),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Warehouse dashboard KPIs. Warehouses don't bill customers, so the regular
 * /reports/dashboard (sales-centric) is mostly empty for them. This endpoint
 * surfaces stock-centric metrics: closing stock value, low/out of stock,
 * inbound (GRNs) and outbound (transfers) for the current month, plus the
 * pipeline of pending outbound transfers and the top stock holdings.
 */
router.get('/warehouse-dashboard', async (req, res, next) => {
  try {
    const { storeId } = req.user;
    const storeIdObj = toObjId(storeId);
    const StockMovement = (await import('../models/StockMovement.js')).default;
    const StoreTransfer = (await import('../models/StoreTransfer.js')).default;
    const Purchase = (await import('../models/Purchase.js')).default;
    const Store = (await import('../models/Store.js')).default;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [products, pendingOutbound, recentOutbound, recentInbound, inboundAgg, outboundAgg, stores] = await Promise.all([
      Product.find({ storeId, isActive: true }).lean(),
      // Pipeline — transfers leaving this warehouse that haven't reached
      // their destination yet. The warehouse operator needs to see these
      // upfront because they represent stock already promised.
      StoreTransfer.find({
        fromStoreId: storeIdObj,
        status: { $in: ['requested', 'in_transit'] },
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      // Last few completed outbound transfers (for the activity feed)
      StoreTransfer.find({
        fromStoreId: storeIdObj,
        status: { $in: ['in_transit', 'received'] },
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      // Last few inbound GRNs — purchases received into this warehouse.
      Purchase.find({ storeId, 'receiptRefs.0': { $exists: true } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),
      // Inbound stock count (units) this month — every 'in' movement.
      StockMovement.aggregate([
        { $match: { storeId: storeIdObj, type: 'in', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, qty: { $sum: '$quantity' }, count: { $sum: 1 } } },
      ]),
      // Outbound this month — 'out' or 'transfer' typed movements.
      StockMovement.aggregate([
        {
          $match: {
            storeId: storeIdObj,
            type: { $in: ['out', 'transfer'] },
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, qty: { $sum: '$quantity' }, count: { $sum: 1 } } },
      ]),
      Store.find({ organizationId: req.user.organizationId }).select({ name: 1, code: 1, type: 1 }).lean(),
    ]);

    // Closing-stock valuation. Two figures: at purchase price (book value
    // for COGS / balance sheet) and at MRP (notional retail value).
    const closingStockValueCost = products.reduce(
      (s, p) => s + Number(p.purchasePrice || 0) * Number(p.stock || 0),
      0,
    );
    const closingStockValueMrp = products.reduce(
      (s, p) => s + Number(p.mrp || p.sellingPrice || 0) * Number(p.stock || 0),
      0,
    );
    const totalUnits = products.reduce((s, p) => s + Number(p.stock || 0), 0);
    const lowStockItems = products.filter((p) => p.stock > 0 && p.stock <= (p.minStock || 0)).length;
    const outOfStock = products.filter((p) => p.stock <= 0).length;

    // Top 10 holdings by cost value — what's tying up the warehouse capital.
    const topHoldings = [...products]
      .map((p) => ({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        unit: p.unit,
        purchasePrice: p.purchasePrice,
        value: Number(p.purchasePrice || 0) * Number(p.stock || 0),
      }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const branchName = (id) => {
      const b = stores.find((s) => String(s._id) === String(id));
      if (!b) return '—';
      return b.code ? `${b.code} · ${b.name}` : b.name;
    };

    res.json(
      ok({
        closingStockValueCost,
        closingStockValueMrp,
        totalUnits,
        totalProducts: products.length,
        lowStockItems,
        outOfStock,
        inbound: {
          unitsThisMonth: inboundAgg[0]?.qty || 0,
          movementsThisMonth: inboundAgg[0]?.count || 0,
          recentGrns: recentInbound.map((p) => {
            const lastGrn = (p.receiptRefs || [])[p.receiptRefs.length - 1] || {};
            return {
              _id: p._id,
              poNumber: p.poNumber,
              grnNumber: lastGrn.grnNumber || null,
              supplier: p.supplierSnapshot?.name || 'Unknown',
              total: lastGrn.total || p.grandTotal || 0,
              receivedAt: lastGrn.receivedAt || p.updatedAt,
            };
          }),
        },
        outbound: {
          unitsThisMonth: outboundAgg[0]?.qty || 0,
          movementsThisMonth: outboundAgg[0]?.count || 0,
          pending: pendingOutbound.map((t) => ({
            _id: t._id,
            transferNumber: t.transferNumber,
            toBranch: branchName(t.toStoreId),
            lines: t.items.length,
            units: t.items.reduce(
              (s, it) => s + Number(it.dispatchedQty || it.requestedQty || 0),
              0,
            ),
            status: t.status,
            createdAt: t.createdAt,
          })),
          recent: recentOutbound.map((t) => ({
            _id: t._id,
            transferNumber: t.transferNumber,
            toBranch: branchName(t.toStoreId),
            lines: t.items.length,
            units: t.items.reduce(
              (s, it) => s + Number(it.dispatchedQty || it.requestedQty || 0),
              0,
            ),
            status: t.status,
            dispatchedAt: t.dispatchedAt,
            createdAt: t.createdAt,
          })),
        },
        topHoldings,
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/low-stock', async (req, res, next) => {
  try {
    const rows = await Product.find({ storeId: req.user.storeId, isActive: true }).lean();
    res.json(ok(rows.filter((p) => p.stock <= p.minStock)));
  } catch (err) {
    next(err);
  }
});

router.get('/gst-summary', async (req, res, next) => {
  try {
    const { storeId } = req.user;
    const { period = new Date().toISOString().slice(0, 7) } = req.query;
    const [year, month] = period.split('-').map(Number);
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const sales = await Sale.find({
      storeId,
      createdAt: { $gte: from, $lt: to },
    }).lean();

    let taxable = 0, cgst = 0, sgst = 0, igst = 0;
    for (const s of sales) {
      for (const it of s.items) {
        taxable += it.taxableAmount || 0;
        cgst += it.cgst || 0;
        sgst += it.sgst || 0;
        igst += it.igst || 0;
      }
    }
    res.json(ok({ period, taxable, cgst, sgst, igst, totalOutputGST: cgst + sgst + igst }));
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------
// Insights — pre-built "common questions" answered against our data.
// --------------------------------------------------------------
router.get('/insights', async (req, res, next) => {
  try {
    const Sale = (await import('../models/Sale.js')).default;
    const Product = (await import('../models/Product.js')).default;
    const Customer = (await import('../models/Customer.js')).default;
    const Supplier = (await import('../models/Supplier.js')).default;
    const StockMovement = (await import('../models/StockMovement.js')).default;

    const storeIdObj = toObjId(req.user.storeId);

    const [topCustomers, topProductsRevenue, topProductsQty, deadStock, customers, products, suppliers, products90, salesAgeAgg] = await Promise.all([
      // Top 10 customers by revenue (excluding voided + returned)
      Sale.aggregate([
        { $match: { storeId: storeIdObj, status: 'completed' } },
        { $group: { _id: { id: '$customerId', name: '$customerSnapshot.name' }, total: { $sum: '$grandTotal' }, invoices: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      // Top 10 products by revenue
      Sale.aggregate([
        { $match: { storeId: storeIdObj, status: 'completed' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: { id: '$items.productId', name: '$items.productSnapshot.name' },
            revenue: { $sum: '$items.totalAmount' },
            qty: { $sum: '$items.quantity' },
            invoices: { $addToSet: '$_id' },
          },
        },
        { $project: { revenue: 1, qty: 1, invoiceCount: { $size: '$invoices' } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
      // Top 10 by quantity
      Sale.aggregate([
        { $match: { storeId: storeIdObj, status: 'completed' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: { id: '$items.productId', name: '$items.productSnapshot.name' },
            qty: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.totalAmount' },
          },
        },
        { $sort: { qty: -1 } },
        { $limit: 10 },
      ]),
      // Dead stock — products with no out-movement in 90 days
      StockMovement.aggregate([
        { $match: { storeId: storeIdObj, type: 'out' } },
        { $group: { _id: '$productId', lastSold: { $max: '$createdAt' } } },
      ]),
      Customer.find({ storeId: req.user.storeId }).lean(),
      Product.find({ storeId: req.user.storeId, isActive: true }).lean(),
      Supplier.find({ storeId: req.user.storeId }).lean(),
      Product.find({ storeId: req.user.storeId, isActive: true }).lean(),
      // Average payment age — days from invoice to fully paid
      Sale.aggregate([
        { $match: { storeId: storeIdObj, status: 'completed', paymentStatus: 'paid' } },
        { $project: { hours: { $divide: [{ $subtract: [new Date(), '$createdAt'] }, 1000 * 60 * 60] } } },
        { $group: { _id: null, avgHours: { $avg: '$hours' } } },
      ]),
    ]);

    // Dead stock: products with stock > 0 but no out-movement in 90 days (or never sold)
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const lastSoldByProduct = new Map(deadStock.map((d) => [String(d._id), new Date(d.lastSold).getTime()]));
    const deadStockRows = products90
      .filter((p) => Number(p.stock) > 0)
      .map((p) => ({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        stockValue: Number(p.purchasePrice || 0) * p.stock,
        lastSoldAt: lastSoldByProduct.get(String(p._id)) || null,
        daysSinceSold: lastSoldByProduct.has(String(p._id))
          ? Math.floor((Date.now() - (lastSoldByProduct.get(String(p._id)) || 0)) / 86400000)
          : null, // null = never sold
      }))
      .filter((p) => p.lastSoldAt === null || p.lastSoldAt < cutoff)
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 20);

    // Profit margin per product (top 10 best, top 10 worst)
    const margin = (p) => {
      const cp = Number(p.purchasePrice || 0);
      const sp = Number(p.sellingPrice || 0);
      if (sp === 0) return null;
      return ((sp - cp) / sp) * 100;
    };
    const productsWithMargin = products
      .map((p) => ({ name: p.name, sku: p.sku, sellingPrice: p.sellingPrice, purchasePrice: p.purchasePrice, marginPct: margin(p) }))
      .filter((p) => p.marginPct !== null);
    const bestMargin = [...productsWithMargin].sort((a, b) => (b.marginPct || 0) - (a.marginPct || 0)).slice(0, 10);
    const worstMargin = [...productsWithMargin].sort((a, b) => (a.marginPct || 0) - (b.marginPct || 0)).slice(0, 10);

    // ----------- Duplicate / data-quality detection -----------
    const dupes = { customerPhones: [], supplierPhones: [], productNames: [], similarCustomers: [] };

    // Customers with the same phone
    const byPhone = new Map();
    for (const c of customers) {
      const p = String(c.phone || '').replace(/\D/g, '');
      if (!p || p.length < 10) continue;
      const k = p.slice(-10); // last 10 digits — handles +91 vs no prefix
      const list = byPhone.get(k) || [];
      list.push(c);
      byPhone.set(k, list);
    }
    for (const [phone, list] of byPhone) {
      if (list.length > 1) {
        dupes.customerPhones.push({
          phone,
          count: list.length,
          customers: list.map((c) => ({ _id: c._id, name: c.name, gstNumber: c.gstNumber || '' })),
        });
      }
    }

    // Suppliers with the same phone
    const byPhoneSupp = new Map();
    for (const s of suppliers) {
      const p = String(s.phone || '').replace(/\D/g, '');
      if (!p || p.length < 10) continue;
      const k = p.slice(-10);
      const list = byPhoneSupp.get(k) || [];
      list.push(s);
      byPhoneSupp.set(k, list);
    }
    for (const [phone, list] of byPhoneSupp) {
      if (list.length > 1) {
        dupes.supplierPhones.push({
          phone,
          count: list.length,
          suppliers: list.map((s) => ({ _id: s._id, name: s.name, gstNumber: s.gstNumber || '' })),
        });
      }
    }

    // Products with the same name but different SKUs
    const byName = new Map();
    for (const p of products) {
      const n = String(p.name).toLowerCase().trim();
      const list = byName.get(n) || [];
      list.push(p);
      byName.set(n, list);
    }
    for (const [name, list] of byName) {
      if (list.length > 1) {
        dupes.productNames.push({
          name,
          count: list.length,
          products: list.map((p) => ({ _id: p._id, sku: p.sku, barcode: p.barcode, sellingPrice: p.sellingPrice })),
        });
      }
    }

    // Customers with very similar names (Levenshtein-like — naive token overlap)
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const tokens = (s) => new Set(norm(s).split(/\s+/).filter(Boolean));
    for (let i = 0; i < customers.length; i++) {
      for (let j = i + 1; j < customers.length; j++) {
        const a = customers[i], b = customers[j];
        if (a._id.equals(b._id)) continue;
        const ta = tokens(a.name);
        const tb = tokens(b.name);
        if (ta.size === 0 || tb.size === 0) continue;
        const inter = [...ta].filter((x) => tb.has(x)).length;
        const overlap = inter / Math.min(ta.size, tb.size);
        if (overlap >= 0.66 && Math.abs(a.name.length - b.name.length) <= 5) {
          dupes.similarCustomers.push({
            a: { _id: a._id, name: a.name },
            b: { _id: b._id, name: b.name },
          });
          if (dupes.similarCustomers.length >= 20) break;
        }
      }
      if (dupes.similarCustomers.length >= 20) break;
    }

    res.json(ok({
      generatedAt: new Date().toISOString(),
      topCustomers: topCustomers.map((r) => ({
        customerId: r._id?.id || null,
        customerName: r._id?.name || 'Walk-in',
        revenue: r.total,
        invoices: r.invoices,
      })),
      topProductsByRevenue: topProductsRevenue.map((r) => ({
        productId: r._id?.id || null,
        productName: r._id?.name || 'Unknown',
        revenue: r.revenue,
        qty: r.qty,
        invoiceCount: r.invoiceCount,
      })),
      topProductsByQty: topProductsQty.map((r) => ({
        productId: r._id?.id || null,
        productName: r._id?.name || 'Unknown',
        qty: r.qty,
        revenue: r.revenue,
      })),
      deadStock: deadStockRows,
      bestMargin,
      worstMargin,
      avgPaymentAgeHours: salesAgeAgg[0]?.avgHours || 0,
      duplicates: dupes,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * Warehouse-flavoured insights. Drops the customer/sales-centric panels
 * (top customers, top products by revenue, margin tables, customer dupes —
 * all empty for a warehouse) and replaces them with stock-movement panels:
 * slow movers, top shipped SKUs, destination breakdown, supplier lead time,
 * recent stockout incidents.
 */
router.get('/warehouse-insights', async (req, res, next) => {
  try {
    const { storeId } = req.user;
    const storeIdObj = toObjId(storeId);
    const StockMovement = (await import('../models/StockMovement.js')).default;
    const StoreTransfer = (await import('../models/StoreTransfer.js')).default;
    const Purchase = (await import('../models/Purchase.js')).default;
    const Supplier = (await import('../models/Supplier.js')).default;
    const Store = (await import('../models/Store.js')).default;

    const now = Date.now();
    const cutoff90 = new Date(now - 90 * 86400000);
    const cutoff30 = new Date(now - 30 * 86400000);

    const [products, lastOutMovements, shippedAgg, destAgg, stockouts, leadTimeAgg, suppliers, stores] = await Promise.all([
      Product.find({ storeId, isActive: true }).lean(),
      // Last "out" or "transfer" movement per product — drives both the dead
      // stock and slow-mover panels.
      StockMovement.aggregate([
        { $match: { storeId: storeIdObj, type: { $in: ['out', 'transfer'] } } },
        { $group: { _id: '$productId', lastOut: { $max: '$createdAt' }, totalOut: { $sum: '$quantity' } } },
      ]),
      // Top shipped SKUs (last 90 days) by qty. Drives "what's flowing
      // through this warehouse" — purely operational, not financial.
      StoreTransfer.aggregate([
        {
          $match: {
            fromStoreId: storeIdObj,
            status: { $in: ['in_transit', 'received'] },
            createdAt: { $gte: cutoff90 },
          },
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: { id: '$items.productId', name: '$items.productSnapshot.name', sku: '$items.productSnapshot.sku' },
            qty: { $sum: { $ifNull: ['$items.dispatchedQty', '$items.requestedQty'] } },
            transfers: { $addToSet: '$_id' },
          },
        },
        { $project: { qty: 1, transferCount: { $size: '$transfers' } } },
        { $sort: { qty: -1 } },
        { $limit: 10 },
      ]),
      // Destination breakdown — which retail branches consume the most.
      StoreTransfer.aggregate([
        {
          $match: {
            fromStoreId: storeIdObj,
            status: { $in: ['in_transit', 'received'] },
            createdAt: { $gte: cutoff90 },
          },
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$toStoreId',
            qty: { $sum: { $ifNull: ['$items.dispatchedQty', '$items.requestedQty'] } },
            transfers: { $addToSet: '$_id' },
          },
        },
        { $project: { qty: 1, transferCount: { $size: '$transfers' } } },
        { $sort: { qty: -1 } },
      ]),
      // Stockouts in the last 30 days — count of stock movements that took
      // a product to zero. previousStock > 0 && newStock <= 0 catches the
      // exact moment it depleted.
      StockMovement.aggregate([
        {
          $match: {
            storeId: storeIdObj,
            createdAt: { $gte: cutoff30 },
            $expr: { $and: [{ $gt: ['$previousStock', 0] }, { $lte: ['$newStock', 0] }] },
          },
        },
        {
          $group: {
            _id: '$productId',
            incidents: { $sum: 1 },
            lastAt: { $max: '$createdAt' },
          },
        },
        { $sort: { incidents: -1, lastAt: -1 } },
        { $limit: 15 },
      ]),
      // Supplier lead time — for purchases of the last 180 days, average
      // hours from `createdAt` (PO date) to first GRN receivedAt.
      Purchase.aggregate([
        {
          $match: {
            storeId: storeIdObj,
            createdAt: { $gte: new Date(now - 180 * 86400000) },
            'receiptRefs.0': { $exists: true },
          },
        },
        {
          $project: {
            supplierId: 1,
            supplierName: '$supplierSnapshot.name',
            createdAt: 1,
            firstReceipt: { $arrayElemAt: ['$receiptRefs.receivedAt', 0] },
          },
        },
        {
          $project: {
            supplierId: 1,
            supplierName: 1,
            leadHours: { $divide: [{ $subtract: ['$firstReceipt', '$createdAt'] }, 1000 * 60 * 60] },
          },
        },
        { $match: { leadHours: { $gte: 0 } } },
        {
          $group: {
            _id: { id: '$supplierId', name: '$supplierName' },
            avgLeadHours: { $avg: '$leadHours' },
            minLeadHours: { $min: '$leadHours' },
            maxLeadHours: { $max: '$leadHours' },
            grns: { $sum: 1 },
          },
        },
        { $sort: { avgLeadHours: 1 } },
        { $limit: 15 },
      ]),
      Supplier.find({ storeId }).select({ name: 1, phone: 1, gstNumber: 1 }).lean(),
      Store.find({ organizationId: req.user.organizationId }).select({ name: 1, code: 1, type: 1 }).lean(),
    ]);

    const lastOutMap = new Map(
      lastOutMovements.map((d) => [String(d._id), new Date(d.lastOut).getTime()]),
    );
    const totalOutMap = new Map(lastOutMovements.map((d) => [String(d._id), d.totalOut]));

    const productMeta = (id) => products.find((p) => String(p._id) === String(id));

    // Dead stock = stock > 0 AND (never moved OR last out ≥ 90 days ago).
    const cutoff90Ms = cutoff90.getTime();
    const cutoff30Ms = cutoff30.getTime();
    const deadStock = products
      .filter((p) => Number(p.stock) > 0)
      .map((p) => ({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        stockValue: Number(p.purchasePrice || 0) * p.stock,
        lastOutAt: lastOutMap.get(String(p._id)) || null,
        daysIdle: lastOutMap.has(String(p._id))
          ? Math.floor((now - (lastOutMap.get(String(p._id)) || 0)) / 86400000)
          : null,
      }))
      .filter((p) => p.lastOutAt === null || p.lastOutAt < cutoff90Ms)
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 20);

    // Slow movers — stock > 0 AND last out between 30 and 90 days ago.
    const slowMovers = products
      .filter((p) => Number(p.stock) > 0)
      .map((p) => ({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        stockValue: Number(p.purchasePrice || 0) * p.stock,
        lastOutAt: lastOutMap.get(String(p._id)) || null,
        daysIdle: lastOutMap.has(String(p._id))
          ? Math.floor((now - (lastOutMap.get(String(p._id)) || 0)) / 86400000)
          : null,
      }))
      .filter(
        (p) =>
          p.lastOutAt !== null &&
          p.lastOutAt >= cutoff90Ms &&
          p.lastOutAt < cutoff30Ms,
      )
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 15);

    // Fast movers — most "out + transfer" quantity, ever (lifetime).
    // Useful for the warehouse operator to know what stays in motion.
    const fastMovers = products
      .map((p) => ({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        totalOut: totalOutMap.get(String(p._id)) || 0,
      }))
      .filter((p) => p.totalOut > 0)
      .sort((a, b) => b.totalOut - a.totalOut)
      .slice(0, 10);

    const branchLookup = (id) => stores.find((s) => String(s._id) === String(id));

    res.json(
      ok({
        generatedAt: new Date().toISOString(),
        deadStock,
        slowMovers,
        fastMovers,
        topShipped: shippedAgg.map((r) => ({
          productId: r._id?.id || null,
          name: r._id?.name || 'Unknown',
          sku: r._id?.sku || '',
          qty: r.qty,
          transferCount: r.transferCount,
        })),
        topDestinations: destAgg.map((r) => {
          const b = branchLookup(r._id);
          return {
            branchId: r._id,
            branchName: b ? (b.code ? `${b.code} · ${b.name}` : b.name) : 'Unknown',
            branchType: b?.type || 'store',
            qty: r.qty,
            transferCount: r.transferCount,
          };
        }),
        stockoutIncidents: stockouts.map((s) => {
          const p = productMeta(s._id);
          return {
            productId: s._id,
            name: p?.name || 'Unknown',
            sku: p?.sku || '',
            currentStock: p?.stock ?? 0,
            incidents: s.incidents,
            lastAt: s.lastAt,
          };
        }),
        supplierLeadTime: leadTimeAgg.map((r) => ({
          supplierId: r._id?.id || null,
          supplierName: r._id?.name || 'Unknown',
          avgDays: Number((r.avgLeadHours / 24).toFixed(1)),
          minDays: Number((r.minLeadHours / 24).toFixed(1)),
          maxDays: Number((r.maxLeadHours / 24).toFixed(1)),
          grns: r.grns,
        })),
        suppliersCount: suppliers.length,
        deadStockValue: deadStock.reduce((s, p) => s + p.stockValue, 0),
        slowMoverValue: slowMovers.reduce((s, p) => s + p.stockValue, 0),
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/aging', async (req, res, next) => {
  try {
    const { storeId } = req.user;
    const Sale = (await import('../models/Sale.js')).default;
    const Purchase = (await import('../models/Purchase.js')).default;
    const Store = (await import('../models/Store.js')).default;

    // Read configured aging-bucket cutoffs from store settings; fall back to
    // the standard 30/60/90 split if missing or malformed.
    const storeDoc = await Store.findById(storeId).lean();
    const cutoffs = (Array.isArray(storeDoc?.settings?.agingBuckets) && storeDoc.settings.agingBuckets.length
      ? storeDoc.settings.agingBuckets
      : [30, 60, 90]
    ).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

    const labels = [];
    let prev = 0;
    for (const c of cutoffs) {
      labels.push(`${prev}-${c}`);
      prev = c;
    }
    labels.push(`${prev}+`);

    const now = Date.now();
    const ageDays = (d) => Math.max(0, Math.floor((now - new Date(d).getTime()) / 86400000));
    const bucketOf = (days) => {
      let last = 0;
      for (let i = 0; i < cutoffs.length; i++) {
        if (days <= cutoffs[i]) return labels[i];
        last = cutoffs[i];
      }
      return labels[labels.length - 1];
    };
    const emptyBuckets = () => Object.fromEntries(labels.map((l) => [l, 0]));

    // --- Receivables (unpaid / partial sales) ---
    const sales = await Sale.find({
      storeId,
      paymentStatus: { $in: ['credit', 'partial'] },
      status: { $ne: 'voided' },
    }).lean();

    const recvByCustomer = new Map();
    for (const s of sales) {
      const due = Number((s.grandTotal || 0) - (s.amountPaid || 0));
      if (due <= 0.01) continue;
      const days = ageDays(s.createdAt);
      const bucket = bucketOf(days);
      const key = String(s.customerId || `walkin-${s.customerSnapshot?.phone || 'unknown'}`);
      const row = recvByCustomer.get(key) || {
        customerId: s.customerId || null,
        customerName: s.customerSnapshot?.name || 'Walk-in',
        phone: s.customerSnapshot?.phone || '',
        invoices: [],
        totalDue: 0,
        buckets: emptyBuckets(),
      };
      row.invoices.push({
        invoiceNumber: s.invoiceNumber,
        invoiceDate: s.createdAt,
        ageDays: days,
        bucket,
        grandTotal: s.grandTotal,
        amountPaid: s.amountPaid || 0,
        due,
      });
      row.totalDue = Number((row.totalDue + due).toFixed(2));
      row.buckets[bucket] = Number((row.buckets[bucket] + due).toFixed(2));
      recvByCustomer.set(key, row);
    }

    // --- Payables (unpaid / partial purchases) ---
    const purchases = await Purchase.find({
      storeId,
      paymentStatus: { $in: ['unpaid', 'partial'] },
      status: { $in: ['ordered', 'partial', 'received', 'closed'] },
    }).lean();

    const payByVendor = new Map();
    for (const p of purchases) {
      const due = Number((p.grandTotal || 0) - (p.amountPaid || 0));
      if (due <= 0.01) continue;
      const days = ageDays(p.createdAt);
      const bucket = bucketOf(days);
      const key = String(p.supplierId);
      const row = payByVendor.get(key) || {
        supplierId: p.supplierId,
        supplierName: p.supplierSnapshot?.name || 'Unknown',
        phone: p.supplierSnapshot?.phone || '',
        gstNumber: p.supplierSnapshot?.gstNumber || '',
        purchases: [],
        totalDue: 0,
        buckets: emptyBuckets(),
      };
      row.purchases.push({
        poNumber: p.poNumber,
        poDate: p.createdAt,
        ageDays: days,
        bucket,
        grandTotal: p.grandTotal,
        amountPaid: p.amountPaid || 0,
        due,
      });
      row.totalDue = Number((row.totalDue + due).toFixed(2));
      row.buckets[bucket] = Number((row.buckets[bucket] + due).toFixed(2));
      payByVendor.set(key, row);
    }

    const sumBuckets = (rows) => {
      const tot = emptyBuckets();
      let total = 0;
      for (const r of rows) {
        for (const k of Object.keys(tot)) tot[k] += r.buckets[k] || 0;
        total += r.totalDue;
      }
      for (const k of Object.keys(tot)) tot[k] = Number(tot[k].toFixed(2));
      return { buckets: tot, total: Number(total.toFixed(2)) };
    };

    const recvRows = Array.from(recvByCustomer.values()).sort((a, b) => b.totalDue - a.totalDue);
    const payRows = Array.from(payByVendor.values()).sort((a, b) => b.totalDue - a.totalDue);

    res.json(ok({
      bucketLabels: labels,
      receivables: { rows: recvRows, ...sumBuckets(recvRows) },
      payables: { rows: payRows, ...sumBuckets(payRows) },
    }));
  } catch (err) {
    next(err);
  }
});

router.get('/ledger-balance', async (req, res, next) => {
  try {
    const rows = await LedgerEntry.aggregate([
      { $match: { storeId: toObjId(req.user.storeId) } },
      { $group: { _id: '$entryType', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const debits = rows.find((r) => r._id === 'debit')?.total || 0;
    const credits = rows.find((r) => r._id === 'credit')?.total || 0;
    const count = rows.reduce((s, r) => s + r.count, 0);
    res.json(ok({ debits, credits, balanced: Math.abs(debits - credits) < 0.01, count }));
  } catch (err) {
    next(err);
  }
});

export default router;
