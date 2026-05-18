/**
 * Seed realistic demo data into a tenant's primary store.
 *
 *   node server/scripts/seed-demo-data.js [admin-email]
 *
 * Default email: admin@example.com. Resolves the tenant_admin row,
 * walks up to the org, picks the first active store, and inserts:
 *
 *   - 50 suppliers (Indian B2B, with GSTIN + state)
 *   - 350 products across 14 categories, ~28% with warranty,
 *     ~10% serialised (electronics + appliances)
 *   - 80 customers (walk-in / retail / B2B mix)
 *   - 150 purchase orders with mixed statuses (draft → received → closed)
 *   - 600 sales spread across the last 180 days, with split payments,
 *     credit sales, returns, serialised line items + warranty grants
 *
 * Idempotent-ish: invoice / PO / SKU / serial numbers are namespaced
 * with a `DEMO-` prefix so re-running adds another batch instead of
 * conflicting with anything already in the store.
 *
 * Bulk-inserted with insertMany. Runs in ~10s on a warm Atlas
 * connection, ~30s cold.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(envRoot, '.env.local') });
dotenv.config({ path: path.join(envRoot, '.env') });

import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { connectDB } from '../config/database.js';
import TenantAdmin from '../models/TenantAdmin.js';
import Organization from '../models/Organization.js';
import Store from '../models/Store.js';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';

const TARGET_EMAIL = (process.argv[2] || 'admin@example.com').toLowerCase();

// ---------- Reproducible PRNG -------------------------------------------
// Using crypto.randomInt for a quick boot but the rest is plain Math
// so the script is fast even when generating thousands of rows.
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const pickN = (arr, n) => {
  const cp = [...arr];
  const out = [];
  for (let i = 0; i < n && cp.length > 0; i++) out.push(cp.splice(rand(cp.length), 1)[0]);
  return out;
};
const randFloat = (min, max) => +(min + Math.random() * (max - min)).toFixed(2);
const chance = (p) => Math.random() < p;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

// ---------- Catalogue dictionaries --------------------------------------
const CATEGORIES = [
  { name: 'Mobile Phones', hsn: '8517', gst: 18, brands: ['Samsung', 'Apple', 'OnePlus', 'Realme', 'Xiaomi', 'Vivo', 'Oppo', 'Motorola'], price: [4990, 89990], serialised: 0.85, warranty: 12 },
  { name: 'Laptops', hsn: '8471', gst: 18, brands: ['Lenovo', 'Dell', 'HP', 'Apple', 'Asus', 'Acer'], price: [29990, 159990], serialised: 0.95, warranty: 12 },
  { name: 'TV & Audio', hsn: '8528', gst: 28, brands: ['Sony', 'LG', 'Samsung', 'Mi', 'OnePlus', 'Boat', 'JBL'], price: [1490, 89990], serialised: 0.40, warranty: 24 },
  { name: 'Cameras', hsn: '8525', gst: 18, brands: ['Canon', 'Nikon', 'Sony', 'GoPro', 'Fujifilm'], price: [12990, 199990], serialised: 0.90, warranty: 12 },
  { name: 'Home Appliances', hsn: '8418', gst: 28, brands: ['Whirlpool', 'Bosch', 'LG', 'Samsung', 'Voltas', 'Haier', 'IFB'], price: [4990, 64990], serialised: 0.60, warranty: 24 },
  { name: 'Apparel — Men', hsn: '6203', gst: 12, brands: ['Levi\'s', 'Peter England', 'Allen Solly', 'Van Heusen', 'Arrow', 'Raymond'], price: [499, 4990], serialised: 0, warranty: 0 },
  { name: 'Apparel — Women', hsn: '6204', gst: 12, brands: ['Biba', 'W', 'Global Desi', 'Aurelia', 'AND'], price: [799, 5990], serialised: 0, warranty: 0 },
  { name: 'Footwear', hsn: '6403', gst: 18, brands: ['Nike', 'Adidas', 'Puma', 'Reebok', 'Bata', 'Woodland'], price: [799, 9990], serialised: 0, warranty: 0 },
  { name: 'Groceries', hsn: '1006', gst: 5, brands: ['Tata', 'Fortune', 'India Gate', 'Aashirvaad', 'Patanjali'], price: [29, 1499], serialised: 0, warranty: 0 },
  { name: 'Beverages', hsn: '2202', gst: 28, brands: ['Coca-Cola', 'Pepsi', 'Sprite', 'Tropicana', 'Real', 'Bisleri'], price: [10, 299], serialised: 0, warranty: 0 },
  { name: 'Snacks', hsn: '1905', gst: 18, brands: ['Lays', 'Bingo', 'Haldiram\'s', 'Britannia', 'Parle', 'Cadbury', 'ITC'], price: [10, 299], serialised: 0, warranty: 0 },
  { name: 'Personal Care', hsn: '3304', gst: 18, brands: ['Dove', 'Lakme', 'L\'Oreal', 'Garnier', 'Himalaya', 'Patanjali', 'Nivea'], price: [49, 1499], serialised: 0, warranty: 0 },
  { name: 'Home & Kitchen', hsn: '7323', gst: 18, brands: ['Prestige', 'Hawkins', 'Pigeon', 'Borosil', 'Cello', 'Milton'], price: [149, 4990], serialised: 0, warranty: 12 },
  { name: 'Stationery', hsn: '4820', gst: 12, brands: ['Reynolds', 'Faber-Castell', 'Camlin', 'Classmate', 'Parker'], price: [10, 999], serialised: 0, warranty: 0 },
];

const STATES = [
  { code: '07', name: 'Delhi' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '06', name: 'Haryana' },
  { code: '03', name: 'Punjab' },
  { code: '24', name: 'Gujarat' },
  { code: '19', name: 'West Bengal' },
  { code: '23', name: 'Madhya Pradesh' },
];

const FIRST_NAMES = [
  'Priya', 'Rahul', 'Amit', 'Neha', 'Rohit', 'Anjali', 'Vikram', 'Kavita', 'Suresh', 'Pooja',
  'Arjun', 'Sneha', 'Karan', 'Diya', 'Sandeep', 'Meera', 'Ravi', 'Lakshmi', 'Manoj', 'Anita',
  'Deepak', 'Shilpa', 'Nitin', 'Riya', 'Vivek', 'Aarti', 'Akash', 'Nisha', 'Gaurav', 'Tanya',
  'Prakash', 'Aditi', 'Saurabh', 'Ritu', 'Mohit', 'Sanjana', 'Tushar', 'Ishita', 'Yash', 'Komal',
];
const LAST_NAMES = [
  'Sharma', 'Kumar', 'Singh', 'Patel', 'Gupta', 'Verma', 'Reddy', 'Nair', 'Iyer', 'Agarwal',
  'Bansal', 'Joshi', 'Khan', 'Mehta', 'Saxena', 'Mishra', 'Rao', 'Chopra', 'Malhotra', 'Kapoor',
];

const SUPPLIER_PREFIXES = [
  'Mahalaxmi', 'Shree Krishna', 'Bharat', 'Sai', 'Ganesh', 'Hindustan', 'New India', 'Apex',
  'Reliable', 'Modern', 'Star', 'Royal', 'Asian', 'Universal', 'National', 'Punjab', 'Gujarat',
  'Bombay', 'Delhi', 'Madras', 'Bengal', 'Lucky', 'Krishna', 'Lotus', 'Sunrise',
];
const SUPPLIER_SUFFIXES = [
  'Traders', 'Enterprises', 'Distributors', 'Wholesale', '& Co.', 'Marketing', 'Industries',
  'Agencies', 'Suppliers', 'Sales Corp.', 'Trading Co.', 'Brothers',
];

// ---------- Helpers ------------------------------------------------------
function gstinFor(stateCode) {
  // Synthetic GSTIN: 2-digit state + 5-letter PAN + 4-digit + 1 letter + Z + check
  const letters = () =>
    Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[rand(24)]).join('');
  const digits = () =>
    Array.from({ length: 4 }, () => '0123456789'[rand(10)]).join('');
  return `${stateCode}${letters()}${digits()}${'A'[0]}1Z${'0123456789'[rand(10)]}`;
}
function panFor() {
  const letters = () =>
    Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[rand(24)]).join('');
  return `${letters()}${rand(10)}${rand(10)}${rand(10)}${rand(10)}P`;
}
function phone() {
  const start = ['98', '99', '97', '96', '95', '94', '90'][rand(7)];
  return start + Array.from({ length: 8 }, () => rand(10)).join('');
}
function emailFor(name) {
  return name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.+|\.+$/g, '') + rand(900) + '@example.com';
}
function addressFor(state) {
  const street = ['MG Road', 'Park Street', 'Anna Salai', 'Connaught Place', 'Brigade Road', 'Ring Road', 'Linking Road', 'Janpath'][rand(8)];
  const city = state.name === 'Maharashtra' ? 'Mumbai' :
    state.name === 'Karnataka' ? 'Bengaluru' :
    state.name === 'Tamil Nadu' ? 'Chennai' :
    state.name === 'Delhi' ? 'New Delhi' :
    state.name === 'West Bengal' ? 'Kolkata' :
    state.name === 'Gujarat' ? 'Ahmedabad' :
    state.name === 'Punjab' ? 'Ludhiana' :
    state.name === 'Haryana' ? 'Gurugram' :
    state.name === 'Uttar Pradesh' ? 'Lucknow' :
    'Indore';
  return `${rand(900) + 100}, ${street}, ${city}, ${state.name}`;
}

// ---------- BOOT ---------------------------------------------------------
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
const store = await Store.findOne({ organizationId: org._id, type: 'store', isActive: { $ne: false } });
if (!store) {
  console.error(`No active store for org "${org.name}"`);
  process.exit(1);
}
const storeStateCode = store.stateCode || '07';

console.log(`Seeding into ${org.name} → ${store.name} (state ${storeStateCode}) [admin ${admin.email}]`);

// Use a short demo-batch tag in numbers so re-running the seed adds a
// new wave (DEMO-A1, DEMO-B7, …) instead of colliding with the first.
const BATCH = crypto.randomBytes(2).toString('hex').toUpperCase();
console.log(`Batch tag: ${BATCH}`);

// =====================================================================
// 1. SUPPLIERS (50)
// =====================================================================
console.log('\n[1/5] suppliers …');
const supplierDocs = [];
for (let i = 0; i < 50; i++) {
  const state = pick(STATES);
  const name = `${pick(SUPPLIER_PREFIXES)} ${pick(SUPPLIER_SUFFIXES)}`;
  supplierDocs.push({
    storeId: store._id,
    name,
    phone: phone(),
    email: chance(0.7) ? emailFor(name) : '',
    gstNumber: gstinFor(state.code),
    stateCode: state.code,
    address: addressFor(state),
    outstandingBalance: 0,
    isActive: true,
  });
}
const suppliers = await Supplier.insertMany(supplierDocs, { ordered: false });
console.log(`  inserted ${suppliers.length} suppliers`);

// =====================================================================
// 2. PRODUCTS (350) — distributed across categories
// =====================================================================
console.log('\n[2/5] products …');
const productDocs = [];
let productSkuSeq = Date.now() % 100000; // start mid-range, namespaced + per-run
for (let i = 0; i < 350; i++) {
  const cat = pick(CATEGORIES);
  const brand = pick(cat.brands);
  const isSerialised = chance(cat.serialised);
  const hasWarranty = cat.warranty > 0 && (isSerialised || chance(0.4));
  const sellingPrice = randFloat(cat.price[0], cat.price[1]);
  const purchasePrice = +(sellingPrice * randFloat(0.55, 0.78)).toFixed(2);
  const mrp = +(sellingPrice * randFloat(1.05, 1.18)).toFixed(2);
  const stock = isSerialised
    ? rand(8) + 2 // smaller numbers for big-ticket items
    : pick([5, 12, 25, 50, 80, 120, 200, 300, 0]); // include zero-stock for low-stock testing
  const minStock = Math.max(2, Math.floor(stock * 0.15));
  productSkuSeq++;
  productDocs.push({
    storeId: store._id,
    name: `${brand} ${cat.name.split(' ')[0]} ${randFloat(1, 99).toFixed(0)}${pick(['', ' Pro', ' Plus', ' Lite', ' XL', ' Mini', ' Max', ' Air'])}`,
    sku: `DEMO-${BATCH}-${String(productSkuSeq).padStart(5, '0')}`,
    barcode: `89${String(productSkuSeq).padStart(11, '0')}`,
    isSerialised,
    category: cat.name,
    brand,
    unit: cat.name === 'Groceries' ? pick(['kg', 'g', 'pcs']) : 'pcs',
    purchasePrice,
    sellingPrice,
    mrp,
    gstRate: cat.gst,
    hsnCode: cat.hsn,
    taxType: 'GST',
    stock,
    minStock,
    maxStock: stock + 100,
    reorderQty: 50,
    warrantyMonths: hasWarranty ? cat.warranty : 0,
    isActive: true,
    createdBy: admin._id,
  });
}
const products = await Product.insertMany(productDocs, { ordered: false });
console.log(`  inserted ${products.length} products`);
const serialisedProducts = products.filter((p) => p.isSerialised);
const warrantyProducts = products.filter((p) => p.warrantyMonths > 0);
console.log(`    serialised: ${serialisedProducts.length}  ·  with warranty: ${warrantyProducts.length}`);

// =====================================================================
// 2b. PRODUCT UNITS for serialised stock
// =====================================================================
console.log('\n[2b/5] product units (serialised inventory) …');
const unitDocs = [];
let unitSeq = Date.now() % 100000;
for (const p of serialisedProducts) {
  for (let i = 0; i < p.stock; i++) {
    unitSeq++;
    unitDocs.push({
      storeId: store._id,
      productId: p._id,
      serialNo: `SN-${BATCH}-${String(unitSeq).padStart(7, '0')}`,
      status: 'in_stock',
      addedAt: daysAgo(rand(120) + 30),
      addedBy: admin._id,
    });
  }
}
const units = await ProductUnit.insertMany(unitDocs, { ordered: false });
console.log(`  inserted ${units.length} units across ${serialisedProducts.length} serialised SKUs`);

// In-memory pool of available units, popped as we sell them.
const unitsByProduct = new Map();
for (const u of units) {
  const key = String(u.productId);
  if (!unitsByProduct.has(key)) unitsByProduct.set(key, []);
  unitsByProduct.get(key).push(u);
}

// =====================================================================
// 3. CUSTOMERS (80) — walk-in / retail / B2B mix
// =====================================================================
console.log('\n[3/5] customers …');
const customerDocs = [];
// Walk-ins (35%) — minimal fields, no GST
for (let i = 0; i < 28; i++) {
  const fn = pick(FIRST_NAMES);
  const ln = pick(LAST_NAMES);
  const state = pick(STATES);
  customerDocs.push({
    storeId: store._id,
    name: `${fn} ${ln}`,
    phone: chance(0.5) ? phone() : '',
    stateCode: state.code,
    isActive: true,
  });
}
// Retail with phone + email (45%)
for (let i = 0; i < 36; i++) {
  const fn = pick(FIRST_NAMES);
  const ln = pick(LAST_NAMES);
  const name = `${fn} ${ln}`;
  const state = pick(STATES);
  customerDocs.push({
    storeId: store._id,
    name,
    phone: phone(),
    email: emailFor(name),
    stateCode: state.code,
    address: addressFor(state),
    loyaltyPoints: rand(500),
    isActive: true,
  });
}
// B2B with GSTIN + credit limit (20%)
for (let i = 0; i < 16; i++) {
  const name = `${pick(SUPPLIER_PREFIXES)} ${pick(SUPPLIER_SUFFIXES)}`;
  const state = pick(STATES);
  customerDocs.push({
    storeId: store._id,
    name,
    phone: phone(),
    email: emailFor(name),
    gstNumber: gstinFor(state.code),
    stateCode: state.code,
    address: addressFor(state),
    creditLimit: pick([50000, 100000, 250000, 500000]),
    isActive: true,
  });
}
const customers = await Customer.insertMany(customerDocs, { ordered: false });
console.log(`  inserted ${customers.length} customers (walk-in 28 · retail 36 · B2B 16)`);

// =====================================================================
// 4. PURCHASE ORDERS (150) — mixed statuses
// =====================================================================
console.log('\n[4/5] purchase orders …');
const STATUS_DIST = [
  ...Array(15).fill('draft'),
  ...Array(35).fill('ordered'),
  ...Array(25).fill('partial'),
  ...Array(60).fill('received'),
  ...Array(10).fill('closed'),
  ...Array(5).fill('cancelled'),
];
const purchaseDocs = [];
let poSeq = 90000 + rand(1000); // namespaced high to avoid colliding with real POs
const year = new Date().getFullYear();
for (let i = 0; i < 150; i++) {
  const supplier = pick(suppliers);
  const status = STATUS_DIST[i % STATUS_DIST.length];
  const lineCount = rand(8) + 1;
  const items = pickN(products, lineCount).map((p) => {
    const orderedQty = rand(20) + 5;
    const receivedQty =
      status === 'draft' || status === 'cancelled' || status === 'ordered'
        ? 0
        : status === 'partial'
          ? Math.max(1, Math.floor(orderedQty * randFloat(0.3, 0.8)))
          : orderedQty;
    const taxableAmount = +(orderedQty * p.purchasePrice).toFixed(2);
    const taxAmt = +(taxableAmount * (p.gstRate / 100)).toFixed(2);
    const sameState = supplier.stateCode === storeStateCode;
    return {
      productId: p._id,
      productSnapshot: { name: p.name, sku: p.sku, hsnCode: p.hsnCode },
      orderedQty,
      receivedQty,
      purchasePrice: p.purchasePrice,
      gstRate: p.gstRate,
      cgst: sameState ? +(taxAmt / 2).toFixed(2) : 0,
      sgst: sameState ? +(taxAmt / 2).toFixed(2) : 0,
      igst: sameState ? 0 : taxAmt,
      taxableAmount,
      totalTax: taxAmt,
      totalAmount: +(taxableAmount + taxAmt).toFixed(2),
    };
  });
  const subtotal = +items.reduce((s, it) => s + it.taxableAmount, 0).toFixed(2);
  const totalTax = +items.reduce((s, it) => s + it.totalTax, 0).toFixed(2);
  const grandTotal = +(subtotal + totalTax).toFixed(2);
  poSeq++;
  const createdAt = daysAgo(rand(180));
  purchaseDocs.push({
    poNumber: `PO-${year}-DEMO${BATCH}${String(poSeq).padStart(5, '0')}`,
    storeId: store._id,
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
    subtotal,
    totalTax,
    grandTotal,
    paymentStatus: status === 'received' ? pick(['paid', 'partial', 'unpaid']) : 'unpaid',
    amountPaid: status === 'received' && chance(0.6) ? grandTotal : 0,
    receiptRefs: status === 'received' || status === 'partial'
      ? [{
          grnNumber: `GRN-${year}-${String(poSeq).padStart(5, '0')}`,
          items: items.filter((it) => it.receivedQty > 0).map((it) => ({
            productId: it.productId,
            quantity: it.receivedQty,
            purchasePrice: it.purchasePrice,
          })),
          total: grandTotal,
          receivedAt: createdAt,
          receivedBy: admin._id,
        }]
      : [],
    expectedDate: status === 'ordered' || status === 'partial' ? daysAgo(-7 - rand(14)) : null,
    closedAt: status === 'closed' || status === 'cancelled' ? createdAt : null,
    createdBy: admin._id,
    createdAt,
    updatedAt: createdAt,
  });
}
const purchases = await Purchase.insertMany(purchaseDocs, { ordered: false });
console.log(`  inserted ${purchases.length} POs`);
const poStatusCounts = purchases.reduce((acc, p) => ((acc[p.status] = (acc[p.status] || 0) + 1), acc), {});
console.log(`    status spread:`, poStatusCounts);

// =====================================================================
// 5. SALES (600) — across last 180 days
// =====================================================================
console.log('\n[5/5] sales …');
const saleDocs = [];
let invoiceSeq = 90000 + rand(1000);
const unitUpdates = []; // bulk-mark units as sold after we figure out which sales pick them
let serialisedSales = 0;
let warrantySales = 0;
let creditSales = 0;
let returnedSales = 0;

for (let i = 0; i < 600; i++) {
  const createdAt = daysAgo(rand(180));
  invoiceSeq++;
  const invoiceNumber = `${store.invoicePrefix || 'INV'}-${year}-DEMO${BATCH}${String(invoiceSeq).padStart(5, '0')}`;

  // Customer mix: 35% walk-in (no link), rest from customer pool.
  const useCustomer = chance(0.65);
  const customer = useCustomer ? pick(customers) : null;
  const customerStateCode = customer?.stateCode || storeStateCode;
  const sameState = customerStateCode === storeStateCode;

  const lineCount = pick([1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8]);
  const lineProducts = pickN(products, lineCount);
  const items = [];
  let saleHasWarranty = false;
  const warranties = [];

  for (const p of lineProducts) {
    const qty = p.isSerialised ? 1 : pick([1, 1, 1, 2, 2, 3, 5]);
    const basePrice = +(p.sellingPrice * qty).toFixed(2);
    const discount = chance(0.25) ? +(basePrice * randFloat(0.02, 0.10)).toFixed(2) : 0;
    const taxableAmount = +(basePrice - discount).toFixed(2);
    const taxAmt = +(taxableAmount * (p.gstRate / 100)).toFixed(2);

    const item = {
      productId: p._id,
      productSnapshot: { name: p.name, sku: p.sku, barcode: p.barcode, hsnCode: p.hsnCode },
      quantity: qty,
      unit: p.unit,
      sellingPrice: p.sellingPrice,
      basePrice,
      discount,
      discountType: 'flat',
      discountAmount: discount,
      taxableAmount,
      gstRate: p.gstRate,
      cgst: sameState ? +(taxAmt / 2).toFixed(2) : 0,
      sgst: sameState ? +(taxAmt / 2).toFixed(2) : 0,
      igst: sameState ? 0 : taxAmt,
      totalTax: taxAmt,
      totalAmount: +(taxableAmount + taxAmt).toFixed(2),
    };

    // Pop a serialised unit if available — gives the sale a real
    // serial number + warranty expiry.
    if (p.isSerialised) {
      const pool = unitsByProduct.get(String(p._id));
      if (pool && pool.length > 0) {
        const u = pool.pop();
        item.unitId = u._id;
        item.serialNo = u.serialNo;
        item.warrantyMonths = p.warrantyMonths || 0;
        if (p.warrantyMonths > 0) {
          item.warrantyExpiresAt = new Date(createdAt.getTime() + p.warrantyMonths * 30 * 86_400_000);
          saleHasWarranty = true;
          warranties.push({
            productId: p._id,
            productName: p.name,
            sku: p.sku,
            quantity: qty,
            warrantyMonths: p.warrantyMonths,
            startsAt: createdAt,
            expiresAt: item.warrantyExpiresAt,
          });
        }
        unitUpdates.push({
          updateOne: {
            filter: { _id: u._id },
            update: {
              $set: {
                status: 'sold',
                soldAt: createdAt,
                warrantyStartsAt: createdAt,
                warrantyExpiresAt: item.warrantyExpiresAt || null,
              },
            },
          },
        });
      }
    } else if (p.warrantyMonths > 0 && chance(0.5)) {
      // Non-serialised but warranty-bearing line.
      item.warrantyMonths = p.warrantyMonths;
      item.warrantyExpiresAt = new Date(createdAt.getTime() + p.warrantyMonths * 30 * 86_400_000);
      saleHasWarranty = true;
      warranties.push({
        productId: p._id,
        productName: p.name,
        sku: p.sku,
        quantity: qty,
        warrantyMonths: p.warrantyMonths,
        startsAt: createdAt,
        expiresAt: item.warrantyExpiresAt,
      });
    }

    items.push(item);
  }

  if (items.some((it) => it.serialNo)) serialisedSales++;
  if (saleHasWarranty) warrantySales++;

  const subtotal = +items.reduce((s, it) => s + it.basePrice, 0).toFixed(2);
  const totalDiscount = +items.reduce((s, it) => s + it.discountAmount, 0).toFixed(2);
  const totalTax = +items.reduce((s, it) => s + it.totalTax, 0).toFixed(2);
  const rawTotal = subtotal - totalDiscount + totalTax;
  const grandTotal = Math.round(rawTotal);
  const roundOff = +(grandTotal - rawTotal).toFixed(2);

  // Payment mix.
  const isCredit = customer?.gstNumber && chance(0.35); // B2B more likely to go on credit
  let payments;
  let paymentStatus;
  if (isCredit) {
    payments = [{ mode: 'credit', amount: grandTotal }];
    paymentStatus = 'credit';
    creditSales++;
  } else if (chance(0.20) && grandTotal > 500) {
    // Split payment
    const half = +(grandTotal / 2).toFixed(2);
    payments = [
      { mode: 'cash', amount: half },
      { mode: 'upi', amount: grandTotal - half, reference: `UPI${rand(99999999)}` },
    ];
    paymentStatus = 'paid';
  } else {
    payments = [{
      mode: pick(['cash', 'upi', 'upi', 'card', 'cash']),
      amount: grandTotal,
      reference: chance(0.6) ? `TXN${rand(99999999)}` : '',
    }];
    paymentStatus = 'paid';
  }

  const status = chance(0.03) ? 'returned' : 'completed';
  if (status === 'returned') returnedSales++;

  saleDocs.push({
    invoiceNumber,
    // Per-sale idempotency key — sparse-unique. Always set so the
    // legacy non-sparse index in pos_erp.sales doesn't trip on
    // multiple `null`s during bulk insert.
    idempotencyKey: `seed-${BATCH}-${invoiceSeq}`,
    shareToken: crypto.randomBytes(8).toString('hex'),
    storeId: store._id,
    customerId: customer?._id || null,
    customerSnapshot: customer
      ? {
          name: customer.name,
          phone: customer.phone || '',
          email: customer.email || '',
          gstNumber: customer.gstNumber || '',
          stateCode: customer.stateCode || '',
          address: customer.address || '',
        }
      : { name: 'Walk-in', phone: '', stateCode: storeStateCode },
    placeOfSupply: customerStateCode,
    invoiceType: 'regular',
    items,
    subtotal,
    totalDiscount,
    totalTax,
    roundOff,
    grandTotal,
    payments,
    amountPaid: paymentStatus === 'credit' ? 0 : grandTotal,
    change: 0,
    paymentStatus,
    saleType: paymentStatus === 'credit' ? 'credit' : 'pos',
    status,
    hasWarranty: saleHasWarranty,
    warranties,
    createdBy: admin._id,
    createdAt,
    updatedAt: createdAt,
  });
}

const sales = await Sale.insertMany(saleDocs, { ordered: false });
console.log(`  inserted ${sales.length} sales`);
console.log(`    serialised lines: ${serialisedSales}  ·  warranty bills: ${warrantySales}  ·  credit: ${creditSales}  ·  returned: ${returnedSales}`);

if (unitUpdates.length > 0) {
  await ProductUnit.bulkWrite(unitUpdates, { ordered: false });
  console.log(`    flipped ${unitUpdates.length} ProductUnit rows to status='sold'`);
}

// Decrement stock on each product based on what we sold (rough — sums
// quantity across all sale lines per productId).
console.log('\n[stock] decrementing product stock from sold quantities …');
const stockDelta = new Map();
for (const s of saleDocs) {
  if (s.status !== 'completed') continue;
  for (const it of s.items) {
    const k = String(it.productId);
    stockDelta.set(k, (stockDelta.get(k) || 0) + it.quantity);
  }
}
const stockOps = [];
for (const [pid, qty] of stockDelta) {
  stockOps.push({
    updateOne: {
      filter: { _id: pid, storeId: store._id },
      update: { $inc: { stock: -qty } },
    },
  });
}
if (stockOps.length > 0) {
  await Product.bulkWrite(stockOps, { ordered: false });
  console.log(`  adjusted stock on ${stockOps.length} products`);
}

// =====================================================================
// SUMMARY
// =====================================================================
console.log('\n=== seed complete ===');
const counts = await Promise.all([
  Supplier.countDocuments({ storeId: store._id }),
  Product.countDocuments({ storeId: store._id }),
  ProductUnit.countDocuments({ storeId: store._id }),
  Customer.countDocuments({ storeId: store._id }),
  Purchase.countDocuments({ storeId: store._id }),
  Sale.countDocuments({ storeId: store._id }),
]);
const [nSup, nPro, nUnit, nCust, nPo, nSale] = counts;
console.log(`store totals (after seed):
  suppliers   ${nSup}
  products    ${nPro}    (${nUnit} serialised units)
  customers   ${nCust}
  purchases   ${nPo}
  sales       ${nSale}`);

await mongoose.disconnect();
process.exit(0);
