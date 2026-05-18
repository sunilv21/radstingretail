/**
 * Seed demo data for a warehouse so the Warehouse Dashboard + Insights have
 * something real to render. Targets one specific warehouse (defaults to the
 * first active warehouse in the tenant org; pass a name fragment to pick a
 * specific one — e.g. `node seed-warehouse-data.js admin@example.com LOL`).
 *
 * What it generates:
 *   - 50 products at the warehouse (electronics, grocery, apparel, FMCG)
 *     with realistic HSN codes + GST rates from the curated master.
 *   - 12 suppliers tied to the org.
 *   - 25 purchase orders + GRNs spread over the last 120 days so supplier
 *     lead-time, recent-GRN list, and inbound-units-month metrics fill in.
 *   - 40 outbound transfers from the warehouse to retail branches in the
 *     same org over the last 90 days — drives the outbound pipeline,
 *     top-shipped SKUs and top-destination panels.
 *   - Direct StockMovement docs that simulate:
 *       • Dead stock (10 SKUs with no out-movement in 100+ days)
 *       • Slow movers (8 SKUs with last out 30–80 days ago)
 *       • Fast movers (12 SKUs with heavy lifetime out qty)
 *       • Stockouts (6 SKUs that hit zero in the last 30 days)
 *
 * Idempotency: every doc carries an `idempotencyKey` (where supported) or a
 * batch tag in the numbering prefix (WH-DEMO-XX-…), so re-running adds a
 * new wave instead of crashing on unique-index conflicts.
 *
 * Usage:
 *   node server/scripts/seed-warehouse-data.js [tenantEmail] [warehouseNameFragment]
 *   node server/scripts/seed-warehouse-data.js admin@example.com LOL
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.resolve(envRoot, '.env.local') });
dotenv.config({ path: path.resolve(envRoot, '.env') });

import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { connectDB } from '../config/database.js';
import TenantAdmin from '../models/TenantAdmin.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import Purchase from '../models/Purchase.js';
import StockMovement from '../models/StockMovement.js';
import StoreTransfer from '../models/StoreTransfer.js';
import { HSN_MASTER } from '../data/hsn-master.js';

// ---------- CLI / config -----------------------------------------------------

const TARGET_EMAIL = (process.argv[2] || 'admin@example.com').toLowerCase();
const WAREHOUSE_NAME_HINT = (process.argv[3] || '').toLowerCase().trim();

// ---------- helpers ---------------------------------------------------------

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i += 1) out.push(copy.splice(rand(copy.length), 1)[0]);
  return out;
};
const randFloat = (min, max) => +(min + Math.random() * (max - min)).toFixed(2);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

// HSN entries the seed picks from — keep variety so insights group nicely.
// We prefer 4- and 6-digit entries since those validate against the org's
// default `hsnDigitsRequired = 4`.
const HSN_POOL = HSN_MASTER.filter((h) => h.kind === 'hsn' && /^\d{4,6}$/.test(h.code));

const CATEGORIES = ['Electronics', 'Grocery', 'Apparel', 'Hardware', 'Stationery', 'FMCG', 'Home'];

const PRODUCT_NAMES = {
  Electronics: ['LED Bulb 9W', 'USB-C Cable 1m', 'Power Strip 4-Way', 'AA Battery (4-pack)', 'Mobile Charger 20W', 'Earphones Wired', 'Extension Cord 5m', 'Wall Clock', 'Table Fan 12in', 'Iron Box 1000W'],
  Grocery: ['Basmati Rice 5kg', 'Wheat Flour 10kg', 'Sunflower Oil 1L', 'Toor Dal 1kg', 'Sugar 1kg', 'Salt Iodised 1kg', 'Tea Powder 500g', 'Instant Coffee 100g', 'Mustard Oil 1L', 'Turmeric Powder 200g'],
  Apparel: ['Cotton T-Shirt M', 'Cotton T-Shirt L', 'Denim Jeans 32', 'Bath Towel', 'Bedsheet Double', 'Socks Pack', 'Cap Plain', 'Handkerchief Pack', 'Innerwear M', 'Track Pants L'],
  Hardware: ['8mm Bolt Pack', 'PVC Pipe 1in', 'Wood Glue 100g', 'Sandpaper Sheets', 'Paint Brush 2in', 'Drill Bit Set', 'Screwdriver Combo', 'Measuring Tape 5m', 'Wire Roll 50m', 'Door Hinge Pack'],
  Stationery: ['A4 Paper 500 sheets', 'Ballpoint Pen Box', 'Notebook 200pg', 'Stapler Standard', 'Highlighter Pack', 'Marker Pack', 'Sticky Notes', 'Cellotape Roll', 'File Folder', 'Pencil Box'],
  FMCG: ['Soap Bar 100g', 'Shampoo 200ml', 'Toothpaste 150g', 'Hair Oil 100ml', 'Detergent 1kg', 'Dishwash Liquid 500ml', 'Toilet Cleaner 500ml', 'Floor Cleaner 1L', 'Hand Wash 250ml', 'Razor Disposable'],
  Home: ['Steel Tumbler 300ml', 'Plate Set (6)', 'Pressure Cooker 3L', 'Kadhai 25cm', 'Mixing Bowl Set', 'Cutting Board', 'Mop with Bucket', 'Broom Stick', 'Doormat', 'Bin 10L'],
};

const SUPPLIER_BASE = [
  'Shree', 'Maa', 'Bharat', 'Gupta', 'Sharma', 'Anand', 'Rana', 'Asian',
  'Royal', 'Modern', 'New', 'Sai', 'Krishna', 'Apex', 'Kumar', 'Singh',
];
const SUPPLIER_TAIL = ['Traders', 'Enterprises', 'Distributors', 'Suppliers', 'Wholesale', 'Trading Co.'];

function gstinFor(stateCode) {
  const state = String(stateCode || '07').padStart(2, '0');
  const pan = Array.from({ length: 5 }, () => String.fromCharCode(65 + rand(26))).join('')
    + Array.from({ length: 4 }, () => String(rand(10))).join('')
    + String.fromCharCode(65 + rand(26));
  return `${state}${pan}1Z${String.fromCharCode(65 + rand(26))}`;
}

function phone() {
  return `9${Array.from({ length: 9 }, () => String(rand(10))).join('')}`;
}

// ---------- BOOT ------------------------------------------------------------

await connectDB();

const admin = await TenantAdmin.findOne({ email: TARGET_EMAIL });
if (!admin) {
  console.error(`No tenant admin found for ${TARGET_EMAIL}`);
  process.exit(1);
}
const org = await Organization.findById(admin.organizationId);
if (!org) {
  console.error(`No organization for tenant admin ${TARGET_EMAIL}`);
  process.exit(1);
}

// Find the target warehouse. Match by name fragment if given; otherwise
// take the first active warehouse in the org.
let warehouse;
if (WAREHOUSE_NAME_HINT) {
  warehouse = await Store.findOne({
    organizationId: org._id,
    type: 'warehouse',
    isActive: { $ne: false },
    name: { $regex: WAREHOUSE_NAME_HINT, $options: 'i' },
  });
}
if (!warehouse) {
  warehouse = await Store.findOne({
    organizationId: org._id,
    type: 'warehouse',
    isActive: { $ne: false },
  });
}
if (!warehouse) {
  console.error(
    `No warehouse found for org "${org.name}". Create one first (Branches → New branch → Warehouse).`,
  );
  process.exit(1);
}

const stores = await Store.find({
  organizationId: org._id,
  type: 'store',
  isActive: { $ne: false },
}).lean();
if (stores.length === 0) {
  console.error(
    `No retail stores in org "${org.name}" — transfers need at least one destination. Create a retail branch first.`,
  );
  process.exit(1);
}

const BATCH = crypto.randomBytes(2).toString('hex').toUpperCase();
const stateCode = warehouse.stateCode || '07';

console.log(
  `Seeding warehouse "${warehouse.name}" (${stateCode}) in org "${org.name}" — destinations: ${stores
    .map((s) => s.name)
    .join(', ')} [batch ${BATCH}]`,
);

// ============================================================================
// PRODUCTS — 50 SKUs in the warehouse
// ============================================================================

const productDocs = [];
for (const category of CATEGORIES) {
  for (const name of PRODUCT_NAMES[category]) {
    productDocs.push({
      storeId: warehouse._id,
      name: `${name}`,
      sku: `WH-${BATCH}-${String(productDocs.length + 1).padStart(4, '0')}`,
      barcode: `89${Array.from({ length: 10 }, () => String(rand(10))).join('')}`,
      category,
      brand: pick(['Local', 'Brand A', 'Brand B', 'Premium', 'Generic']),
      unit: 'pcs',
      purchasePrice: randFloat(20, 800),
      sellingPrice: 0, // overridden below
      mrp: 0,
      gstRate: 18,
      hsnCode: '',
      stock: 0, // will be set via stock movements
      minStock: 10,
      maxStock: 500,
      reorderQty: 50,
      warrantyMonths: category === 'Electronics' ? 12 : 0,
      isActive: true,
      createdBy: admin._id,
    });
  }
}

// Pick a sensible HSN + rate from the master per product. Apparel uses
// 6101/6109, FMCG uses 3401/3304, etc. We do best-effort matching by
// category keyword in the description.
const HSN_BY_CATEGORY = {
  Electronics: HSN_POOL.filter((h) => /lamp|wire|cable|battery|fan|charger|electric/i.test(h.description)),
  Grocery: HSN_POOL.filter((h) => /rice|flour|oil|sugar|salt|tea|coffee|spice|dal/i.test(h.description)),
  Apparel: HSN_POOL.filter((h) => /garment|shirt|t-shirt|cotton|towel|sock|cap/i.test(h.description)),
  Hardware: HSN_POOL.filter((h) => /screw|bolt|pipe|nail|paint|tool|hand tool|drill/i.test(h.description)),
  Stationery: HSN_POOL.filter((h) => /paper|pen|note|envelope|stationery|register/i.test(h.description)),
  FMCG: HSN_POOL.filter((h) => /soap|shampoo|toothpaste|hair|detergent|cleaning|cosmetic/i.test(h.description)),
  Home: HSN_POOL.filter((h) => /kitchen|table|household|cooker|mat|broom|tableware/i.test(h.description)),
};

for (const p of productDocs) {
  const pool = HSN_BY_CATEGORY[p.category]?.length ? HSN_BY_CATEGORY[p.category] : HSN_POOL.slice(0, 30);
  const pick1 = pick(pool);
  p.hsnCode = pick1.code;
  p.gstRate = pick1.gstRate;
  p.sellingPrice = +(p.purchasePrice * randFloat(1.25, 1.6)).toFixed(2);
  p.mrp = +(p.sellingPrice * randFloat(1.0, 1.15)).toFixed(2);
}

const products = await Product.insertMany(productDocs);
console.log(`✓ Inserted ${products.length} products`);

// ============================================================================
// SUPPLIERS — 12 tied to the org
// ============================================================================

const supplierDocs = [];
for (let i = 0; i < 12; i += 1) {
  const name = `${pick(SUPPLIER_BASE)} ${pick(SUPPLIER_TAIL)}`;
  supplierDocs.push({
    storeId: warehouse._id,
    name,
    phone: phone(),
    email: `${name.toLowerCase().replace(/\W+/g, '.')}.${BATCH}@example.com`,
    gstNumber: gstinFor(pick(['07', '24', '27', '29', '33'])),
    address: `${rand(900) + 100}, Industrial Area Phase ${rand(5) + 1}`,
    outstandingBalance: 0,
    createdBy: admin._id,
  });
}
const suppliers = await Supplier.insertMany(supplierDocs);
console.log(`✓ Inserted ${suppliers.length} suppliers`);

// ============================================================================
// INITIAL STOCK + DEAD/SLOW/FAST/STOCKOUT — direct StockMovement docs
//
// We bypass the normal purchase pipeline for the initial "now" stock so
// the dashboard reflects a believable mix on first load. Each segment is
// labeled in `reason` so they're easy to identify in the audit trail.
// ============================================================================

const movements = [];
const productStockMap = new Map(); // productId → current stock

function pushMovement({ productId, type, quantity, daysBack, reason, refType = 'manual' }) {
  const prev = productStockMap.get(String(productId)) ?? 0;
  const next = type === 'in' ? prev + quantity : prev - quantity;
  movements.push({
    storeId: warehouse._id,
    productId,
    type,
    quantity,
    previousStock: prev,
    newStock: next,
    referenceType: refType,
    reason,
    createdAt: daysAgo(daysBack),
  });
  productStockMap.set(String(productId), next);
}

// Bucket products into segments so the insights panels light up cleanly.
const shuffled = [...products].sort(() => Math.random() - 0.5);
const deadStock = shuffled.slice(0, 10);          // last out 100+ days, still has stock
const slowMovers = shuffled.slice(10, 18);        // last out 30–80 days
const fastMovers = shuffled.slice(18, 30);        // heavy out lifetime
const stockouts = shuffled.slice(30, 36);         // hit zero in last 30 days
const normalSkus = shuffled.slice(36);            // healthy on-hand

// Dead stock — single big inflow 110 days ago, no out movements at all.
for (const p of deadStock) {
  pushMovement({
    productId: p._id,
    type: 'in',
    quantity: 80 + rand(120),
    daysBack: 110 + rand(40),
    reason: 'Initial GRN (dead stock seed)',
    refType: 'purchase',
  });
}

// Slow movers — inflow 90 days ago, one small out 30–80 days ago.
for (const p of slowMovers) {
  pushMovement({
    productId: p._id,
    type: 'in',
    quantity: 60 + rand(60),
    daysBack: 95,
    reason: 'Initial GRN (slow mover seed)',
    refType: 'purchase',
  });
  pushMovement({
    productId: p._id,
    type: 'transfer',
    quantity: 5 + rand(10),
    daysBack: 40 + rand(40),
    reason: 'Transfer to retail (slow mover)',
    refType: 'transfer',
  });
}

// Fast movers — large inflow + repeated outflows in the last 60 days,
// still has healthy stock.
for (const p of fastMovers) {
  pushMovement({
    productId: p._id,
    type: 'in',
    quantity: 300 + rand(300),
    daysBack: 70,
    reason: 'Initial GRN (fast mover seed)',
    refType: 'purchase',
  });
  // 4–8 outflows over the period
  const outflows = 4 + rand(5);
  for (let i = 0; i < outflows; i += 1) {
    pushMovement({
      productId: p._id,
      type: 'transfer',
      quantity: 15 + rand(30),
      daysBack: 60 - i * 7,
      reason: 'Transfer to retail (fast mover)',
      refType: 'transfer',
    });
  }
}

// Stockouts — inflow then a stockout-triggering out within the last 30 days.
// We engineer previousStock>0 && newStock<=0 so the insights endpoint
// counts the incident.
for (const p of stockouts) {
  const initialQty = 25 + rand(20);
  pushMovement({
    productId: p._id,
    type: 'in',
    quantity: initialQty,
    daysBack: 50,
    reason: 'Initial GRN (stockout seed)',
    refType: 'purchase',
  });
  // Partial outflow first
  pushMovement({
    productId: p._id,
    type: 'transfer',
    quantity: Math.floor(initialQty * 0.6),
    daysBack: 25,
    reason: 'Transfer to retail (pre-stockout)',
    refType: 'transfer',
  });
  // The exact zero-crossing
  pushMovement({
    productId: p._id,
    type: 'transfer',
    quantity: Math.ceil(initialQty * 0.4),
    daysBack: 10 + rand(15),
    reason: 'Transfer to retail (stockout)',
    refType: 'transfer',
  });
}

// Normal SKUs — healthy inflow + a couple of recent outflows.
for (const p of normalSkus) {
  pushMovement({
    productId: p._id,
    type: 'in',
    quantity: 150 + rand(150),
    daysBack: 60 + rand(30),
    reason: 'Initial GRN (normal seed)',
    refType: 'purchase',
  });
  pushMovement({
    productId: p._id,
    type: 'transfer',
    quantity: 10 + rand(25),
    daysBack: 15 + rand(20),
    reason: 'Transfer to retail',
    refType: 'transfer',
  });
}

if (movements.length > 0) {
  await StockMovement.insertMany(movements);
  console.log(`✓ Inserted ${movements.length} stock movements`);
}

// Sync product.stock to the computed end-state per SKU. Bulk-update for speed.
const bulk = products.map((p) => ({
  updateOne: {
    filter: { _id: p._id },
    update: { $set: { stock: Math.max(0, productStockMap.get(String(p._id)) ?? 0) } },
  },
}));
if (bulk.length > 0) await Product.bulkWrite(bulk);
console.log(`✓ Synced Product.stock to movement totals`);

// ============================================================================
// PURCHASE ORDERS + GRNs — 25 spread over 120 days
//
// These feed the "supplier lead time" panel + "recent inbound (GRNs)" tile.
// Lead time is computed as (firstReceipt.receivedAt − po.createdAt), so we
// stagger receivedAt anywhere from same-day to 18 days after the PO date.
// ============================================================================

const poDocs = [];
for (let i = 0; i < 25; i += 1) {
  const supplier = pick(suppliers);
  const lineCount = 2 + rand(4);
  const productLines = pickN(products, lineCount).map((p) => ({
    productId: p._id,
    productSnapshot: {
      name: p.name,
      sku: p.sku,
      hsnCode: p.hsnCode,
    },
    orderedQty: 20 + rand(80),
    receivedQty: 0, // set on receipt below
    purchasePrice: p.purchasePrice,
    discount: 0,
    discountType: 'flat',
    discountAmount: 0,
    gstRate: p.gstRate,
    cgst: 0,
    sgst: 0,
    igst: 0,
    batchNumber: '',
    expiryDate: null,
    taxableAmount: 0,
    totalTax: 0,
    totalAmount: 0,
  }));

  // Compute line totals + summary
  let subtotal = 0, totalTax = 0;
  for (const l of productLines) {
    const base = l.orderedQty * l.purchasePrice;
    const taxable = base;
    const tax = taxable * (l.gstRate / 100);
    l.taxableAmount = +taxable.toFixed(2);
    l.totalTax = +tax.toFixed(2);
    l.totalAmount = +(taxable + tax).toFixed(2);
    // 50/50 split CGST+SGST (intra-state warehouse)
    l.cgst = +(tax / 2).toFixed(2);
    l.sgst = +(tax / 2).toFixed(2);
    subtotal += taxable;
    totalTax += tax;
  }

  const orderDaysBack = 5 + rand(115);
  const leadDays = rand(18); // 0–17 day lead time
  const allReceived = Math.random() > 0.2; // 80% fully received

  // Mark all lines fully received for completed POs.
  if (allReceived) {
    for (const l of productLines) l.receivedQty = l.orderedQty;
  } else {
    // Partial — receive ~60–90% of each line
    for (const l of productLines) {
      l.receivedQty = Math.floor(l.orderedQty * (0.6 + Math.random() * 0.3));
    }
  }

  const grnNumber = `GRN-DEMO-${BATCH}-${String(i + 1).padStart(3, '0')}`;
  const grnReceivedAt = daysAgo(orderDaysBack - leadDays);
  const grnTotal = productLines.reduce(
    (s, l) => s + l.receivedQty * l.purchasePrice * (1 + l.gstRate / 100),
    0,
  );

  poDocs.push({
    poNumber: `PO-DEMO-${BATCH}-${String(i + 1).padStart(3, '0')}`,
    storeId: warehouse._id,
    supplierId: supplier._id,
    supplierSnapshot: {
      name: supplier.name,
      phone: supplier.phone,
      gstNumber: supplier.gstNumber,
      stateCode: supplier.gstNumber?.slice(0, 2) || '07',
      address: supplier.address,
    },
    status: allReceived ? 'received' : 'partial',
    items: productLines,
    subtotal: +subtotal.toFixed(2),
    totalDiscount: 0,
    totalTax: +totalTax.toFixed(2),
    grandTotal: +(subtotal + totalTax).toFixed(2),
    paymentStatus: Math.random() > 0.6 ? 'paid' : 'unpaid',
    amountPaid: 0,
    reverseCharge: false,
    invoiceType: 'regular',
    receiptRefs: [
      {
        grnNumber,
        items: productLines.map((l) => ({
          productId: l.productId,
          quantity: l.receivedQty,
          purchasePrice: l.purchasePrice,
        })),
        total: +grnTotal.toFixed(2),
        ancillaryTotal: 0,
        ancillaryExpenses: [],
        receivedAt: grnReceivedAt,
        receivedBy: admin._id,
      },
    ],
    createdBy: admin._id,
    createdAt: daysAgo(orderDaysBack),
    updatedAt: grnReceivedAt,
  });
}

await Purchase.insertMany(poDocs);
console.log(`✓ Inserted ${poDocs.length} purchase orders (with GRNs)`);

// ============================================================================
// OUTBOUND TRANSFERS — 40 spread over 90 days
//
// These light up the outbound pipeline + top-shipped SKUs + top-destination
// branches. Status mix: 5% requested, 20% in_transit, 75% received.
// ============================================================================

const transferDocs = [];
for (let i = 0; i < 40; i += 1) {
  const toStore = pick(stores);
  const itemPicks = pickN(products, 1 + rand(4));
  const transferItems = itemPicks.map((p) => {
    const qty = 5 + rand(40);
    return {
      productId: p._id,
      productSnapshot: {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        hsnCode: p.hsnCode,
      },
      requestedQty: qty,
      dispatchedQty: qty,
      receivedQty: qty,
      costPrice: p.purchasePrice,
    };
  });

  const daysBack = rand(90);
  const r = Math.random();
  const status = r < 0.05 ? 'requested' : r < 0.25 ? 'in_transit' : 'received';

  // For non-received transfers, zero out the receivedQty so the pipeline
  // panel shows them as in-flight stock.
  if (status === 'requested') {
    for (const it of transferItems) {
      it.dispatchedQty = 0;
      it.receivedQty = 0;
    }
  } else if (status === 'in_transit') {
    for (const it of transferItems) {
      it.receivedQty = 0;
    }
  }

  transferDocs.push({
    organizationId: org._id,
    fromStoreId: warehouse._id,
    toStoreId: toStore._id,
    transferNumber: `TRF-DEMO-${BATCH}-${String(i + 1).padStart(3, '0')}`,
    items: transferItems,
    status,
    notes: `Demo seed transfer to ${toStore.name}`,
    requestedBy: admin._id,
    dispatchedBy: status !== 'requested' ? admin._id : null,
    dispatchedAt: status !== 'requested' ? daysAgo(daysBack - 0.5) : null,
    receivedBy: status === 'received' ? admin._id : null,
    receivedAt: status === 'received' ? daysAgo(Math.max(0, daysBack - 1)) : null,
    createdAt: daysAgo(daysBack),
    updatedAt: daysAgo(daysBack),
  });
}

await StoreTransfer.insertMany(transferDocs);
console.log(`✓ Inserted ${transferDocs.length} outbound transfers`);

// ============================================================================
// DONE
// ============================================================================

console.log('\n--- Warehouse demo seed complete ---');
console.log(`Warehouse:       ${warehouse.name} (state ${stateCode})`);
console.log(`Products:        ${products.length}`);
console.log(`Suppliers:       ${suppliers.length}`);
console.log(`Stock movements: ${movements.length}`);
console.log(`Purchase orders: ${poDocs.length}`);
console.log(`Transfers:       ${transferDocs.length}`);
console.log(`Batch tag:       ${BATCH}`);
console.log(`\nSwitch into the warehouse from the store-switcher to see the dashboard + insights.`);

await mongoose.disconnect();
process.exit(0);
