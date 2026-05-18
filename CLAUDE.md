# Retail POS + ERP System — Claude Code Build Guide

> **Project:** Complete Retail POS + ERP SaaS Platform for Indian SMB & Enterprise Retail
> **Repo target:** `retail-erp/` (monorepo)
> **Current phase:** Phase 1 — Wide MVP (Months 1–3)
> **Maintainer:** Mindmap Digital

---

## 0. How Claude Code should use this file

1. **Read this file first, in full, before editing any code.** It is the single source of truth.
2. **Never violate the five non-negotiables in §1.** They are the reason this system exists.
3. Before starting a new module, check §4 (folder structure) and §5 (module pattern) — every module follows the same shape.
4. When asked to implement something not in this file, **ask** before guessing.
5. After each session, update `docs/progress.md` with what was built, what's pending, and any deviations.

---

## 1. The Five Non-Negotiables

These are architectural laws. Break any of them and the system is broken.

1. **Atomicity First** — Every financial transaction is all-or-nothing. Always wrapped in a MongoDB session. If any step (sale save, stock deduct, ledger entry, GST record) fails, the *entire* transaction rolls back. No partial writes, ever.
2. **GST-Native, Item-Level** — Tax is computed per *line item*, not per invoice. HSN is mandatory. CGST/SGST/IGST split is determined by comparing `store.stateCode` with `customer.stateCode`.
3. **Double-Entry Ledger** — Every financial event creates equal debit and credit entries. `SUM(debits) === SUM(credits)` must hold at all times. Corrections are reversal entries, never edits.
4. **Immutable Financial Documents** — Sales, purchases, ledger entries, stock movements are *never* updated after creation. Corrections are new documents with `referenceId` linking back.
5. **Multi-Tenant by `storeId`** — Every query is scoped to `storeId` injected from the JWT at middleware level. A user cannot ever query another store's data, even by tampering with request params.

---

## 2. Product Summary (one-paragraph recap)

A cloud-first, offline-capable SaaS POS + ERP for Indian retail — positioned as a modern alternative to Tally/Marg. Combines transactional accounting accuracy with consumer-POS speed. Target: ₹999–₹4,999/month per store. Core modules: POS Billing, Inventory, Purchase, Customer, GST, Reports, Accounting Ledger. Built as a **Modular Monolith** in Phase 1 with clean module boundaries for Phase 2 microservices migration.

---

## 3. System Architecture

### 3.1 Layered view

```
CLIENT LAYER      →  React Web POS  │  Electron (Offline POS)  │  Mobile Owner App (Phase 3)
API GATEWAY       →  Express.js 5 ESM  │  Rate limit │ Auth │ CORS │ Request logging
APPLICATION LAYER →  Modules: auth, sales, inventory, purchase, accounting, gst, reports,
                      customers, suppliers  +  Event Bus (Node EventEmitter / Bull)
CORE ENGINES      →  Billing │ Inventory │ Ledger │ GST   (all transactions pass through)
DATA LAYER        →  MongoDB Atlas (primary)  │  Redis (cache + Bull queue)
INTEGRATIONS      →  WhatsApp │ Razorpay │ NIC GST │ SMS │ Email │ Thermal Printer │ S3
```

### 3.2 The Four Core Engines

Every business operation is channelled through these four engines. **All relevant engines run inside the same MongoDB session.**

| Engine | Responsibility | Critical rule |
|---|---|---|
| **Billing Engine** | Cart, pricing, discount, invoice generation | Validate stock before confirming; invoice numbers strictly sequential per store |
| **Inventory Engine** | Stock tracking, movement logging, validation | No negative stock (unless `allowNegativeStock=true`); every change creates a `StockMovement` record |
| **Ledger Engine** | Double-entry bookkeeping, auto journal entries | Debit must equal Credit; no manual overrides without audit entry |
| **GST Engine** | Item-level CGST/SGST/IGST, filing reports | Tax per item (not per bill); HSN mandatory for filing |

### 3.3 The canonical atomic transaction (sale)

This is the reference pattern every transactional service must follow:

```js
const session = await mongoose.startSession();
session.startTransaction();
try {
  await SaleModel.create([saleData], { session });       // 1. Save sale
  await decrementStock(items, session);                  // 2. Update inventory
  await createLedgerEntries(saleData, session);          // 3. Journal entries
  await updateGSTSummary(saleData, session);             // 4. GST records
  await session.commitTransaction();                     // COMMIT
  eventBus.emit('sale.created', saleData);               // Async: PDF, WhatsApp, reports
} catch (err) {
  await session.abortTransaction();                      // ROLLBACK EVERYTHING
  throw new TransactionError('Sale failed', err);
} finally {
  session.endSession();
}
```

### 3.4 Why Modular Monolith (not microservices) in Phase 1

Microservices need Saga pattern for distributed transactions — extremely complex for a financial system. A modular monolith gives us ACID via MongoDB sessions, 3–4x faster team velocity, and trivial deployment. Phase 2 migration is straightforward because module boundaries are already clean.

---

## 4. Repo / Folder Structure

```
retail-erp/
├── apps/
│   ├── api/                         # Node.js Express API
│   │   ├── src/
│   │   │   ├── modules/             # Feature modules (same shape each)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.controller.js
│   │   │   │   │   ├── auth.service.js
│   │   │   │   │   ├── auth.routes.js
│   │   │   │   │   └── auth.validators.js
│   │   │   │   ├── sales/
│   │   │   │   │   ├── sale.model.js
│   │   │   │   │   ├── sale.controller.js
│   │   │   │   │   ├── sale.service.js
│   │   │   │   │   ├── sale.routes.js
│   │   │   │   │   └── sale.validators.js
│   │   │   │   ├── inventory/
│   │   │   │   ├── purchase/
│   │   │   │   ├── accounting/
│   │   │   │   ├── gst/
│   │   │   │   ├── reports/
│   │   │   │   ├── customers/
│   │   │   │   └── suppliers/
│   │   │   ├── engines/             # Core business engines
│   │   │   │   ├── billing.engine.js
│   │   │   │   ├── inventory.engine.js
│   │   │   │   ├── ledger.engine.js
│   │   │   │   └── gst.engine.js
│   │   │   ├── shared/
│   │   │   │   ├── middleware/      # auth, rbac, rateLimit, auditLog
│   │   │   │   ├── utils/           # invoiceNumber, pdfGenerator, whatsapp
│   │   │   │   ├── events/eventBus.js
│   │   │   │   └── errors/          # AppError, errorHandler
│   │   │   ├── config/              # database, redis, env
│   │   │   └── app.js
│   │   └── package.json
│   ├── web/                         # React 18 + Vite + Tailwind
│   │   └── src/ { pages, components, store (Zustand), hooks, services }
│   └── electron/                    # Offline POS (Phase 2)
├── packages/
│   ├── shared-types/                # TypeScript types shared across apps
│   └── gst-utils/                   # GST calculation library (pure, testable)
├── infra/
│   ├── docker/
│   ├── k8s/
│   └── terraform/
└── docs/
    ├── architecture.md              # Deeper architecture notes
    ├── api.md                       # OpenAPI-generated docs
    └── progress.md                  # Session-by-session progress log (update each session)
```

---

## 5. Module Pattern (every module follows this)

Each feature module has five files, and the service layer is where atomic transactions live.

```js
// modules/sales/sale.service.js — CANONICAL SERVICE LAYER PATTERN
import { SaleModel } from './sale.model.js';
import { BillingEngine }   from '../../engines/billing.engine.js';
import { InventoryEngine } from '../../engines/inventory.engine.js';
import { LedgerEngine }    from '../../engines/ledger.engine.js';
import { GSTEngine }       from '../../engines/gst.engine.js';
import { eventBus } from '../../shared/events/eventBus.js';
import mongoose from 'mongoose';

export class SaleService {
  async createSale(saleInput, userId) {
    // 1. Pre-validate (before transaction opens)
    const calculated = BillingEngine.calculate(saleInput);
    await InventoryEngine.validateStock(calculated.items);

    // 2. Atomic transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const sale = await SaleModel.create([calculated], { session });
      await InventoryEngine.deductStock(calculated.items, sale._id, session);
      await LedgerEngine.recordSale(sale, session);
      await GSTEngine.recordSaleTax(sale, session);
      await session.commitTransaction();

      // 3. Async side effects (never inside the transaction)
      eventBus.emit('sale.created', sale);
      return sale;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}
```

**Rules every module must obey:**
- Controllers validate input (Joi/Zod), then call service. Controllers are thin.
- Services contain business logic and orchestrate engines inside transactions.
- Models are pure Mongoose schemas with indexes. No business logic in models.
- Validators are shared between controller and any internal caller.
- Side-effects (PDF, WhatsApp, reports) run via `eventBus`, never inside the transaction.

---

## 6. Database Schema (MongoDB)

### 6.0 Current persistence layer (Phase 1 dev bridge)

Phase 1 uses an **in-memory store with disk-backed JSON snapshots** (`server/store/memoryStore.js` + `server/store/persistence.js`) so developers can run the whole stack locally without Atlas. The layout intentionally mirrors what Mongoose + MongoDB will look like so the Phase 1.5 migration is a contained swap:

- **Shape** — every collection (`products`, `sales`, `purchases`, `ledgerEntries`, `stockMovements`, `vouchers`, `accounts`, `accountGroups`, …) is an array of plain objects with the Mongoose-style `_id` / `storeId` / `createdAt` fields. Snapshot data embedded at transaction time (product snapshot in sale, customer snapshot, supplier snapshot) is already correct.
- **Writes** — services call `helpers.save()` after each successful commit; persistence is debounced (250 ms) and written atomically via `tmp file + rename` to `data/store.json`. `SIGINT` / `SIGTERM` / `beforeExit` flush synchronously.
- **Transactions** — the Phase 1 "atomic" block uses a snapshot-and-restore pattern (`snapshotBackup()` / `restore()` in `sale.service.js`) that captures product stock, array lengths, and the invoice counter, then rolls them back on failure. This is semantically equivalent to Mongo's `session.abortTransaction()` for this single-process in-memory environment.
- **Migration path to MongoDB Atlas** — set `MONGODB_URI`, replace the in-memory collection arrays with Mongoose models that share the same shape, wrap the transactional block in `mongoose.startSession()` + `session.withTransaction()`, and delete `persistence.js`. Routes, engines, and the React frontend stay untouched.

> **Rule**: Never read or write `store.*` arrays from controllers or routes. Only services and engines may mutate state, and they must call `helpers.save()` (or `helpers.insert/update/remove`) after committing so the snapshot is flushed.

### 6.1 Design principles

- Denormalize selectively — embed **snapshot** data (product name, price, HSN at sale time). Masters can change; documents must not.
- Reference master data (`productId`, `customerId`, `supplierId`) by `ObjectId`.
- All financial docs are **immutable** — corrections = reversal entries.
- Every collection includes `storeId`, `createdBy`, `createdAt`, `updatedAt`.
- Compound indexes on common query patterns: `(storeId, createdAt)`, `(storeId, productId)`, etc.

### 6.2 Core collections

#### `users`
```js
{
  _id, name, email (unique), phone,
  password,                                  // bcrypt, work factor 12
  role: 'super_admin'|'admin'|'manager'|'cashier'|'accountant',
  storeIds: [ObjectId], primaryStoreId,
  permissions: { canDiscount, maxDiscountPct, canVoidSale,
                 canViewReports, canManageInventory },
  isActive, lastLogin, createdAt, updatedAt
}
// Indexes: { email: 1 }, { storeIds: 1, role: 1 }
```

#### `stores`
```js
{
  _id, name, code (unique, e.g. 'DEL-001'),
  address: { line1, line2, city, state, pincode },
  gstNumber, stateCode,                      // 2-digit, drives IGST logic
  phone, email, logoUrl,
  invoicePrefix, invoiceCounter,             // auto-increment per store
  settings: { allowNegativeStock, defaultGSTMode: 'inclusive'|'exclusive',
              printCopies, enableLoyalty, loyaltyRate },
  isActive, createdAt
}
```

#### `products`
```js
{
  _id, storeId, name, sku (unique/store), barcode (indexed),
  categoryId, brand,
  unit: 'pcs'|'kg'|'g'|'ltr'|'ml'|'box'|'dozen',
  purchasePrice, sellingPrice, mrp,
  gstRate: 0|5|12|18|28, hsnCode (required), sacCode,
  taxType: 'GST'|'IGST'|'Exempt',
  stock, minStock, maxStock, reorderQty,
  warrantyMonths,                            // 0 = no warranty; >0 triggers customer-info requirement on sale
  variants: [{ variantName, barcode, sellingPrice, stock }],
  batchTracking, expiryTracking, imageUrl,
  isActive, createdAt, updatedAt
}
// Indexes: { barcode: 1 }, { sku: 1, storeId: 1 }, { categoryId: 1 }, { stock: 1 }
```

#### `sales`  (POS invoices — immutable)
```js
{
  _id, invoiceNumber (unique, 'INV-2026-00001'),
  storeId, customerId?,
  customerSnapshot: { name, phone, gstNumber, address },   // denormalised
  items: [{
    productId, productSnapshot: { name, sku, hsnCode },    // immutable
    quantity, unit, basePrice,
    discount, discountType: 'flat'|'percent', discountAmount,
    taxableAmount, gstRate, cgst, sgst, igst, totalTax, totalAmount
  }],
  subtotal, totalDiscount, totalTax, roundOff, grandTotal,
  payments: [{ mode: 'cash'|'upi'|'card'|'credit'|'loyalty', amount, reference }],
  paymentStatus: 'paid'|'partial'|'credit',
  saleType: 'pos'|'order'|'credit',
  status: 'completed'|'returned'|'voided',
  shareToken,                                // unguessable string for public bill URL
  // --- Warranty ---
  hasWarranty,                               // true if any line has warrantyMonths > 0
  warranties: [{                             // frozen at sale time
    productId, productName, sku, quantity,
    warrantyMonths, startsAt, expiresAt
  }],
  returnRef, notes, createdBy, createdAt
}
// Indexes: { invoiceNumber: 1 }, { storeId: 1, createdAt: -1 }, { customerId: 1 },
//          { 'customerSnapshot.phone': 1, hasWarranty: 1 } // warranty lookup by phone
```

#### `purchases`
```js
{
  _id, poNumber (unique, 'PO-YYYY-00001'), storeId, supplierId,
  supplierSnapshot: { name, phone, gstNumber, stateCode, address },
  status: 'draft'|'ordered'|'partial'|'received'|'closed'|'cancelled',
  items: [{
    productId, productSnapshot: { name, sku, hsnCode },
    orderedQty, receivedQty, purchasePrice,
    gstRate, cgst, sgst, igst,
    batchNumber, expiryDate,
    taxableAmount, totalTax, totalAmount
  }],
  subtotal, totalDiscount, totalTax, grandTotal,
  paymentStatus: 'unpaid'|'partial'|'paid',
  amountPaid,
  receiptRefs: [{                                  // one entry per GRN
    grnNumber (unique, 'GRN-YYYY-00001'),
    items: [{ productId, quantity, purchasePrice, batchNumber, expiryDate }],
    total, receivedAt, receivedBy
  }],
  closedReason, closedAt,                          // set on pre-close / cancel
  dueDate, expectedDate, notes,
  createdBy, createdAt, updatedAt
}
// Indexes: { poNumber: 1 }, { storeId: 1, status: 1 }, { supplierId: 1, status: 1 }
```

#### `ledger_entries`  (IMMUTABLE)
```js
{
  _id, storeId,
  entryType: 'debit'|'credit',
  accountType: 'cash'|'bank'|'receivable'|'payable'|'revenue'|'expense'|'gst',
  accountId,                                // Customer | Supplier | BankAccount
  amount,                                   // always positive
  balance,                                  // running balance
  referenceType: 'sale'|'purchase'|'payment'|'adjustment'|'journal',
  referenceId,
  narration, isAutoGenerated,
  createdBy, createdAt                      // IMMUTABLE — never updated
}
// Indexes: { storeId: 1, accountType: 1, createdAt: -1 }
//          { referenceId: 1, referenceType: 1 }
```

#### `stock_movements`  (IMMUTABLE)
```js
{
  _id, storeId, productId,
  type: 'in'|'out'|'adjustment'|'transfer',
  quantity, previousStock, newStock,
  referenceType: 'sale'|'purchase'|'return'|'manual'|'transfer',
  referenceId, batchNumber, expiryDate,
  reason, createdBy, createdAt
}
```

#### `gst_reports`  (aggregated)
```js
{
  _id, storeId,
  period: '2026-03',                        // YYYY-MM
  reportType: 'GSTR1'|'GSTR3B',
  b2bSales:     [{ customerGSTIN, invoiceNumber, invoiceDate,
                   taxableValue, igst, cgst, sgst }],
  b2cSales:     [{ hsnCode, description, uqc, quantity,
                   taxableValue, igst, cgst, sgst }],
  purchaseITC:  [{ supplierGSTIN, invoiceNumber, taxableValue,
                   igst, cgst, sgst, eligibleITC }],
  summary:      { totalOutputGST, totalInputITC, netGSTPayable },
  status: 'draft'|'filed', generatedAt
}
```

### 6.3 Additional collections (Phase 1 & 2)

| Collection | Purpose |
|---|---|
| `categories` | Hierarchical (parentId) product categories |
| `customers` | Customer master with credit limit, outstanding, loyalty points |
| `suppliers` | Supplier profiles with outstanding balance |
| `bank_accounts` | Cash/bank accounts for multi-account tracking |
| `accountGroups` | Tally-style hierarchy: Assets / Liabilities / Income / Expenses, plus sub-groups (Current Assets, Capital Account, Direct Income, …) |
| `accounts` | Individual ledger accounts under a group, with opening balance |
| `vouchers` | Manual postings: `payment`, `receipt`, `journal`, `contra` — each voucher has ≥2 balanced entries |
| `payments` | Payment records linked to sales/purchases |
| `stock_alerts` | Low-stock notification log |
| `audit_logs` | Immutable log of all sensitive mutations (before/after diff) |
| `notifications` | System + user notification queue |
| `store_transfers` | Inter-store stock transfer records |
| `batches` | Batch/lot tracking for FMCG & pharma |

#### `accountGroups`
```js
{ _id, storeId, name, parentId,  // null for root groups
  nature: 'asset'|'liability'|'income'|'expense' }
```

#### `accounts`
```js
{ _id, storeId, name, groupId, openingBalance, createdAt }
// Indexes: { storeId: 1, groupId: 1 }
// Opening balances must be balanced across all accounts (Σ asset openings = Σ liability openings).
```

#### `vouchers`
```js
{
  _id, storeId,
  type: 'payment'|'receipt'|'journal'|'contra',
  voucherNumber: unique ('PMT-YYYY-00001' | 'RCT-…' | 'JV-…' | 'CON-…'),
  date, narration,
  entries: [{ accountId, accountName, entryType: 'debit'|'credit', amount }],
  totalAmount,              // Σ debits, which equals Σ credits
  createdBy, createdAt
}
// Invariant: Σ(debits) === Σ(credits) per voucher; posting is rejected if out of balance.
```

---

## 7. API Design

### 7.1 Conventions

- All routes prefixed `/api/v1/`.
- Response envelope (success):
  ```json
  { "success": true, "data": {...}, "meta": { "page", "limit", "total", "pages" }, "timestamp": "..." }
  ```
- Response envelope (error — RFC 7807 style):
  ```json
  { "success": false, "error": { "code": "STOCK_INSUFFICIENT", "message": "...", "details": {...} }, "timestamp": "..." }
  ```
- All list endpoints support **pagination, filtering, sorting**.
- All write endpoints return the created/updated document.
- All routes behind `authMiddleware` + `rbacMiddleware` + `scopeToStore` by default.

### 7.2 Catalogue (Phase 1 minimum)

**Auth & Users**
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/v1/auth/login` | JWT access (15 min) + refresh (30 days) |
| POST | `/api/v1/auth/refresh` | Rotate access token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |
| GET  | `/api/v1/auth/me` | Current user profile |
| GET/POST/PUT | `/api/v1/users` | User CRUD (admin only) |
| PUT | `/api/v1/users/:id/role` | Update role/permissions |

**POS & Sales**
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/v1/sales` | Atomic sale creation (accepts `customerInfo` for inline upsert, returns `shareToken`) |
| GET  | `/api/v1/sales` | Paginated, filterable |
| GET  | `/api/v1/sales/:id` | Full detail |
| GET  | `/api/v1/sales/warranties?phone=&activeOnly=` | Warranty register — per-line rows with expiry + status |
| GET  | `/api/v1/public/bill/:token` | **Public (no auth)** read-only bill lookup — customer-facing share URL backend |
| POST | `/api/v1/sales/:id/return` | Reversal entries |
| POST | `/api/v1/sales/:id/void` | Admin only, requires reason |
| GET  | `/api/v1/sales/:id/invoice` | PDF |
| POST | `/api/v1/sales/:id/whatsapp` | Send invoice via WhatsApp Cloud API (uses `store.whatsapp` credentials) |
| POST | `/api/v1/store/whatsapp/test` | Test WhatsApp credentials with a one-off message |
| POST | `/api/v1/pos/lookup` | Barcode/SKU lookup (Redis-first) |
| POST | `/api/v1/pos/calculate` | Compute cart totals with GST |

**Products & Inventory**
| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/v1/products` | List/create |
| GET/PUT/DELETE | `/api/v1/products/:id` | Get/update/deactivate (soft delete) |
| POST | `/api/v1/products/bulk-import` | Excel bulk import with validation |
| GET  | `/api/v1/inventory` | Current stock levels |
| POST | `/api/v1/inventory/adjust` | Manual adjustment + reason (creates StockMovement) |
| GET  | `/api/v1/inventory/movements/:productId` | History |
| GET  | `/api/v1/inventory/low-stock` | Below `minStock` |
| POST | `/api/v1/inventory/transfer` | Inter-store transfer |

**Purchases, Customers, Suppliers, Ledger, GST, Reports**
| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/v1/purchases` | PO list / create (status: `draft`\|`ordered`) |
| GET  | `/api/v1/purchases/:id` | PO detail |
| POST | `/api/v1/purchases/:id/submit` | Draft → ordered |
| POST | `/api/v1/purchases/:id/grn` | Goods Receipt Note — atomic stock-in + ledger post |
| POST | `/api/v1/purchases/:id/pay` | Record supplier payment (cash/bank/upi) |
| POST | `/api/v1/purchases/:id/pre-close` | Accept partial as final, forgive pending qty |
| POST | `/api/v1/purchases/:id/cancel` | Cancel (only if nothing received) |
| GET  | `/api/v1/purchases/outstanding/by-supplier` | Supplier-wise outstanding POs & value |
| GET  | `/api/v1/purchases/outstanding/by-item` | Item-wise pending quantities with PO refs |
| GET/POST/PUT | `/api/v1/customers` | Customer CRUD |
| GET  | `/api/v1/customers/:id/ledger` | Account statement |
| GET/POST/PUT | `/api/v1/suppliers` | Supplier CRUD |
| GET  | `/api/v1/suppliers/:id/ledger` | Supplier statement with running balance |
| GET  | `/api/v1/store/me` | Current user's store profile (name, address, GSTIN, **logoUrl**, invoicePrefix) |
| PUT  | `/api/v1/store/me` | Update store profile — logo, address, phone, GSTIN, invoice prefix |
| GET  | `/api/v1/ledger` | Filterable by account type |

**Accounting (Tally-grade)**
| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/v1/accounting/groups` | Account group tree (Assets/Liabilities/Income/Expense + sub-groups) |
| GET/POST | `/api/v1/accounting/accounts` | Chart of accounts — ledgers under a group |
| GET  | `/api/v1/accounting/accounts/:id/balance` | Opening + Dr + Cr → closing |
| GET/POST | `/api/v1/accounting/vouchers` | Manual payment/receipt/journal/contra (rejected if Dr ≠ Cr) |
| GET  | `/api/v1/accounting/trial-balance` | All accounts with running Dr/Cr; verifies Σ Dr = Σ Cr |
| GET  | `/api/v1/accounting/profit-loss` | Income − Expense = Net profit |
| GET  | `/api/v1/accounting/balance-sheet` | Assets vs Liab + Retained Earnings, balanced check |
| GET  | `/api/v1/accounting/cash-flow` | Net movement in cash/bank accounts, bucketed |
| GET  | `/api/v1/accounting/day-book` | Chronological ledger stream for a date range |
| POST | `/api/v1/accounting/bank-reconciliation` | Match uploaded statement against ledger |
| GET  | `/api/v1/gst/summary/:period` | Monthly summary |
| GET  | `/api/v1/gst/gstr1/:period` | GSTR-1 data |
| GET  | `/api/v1/gst/gstr3b/:period` | GSTR-3B data |
| GET  | `/api/v1/gst/export/:period` | JSON for GST portal |
| GET  | `/api/v1/reports/dashboard` | Real-time KPIs |
| GET  | `/api/v1/reports/sales` | Date range, filters |
| GET  | `/api/v1/reports/profit` | P&L with gross/net margin |
| GET  | `/api/v1/reports/stock-valuation` | Stock value at cost/MRP |

---

## 8. Core Business Logic

### 8.1 POS Billing Flow (exact sequence)

```
1. PRODUCT LOOKUP
   Scan barcode / SKU / name search
   → Redis cache (first) → MongoDB (fallback)
   → Validate: isActive, stock > 0

2. CART BUILD (per item)
   basePrice      = product.sellingPrice × quantity
   discountAmount = discountType === 'percent'
                    ? basePrice × discountPct / 100
                    : flatDiscount
   taxableAmount  = basePrice - discountAmount

3. GST CALCULATION (per item)
   isSameState = (store.stateCode === customer.stateCode)
   if isSameState:
     cgst = taxableAmount × (gstRate / 200)      // half of rate
     sgst = taxableAmount × (gstRate / 200)
     igst = 0
   else:
     cgst = 0;  sgst = 0
     igst = taxableAmount × (gstRate / 100)
   totalTax  = cgst + sgst + igst
   lineTotal = taxableAmount + totalTax

4. CART TOTALS
   subtotal    = Σ basePrice
   totalDisc   = Σ discountAmount
   totalTax    = Σ (cgst + sgst + igst)
   grandTotal  = subtotal - totalDisc + totalTax
   roundOff    = round(grandTotal) - grandTotal
   finalAmount = round(grandTotal)

5. PAYMENT COLLECTION
   Support split payment (cash + UPI / card + credit)
   Validate Σ(payments) >= grandTotal
   Calculate change if cash overpaid

6. ATOMIC TRANSACTION
   ├── Save Sale document
   ├── Reduce product.stock
   ├── Create StockMovement (type: 'out')
   ├── Ledger: Debit Cash/Bank, Credit Sales
   ├── Ledger: Debit GST Liability (output tax)
   └── If credit sale: Debit Customer Receivable

7. POST-TRANSACTION (async via eventBus / Bull)
   ├── Generate invoice PDF
   ├── Check low-stock alerts
   ├── Update daily report aggregates
   └── Send WhatsApp invoice (if enabled)
```

### 8.2 Purchase Flow

Status graph: `draft → ordered → (partial ⇄ ordered) → received` with side exits `→ cancelled` (no receipts) and `→ closed` (pre-close: accept partial as final, forgive pending qty).

```
1. CREATE PO        supplier + items + GST, sequential poNumber (PO-YYYY-00001)
                    status: 'draft' | 'ordered'  — no stock/ledger impact yet.

2. SUBMIT           draft → ordered (optional if created as 'ordered' directly).

3. GRN (can repeat) for each line, validate receivedQty + requested ≤ orderedQty.
                    Atomic block:
                      ├── product.stock += receivedQty                 (snapshot for rollback)
                      ├── StockMovement(type='in', ref=purchase)
                      ├── Ledger: Debit Purchase Expense (subtotal)
                      ├── Ledger: Debit Input GST Credit (totalTax)
                      ├── Ledger: Credit Supplier Payable (grandTotal)
                      ├── Supplier.outstandingBalance += grandTotal
                      ├── PO.receivedQty += quantity, receiptRefs.push(GRN-YYYY-00001)
                      └── PO.status = allReceived ? 'received' : 'partial'
                    On error, ALL of the above is rolled back
                    (snapshot/restore in `purchase.service.js::receiveGrn`).

4. PRE-CLOSE        Supplier cancelled or we accept the partial as final.
                    status → 'closed'. No further GRNs allowed.

5. CANCEL           Only from 'draft' or 'ordered' where receivedQty = 0 on every line.
                    status → 'cancelled'. No ledger impact since nothing was received.

6. PAYMENT          Ledger: Debit Supplier Payable, Credit Cash/Bank/UPI.
                    Supplier.outstandingBalance -= amount.
                    PO.amountPaid += amount, paymentStatus recomputed.
```

**Outstanding reports** (`/api/v1/purchases/outstanding/...`) aggregate `orderedQty - receivedQty` across open POs, groupable by supplier or by item — direct analog of Tally's "Order Outstanding by Supplier / by Item."

### 8.3 GST Engine rules

- **Intra-state supply** (same state): `CGST = taxable × rate/200`, `SGST = taxable × rate/200`
- **Inter-state supply** (different state / unregistered): `IGST = taxable × rate/100`
- **Exempt / zero-rated**: no tax calculation
- **Composite scheme**: store-level flag; simplified 1% tax

**GSTR-1 categories:**
- `B2B` — to GSTIN-registered (GSTIN required)
- `B2C Large` — unregistered, invoice > ₹2.5L (state-wise breakup)
- `B2C Small` — unregistered, invoice ≤ ₹2.5L (consolidated)
- `CDNR` — credit/debit notes to registered
- `CDNUR` — credit/debit notes to unregistered
- `HSN` — HSN-wise summary of all supplies

**GSTR-3B math:**
```
Output Tax Liability = Σ(all sale GST amounts)
Input Tax Credit     = Σ(all purchase GST amounts)
Net Payable          = Output - ITC     // if positive, pay
ITC Carry Forward    = |Net|            // if negative
```

### 8.4 Double-Entry Ledger — event → debit/credit map

| Event | Debit | Credit |
|---|---|---|
| POS Sale (cash) | Cash Account | Sales Revenue |
| POS Sale (UPI / card) | Bank Account | Sales Revenue |
| POS Sale (GST component) | — | Output GST Payable |
| Credit Sale | Sundry Debtors (Receivable) | Sales Revenue |
| Customer Payment Received | Cash / Bank | Sundry Debtors |
| Purchase GRN (subtotal) | Purchase Expense | Sundry Creditors |
| Purchase GRN (tax) | Input GST Credit | Sundry Creditors |
| Supplier Payment | Sundry Creditors | Cash / Bank |
| Sales Return | Sales Revenue (reversal) | Cash / Bank or Receivable |
| Manual Voucher (Journal) | any debit account | any credit account (Σ=Σ) |
| Opening Balance | Asset opening | Proprietor's Capital (counter-entry) |

### 8.4c WhatsApp Cloud API (automated send, configured in Settings)

When the store admin enters Meta Cloud API credentials in **Settings → WhatsApp**, the WhatsApp button flips from "open wa.me" mode to "send automatically". One click posts the bill directly to the customer's WhatsApp — no tap needed, no `wa.me` window, no cashier hand-off.

**Credentials stored on the store document** (`store.whatsapp`):

```js
{
  enabled: boolean,
  phoneNumberId: string,     // from Meta → WhatsApp → API Setup
  businessAccountId: string, // optional
  accessToken: string,       // NEVER returned in full — GET responds with "••••••••<last4>"
  apiVersion: 'v21.0',
  defaultCountryCode: '91',  // prepended to 10-digit customer numbers
  messageTemplate: '',       // optional — template name if outside 24-hour window
  templateLanguage: 'en',
}
```

**Security rules for the access token:**
- `GET /api/v1/store/me` replaces `accessToken` with `"••••••••<last4>"` (a mask). The full value never leaves the server.
- `PUT /api/v1/store/me` ignores incoming `accessToken` values that start with `•` — so sending the masked value back does NOT overwrite the stored secret. Only a fresh paste updates it.
- `store.whatsapp.configured: boolean` is added to the GET payload so the client can tell "API mode vs wa.me mode" without seeing the token itself.

**Send paths:**

| Action | Route | Payload |
|---|---|---|
| Send a sale to its customer | `POST /api/v1/sales/:id/whatsapp` | empty body (uses sale.customerSnapshot.phone + saved credentials); optional `{to, message, templateName, templateParams}` override |
| Test the credentials | `POST /api/v1/store/whatsapp/test` | `{to, message?}` |

Both call Meta's Graph API:
```
POST https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages
Authorization: Bearer ${accessToken}
```
and return Meta's `messages[0].id` on success.

**Message body:**
- If `messageTemplate` is empty → plain text with `preview_url: true`. Body is `buildInvoiceMessage(sale, store, publicBillUrl)` (customer name, invoice #, total, warranty note if applicable, share URL).
- If `messageTemplate` is set → template call with 4 ordered body params: `customer name`, `invoice number`, `₹<total>`, `bill URL`. Required for initiating conversations outside the 24-hour customer-service window.

**Audit trail:** every successful send appends to `sale.whatsappSends`:
```js
[{ to, messageId, sentAt, sentBy, method: 'text'|'template', templateName }]
```
immutable on failure (service throws before append).

**Error handling:** Meta's error body is surfaced as `WHATSAPP_API_ERROR` with details (`status`, `code`, `type`, `subcode`, `fbtrace_id`, `error_data`) so support can debug directly against Meta's logs.

**Phone normalisation:** `normalisePhone()` strips non-digits, removes `+`, prepends `defaultCountryCode` to 10-digit numbers (India default `91`). Rejects < 10 digits with `INVALID_PHONE`.

### 8.4b Free customer delivery (WhatsApp / Email / Link / QR)

Every sale now carries a `shareToken` — an unguessable string written at creation time and persisted forever with the sale. The token backs a **public, un-authenticated** read-only endpoint:

```
GET /api/v1/public/bill/:token   → { sale, store }   (strips createdBy + any PII not on the bill)
```

A corresponding public route `/bill/[token]` (outside `/dashboard/*`, no sidebar) renders the same `<InvoicePreview>` + Print 80mm / A4 buttons so the customer can open their bill on any device and save it as PDF via their browser's print dialog.

**Share surfaces** (all free, all client-driven):

| Channel | Mechanism | Requirement |
|---|---|---|
| WhatsApp | `https://wa.me/<phone>?text=<pre-filled message + link>` | Customer phone captured on the sale. One tap in the opened WhatsApp window. |
| Email | `mailto:<email>?subject=…&body=…` | Customer email captured. Uses the cashier's default mail client. |
| Copy link | `navigator.clipboard.writeText(url)` | Always available. |
| QR code | `QRCodeSVG` renders `url` inline so the customer can scan from the screen. | Works offline if both devices are on the same LAN with a reachable URL. |

Helpers live in `lib/share-invoice.ts`:
- `billShareUrl(token)` — resolves `NEXT_PUBLIC_APP_URL || window.location.origin + /bill/<token>`.
- `whatsappLink(sale, store)` — composes the wa.me URL (returns `null` if phone missing).
- `mailtoLink(sale, store)` — composes the mailto URL (returns `null` if email missing).
- `copyToClipboard(text)` — tiny async helper.

Paid channels (not built yet; opt-in):
- Server-side email via SMTP (Gmail app password free for ~500/day).
- WhatsApp Cloud API (Meta) for fully automated send — needs business verification.

### 8.5a Warranty flow

A product with `warrantyMonths > 0` is a warranty-bearing item. Anywhere one of those is on the cart, the sale cannot be rung up as "Walk-in" — customer identity must be captured so the warranty can be honored later.

```
1. INVENTORY        Product.warrantyMonths seeded on create/edit.
                    Inventory table shows a warranty badge; the product form
                    warns the operator when the value is > 0.

2. POS CART         As soon as any line has warrantyMonths > 0 the customer-info
                    card becomes mandatory: Name, Mobile, Address.
                    Optional fields: Email, GSTIN. The Save button is disabled
                    until all three required fields are filled.

3. SALE VALIDATION  Backend re-checks in sale.service.js::createSale:
                      ├── CUSTOMER_REQUIRED         (no name / walk-in customerId)
                      ├── CUSTOMER_PHONE_REQUIRED   (missing phone)
                      └── CUSTOMER_ADDRESS_REQUIRED (missing address)
                    Rejections carry a details.warrantyLines list so the UI
                    can tell the operator exactly which items forced the check.

4. CUSTOMER UPSERT  If a customer with the same storeId + phone already exists,
                    we reuse that record (and refresh name/address if changed).
                    Otherwise a new customer doc is created.
                    Keeps the customer master clean and enables the lookup.

5. SALE DOC         sale.hasWarranty = true.
                    sale.warranties = [{ productId, productName, sku, quantity,
                      warrantyMonths, startsAt: createdAt,
                      expiresAt: createdAt + warrantyMonths months }]
                    Each line item also carries warrantyExpiresAt for the invoice.

6. PRINTED BILL     The invoice is titled "TAX INVOICE (WARRANTY)" and carries
                    a dedicated WARRANTY block listing each warranty line with
                    its expiry date. Store logo (from Settings) is the branding —
                    never the Radsting SVG.

7. LOOKUP           /api/v1/sales/warranties?phone=... returns every warranty
                    row sold to that mobile, with `status: 'active' | 'expired'`.
                    Powers the /dashboard/warranties register.

8. SAVE & PRINT     POS has two buttons: "Save" and "Save & Print".
                    Save & Print posts the sale, waits for the response, then
                    auto-fires window.print() so the cashier never forgets to
                    print (and the bill is always saved before printing — the
                    print dialog is a view of a persisted document, not an
                    in-memory one).
```

### 8.5 Accounting statements (exact definitions)

- **Trial balance** — every ledger account with opening + Σ Dr + Σ Cr + closing. `Σ total Dr == Σ total Cr` is the sanity check; breakage means a non-balanced voucher slipped past validation.
- **Profit & Loss** — for each account:
  - income account: `Σ credits − Σ debits` contributes to income
  - expense account: `Σ debits − Σ credits` contributes to expense
  - `Net Profit = Σ Income − Σ Expense`. Loss if negative.
- **Balance sheet** — as of a cutoff date:
  - Assets: `opening + Σ Dr − Σ Cr` per asset account
  - Liabilities / Equity: `opening + Σ Cr − Σ Dr` per liability account
  - Retained Earnings = P&L Net Profit up to the same cutoff
  - Invariant: `Total Assets == Total Liabilities + Retained Earnings` (balanced).
- **Cash flow (simple)** — bucketizes debits and credits to cash/bank accounts by referenceType (`sale`, `payment`, `voucher`). Net cash flow = Σ all buckets.
- **Day book** — chronological ledger stream for a date range. Equivalent to Tally's Daybook.
- **Bank reconciliation** — naive amount-match (within ₹0.01) between book entries and an uploaded statement; returns `inBookNotInStatement`, `inStatementNotInBook`, `matchedCount`, so a user can clear items manually.

---

## 9. Security

### 9.1 Auth & RBAC

- JWT: **access token 15 min**, **refresh token 30 days**.
- Refresh tokens stored in Redis with device fingerprinting; **rotated on every use**.
- RBAC with per-user permission overrides.
- Multi-tenancy enforced at middleware: `storeId` injected from JWT, user cannot override via query/body.

```js
// RBAC middleware
export const requirePermission = (resource, action) => async (req, res, next) => {
  const { role, permissions } = req.user;
  const allowed = RBAC_MATRIX[role]?.[resource]?.includes(action)
                || permissions?.[`can${capitalize(action)}`];
  if (!allowed) throw new ForbiddenError(`${role} cannot ${action} ${resource}`);
  next();
};

// Store isolation middleware (runs after auth)
export const scopeToStore = (req, res, next) => {
  req.query.storeId = req.user.storeId;   // injected — user cannot override
  next();
};
```

### 9.2 RBAC Matrix

| Permission | Super Admin | Admin | Manager | Cashier | Accountant |
|---|---|---|---|---|---|
| Create/Void Sale | ✓ | ✓ | ✓ | ✓ (no void) | ✗ |
| Manage Products | ✓ | ✓ | ✓ | ✗ | ✗ |
| View Reports | ✓ | ✓ | ✓ | Basic | ✓ |
| Manage Users | ✓ | ✓ | ✗ | ✗ | ✗ |
| GST Reports | ✓ | ✓ | View only | ✗ | ✓ |
| Purchase Entry | ✓ | ✓ | ✓ | ✗ | View only |
| Accounting / Ledger | ✓ | ✓ | View only | ✗ | ✓ |
| Multi-store Config | ✓ | ✗ | ✗ | ✗ | ✗ |

### 9.3 Data security rules

- All data encrypted at rest (MongoDB Atlas AES-256).
- All API traffic TLS 1.3; HSTS headers enforced.
- Passwords: bcrypt work factor 12.
- PII (phone, email, address) encrypted at application level (field-level encryption).
- Rate limits: 100 req/min per IP; 20 auth attempts/hour; exponential backoff.
- Input validation via **Joi/Zod** on every endpoint — no raw input into queries.
- NoSQL injection prevention via Mongoose strict schemas + whitelist validators.

### 9.4 Audit logs

Immutable. Super-admin only can view. Never delete.
```js
{
  userId, userEmail, userRole,
  action: 'SALE_VOID'|'DISCOUNT_APPLIED'|'STOCK_ADJUST'|...,
  resourceType: 'sale'|'product'|'ledger', resourceId,
  before: {...}, after: {...},
  ipAddress, userAgent, storeId, timestamp
}
```

---

## 10. Performance & Caching

### 10.1 Performance targets (P95)

| Operation | Target | Max acceptable |
|---|---|---|
| Barcode product lookup | < 50ms | 100ms |
| Complete sale transaction | < 500ms | 1000ms |
| Invoice PDF generation | < 1s | 2s |
| Dashboard load (cached) | < 200ms | 500ms |
| Monthly GST report | < 3s | 8s |
| Stock report (10K products) | < 2s | 5s |

### 10.2 Redis cache strategy

- **Product master**: TTL 10 min; invalidated on product update
- **Barcode lookup**: TTL 5 min; pre-warm top 1000 SKUs at store open
- **GST rates**: TTL 24 hours
- **Dashboard KPIs**: TTL 5 min; background refresh via Bull
- **User session + permissions**: TTL 15 min; cleared on logout/role change

Cache-aside pattern (reference):
```js
async getProduct(barcode, storeId) {
  const key = `product:${storeId}:${barcode}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const product = await ProductModel.findOne({ barcode, storeId }).lean();
  if (product) await redis.setex(key, 600, JSON.stringify(product));
  return product;
}
```

### 10.3 Database optimization

- Compound indexes on all query patterns.
- Use Aggregation Pipeline for reports — never `.find().toArray()` into Node for large sets.
- Read preference `secondaryPreferred` for reports; **primary for all financial writes**.
- TTL index on `audit_logs` > 7 years.
- Atlas Search for product name (avoid regex).

### 10.4 Offline architecture (Electron — Phase 2)

- Local store: SQLite (Electron) / IndexedDB (PWA)
- Sync queue: offline transactions stored with UUID + timestamp
- On reconnect:
  1. Push pending transactions to server
  2. Server processes chronologically
  3. Conflict resolution:
     - Stock: server authority (may create negative-stock warning)
     - Invoice numbers: server assigns final sequential
     - Ledger: replayed chronologically
  4. Pull delta updates (products changed since last sync)

### 10.5 Scalability roadmap

| Phase | Architecture | Scale |
|---|---|---|
| 1 | Single Node + Atlas M10 + Redis | 50 stores, 500 concurrent users |
| 2 | PM2 cluster (8 workers) + Atlas M30 + Redis cluster | 500 stores, 5K users |
| 3 | K8s + read replicas + CDN | 5K stores, 50K users |
| 4 | Microservices (Billing, Inventory, Accounting, Reports) | Enterprise SaaS |

---

## 11. DevOps & CI/CD

### 11.1 GitHub Actions pipeline

```
TRIGGER: push to feature/* → PR to main → push to main

1. LINT & TYPE CHECK         ESLint + Prettier + tsc (shared-types)
2. UNIT TESTS                Jest — engines (billing, gst, ledger, inventory); coverage > 80%
3. INTEGRATION TESTS         MongoDB (test containers) + Redis; critical flows:
                             sale, purchase+stock, GST accuracy, return
4. SECURITY SCAN             npm audit (high), Snyk, OWASP ZAP on staging
5. BUILD & CONTAINERIZE      Docker multi-stage (api, web); push to ECR
6. DEPLOY STAGING            kubectl apply -f infra/k8s/staging/; smoke tests
7. DEPLOY PRODUCTION         (main only) Blue-green; health check /api/v1/health;
                             auto-rollback on failure within 60s
```

### 11.2 Environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection (secrets manager) |
| `REDIS_URL` | Redis (TLS in prod) |
| `JWT_SECRET` | HS256, min 256 bits, rotated quarterly |
| `JWT_REFRESH_SECRET` | Separate key |
| `WHATSAPP_API_KEY` | Meta Cloud API |
| `GST_PORTAL_CLIENT_ID` | NIC GST API OAuth |
| `SMTP_HOST` / `SMTP_KEY` | SES or Mailgun |
| `S3_BUCKET` | Invoices, media, backups |
| `SENTRY_DSN` | Error tracking |

### 11.3 Production infra (AWS)

```
ALB → ECS Fargate
        ├── API service (2–8 tasks, auto-scale)
        └── Worker service (Bull queue processor)
Data:  MongoDB Atlas M30 (multi-AZ) │ ElastiCache Redis (3 shards) │ S3
CDN:   CloudFront
Obs:   CloudWatch + Datadog APM + Sentry
Sec:   AWS Secrets Manager (auto-rotated)
Bkp:   Atlas automated (7d) │ S3 lifecycle: 30d Standard → Glacier at 90d
```

---

## 12. Logging, Monitoring, Errors

- **Winston** structured JSON logging (never `console.log` in prod).
- Log levels: error / warn / info / debug.
- Every API request logged: method, path, status, duration, userId, storeId, traceId.
- All financial transactions logged at INFO with transaction ID.
- Ship to CloudWatch / Datadog.

Global error handler pattern:
```js
export const errorHandler = (err, req, res, next) => {
  const traceId = req.headers['x-trace-id'] || nanoid();
  logger.error('unhandled_error', {
    traceId, name: err.name, message: err.message, stack: err.stack,
    userId: req.user?.id, path: req.path, body: sanitize(req.body),
  });
  Sentry.captureException(err, { extra: { traceId } });
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status < 500 ? err.message : 'Something went wrong',
      traceId,
    }
  });
};
```

**Alerts:**
- CRITICAL: unhandled exception in billing/ledger engine → PagerDuty immediate
- HIGH: API error rate > 1% over 5 min → Slack
- HIGH: MongoDB connection pool exhausted → auto-scale + alert
- MEDIUM: P95 > 1s for `/api/v1/sales` → perf investigation
- INFO: low-stock threshold crossed → notification queue

---

## 13. Integrations

| Integration | Provider | Trigger | Priority |
|---|---|---|---|
| WhatsApp Invoice | Meta Cloud API / Twilio | Post-sale | P1 |
| Payment Gateway | Razorpay / Cashfree | POS checkout | P1 |
| GST E-Invoice | NIC IRP API | B2B sale, turnover > ₹5Cr | P1 |
| Thermal Printer | ESC/POS | Receipt printing | P1 |
| E-Way Bill | NIC EWB API | Goods movement > ₹50K | P2 |
| SMS | MSG91 / Twilio | Reminders, alerts | P2 |
| Email | AWS SES / Mailgun | Invoices, reports, OTP | P2 |
| Barcode Printer | ZPL (Zebra) | Label generation | P2 |
| Tally Export | XML/CSV | Accounting sync | P3 |
| Shopify / WooCommerce | REST webhooks | Online order sync | P3 |

WhatsApp reference:
```js
export async function sendInvoiceWhatsApp(sale, customerPhone) {
  const pdfUrl = await uploadInvoicePDF(sale);
  await axios.post('https://graph.facebook.com/v18.0/.../messages', {
    messaging_product: 'whatsapp',
    to: customerPhone,
    type: 'document',
    document: {
      link: pdfUrl,
      filename: `Invoice-${sale.invoiceNumber}.pdf`,
      caption: `Your invoice from ${sale.store.name} | Amount: ₹${sale.grandTotal}`
    }
  }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
}
```

---

## 14. Enterprise-Grade Extras (Phase 2–4 but plan for them now)

- **DPDP Act 2023 compliance** — consent management, deletion workflows, India-region data localization
- **7-year financial retention** with cold-storage archival
- **Disaster recovery**: RPO 1h / RTO 4h; documented + tested restore runbook
- **Feature flags** (LaunchDarkly or Redis-backed) — per-store, per-tier feature gates
- **Multi-tenancy billing**: Razorpay subscriptions, usage metering, dunning, trial periods
- **Background jobs**: Bull for PDF/WhatsApp/email/reports; cron for nightly sync, monthly GST, low-stock digests
- **Search**: Atlas Search (Lucene) for product fuzzy search; autocomplete < 50ms; phonetic for Indian names
- **Reporting pipeline**: Atlas Analytics Node or ClickHouse for heavy reports; pre-aggregated summary collections via change streams
- **API docs**: OpenAPI 3.0 auto-generated; Postman collection published
- **Webhooks**: signed payloads for `sale.created`, `stock.low`, `payment.received`

---

## 15. Phased Roadmap

### Phase 1 — Wide MVP (Months 1–3)  ← **CURRENT**
All modules at 60–70% depth; stable, fast, GST-compliant.
1. POS Billing — perfect billing, GST, multi-payment, print + WhatsApp
2. Product & Inventory — master, barcode, stock, low-stock alerts
3. Purchase — PO, GRN, supplier master, basic ledger
4. Customer — profiles, credit sales, outstanding
5. GST — item-level tax, GSTR-1 & 3B, JSON export
6. Reports — daily sales, stock, GST summary, profit
7. Users — 3 roles (Admin, Manager, Cashier), RBAC
Infra: Atlas, Redis, Railway/Render (simple)

### Phase 2 — Depth & Accounting (Months 4–6)
- Full double-entry: P&L, balance sheet, cash flow
- Supplier ledger + payment tracking
- Batch & expiry (FMCG/pharma)
- Barcode label printing
- Electron offline app
- Advanced reports (margin, category, customer analytics)
- WhatsApp reminders to customers + suppliers

### Phase 3 — Scale & Compliance (Months 7–9)
- Multi-store (central admin, per-store reports, transfers)
- E-invoicing (IRN via NIC IRP)
- E-Way Bill integration
- Tally XML export
- React Native mobile app for owner
- SaaS billing (Razorpay subs, metering)

### Phase 4 — Advanced Platform (Months 10–12)
- AI demand forecasting (time-series ML)
- Loyalty program (points, tiers, rewards)
- Shopify/WooCommerce sync
- Microservices split (Inventory, Reporting)
- GSP listing

### Pre-launch checklist (Phase 1 exit gate)
- [ ] GST invoices pass review by 2 CAs (GSTIN format, HSN, calculations)
- [ ] Atomic transaction test: kill MongoDB mid-transaction → no partial records
- [ ] Ledger balance: Σ debits = Σ credits across 30 days of test data
- [ ] 1000-item cart bills in < 1s
- [ ] 3 cashiers billing simultaneously → no stock conflicts
- [ ] Offline mid-bill test: sale completes locally
- [ ] Security pen test: JWT bypass, injection, privilege escalation
- [ ] Backup restore drill: restore to staging, verify integrity

---

## 16. Complete Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend Runtime | **Node.js 20 LTS (ESM)** | ES Modules throughout |
| Web Framework | **Express.js 5** | Async error handling built-in |
| Frontend | **React 18 + Vite + Tailwind CSS v3** | Zustand for state, React Query for server state |
| Desktop POS | Electron 30 + SQLite | Wraps React web app; offline sync |
| Primary Database | **MongoDB Atlas 7.0** | Multi-AZ, transactions, Atlas Search |
| ODM | **Mongoose 8** | Strict schemas, middleware hooks |
| Cache / Queue | **Redis 7** (ElastiCache) | Bull for jobs, cache-aside |
| Auth | JWT (jsonwebtoken) + bcrypt | Access + refresh token pattern |
| Validation | **Zod** (shared) + **Joi** (API) | Type-safe at every boundary |
| PDF | PDFKit / Puppeteer | PDFKit for invoices; Puppeteer for complex reports |
| Barcode | JsBarcode + ZXing | Client-side generate + scan |
| File Storage | AWS S3 + CloudFront | Invoices, images, exports |
| Email | AWS SES / Nodemailer | Transactional |
| WhatsApp | Meta Cloud API / Twilio | Invoice delivery, reminders |
| Payments | Razorpay SDK | UPI, QR, card — Indian stack |
| Logging | Winston + Morgan | Structured JSON, CloudWatch |
| Errors | Sentry | Real-time alerts |
| APM | Datadog | Traces, metrics, dashboards |
| Testing | **Jest + Supertest + Playwright** | Unit + integration + E2E |
| CI/CD | GitHub Actions | Lint → Test → Build → Deploy |
| Containers | Docker + AWS ECS Fargate | Serverless compute |
| IaC | Terraform | All AWS infra as code |

---

## 17. Phase 1 Build Order (recommended for Claude Code)

Build in this order. Each step is a clean commit; don't start the next until the previous has tests passing.

1. **Repo scaffold** — monorepo, workspaces, `apps/api`, `apps/web`, `packages/shared-types`, `packages/gst-utils`. Prettier, ESLint, Husky pre-commit.
2. **Config & shared** — `config/env.js` (Zod-validated), `config/database.js`, `config/redis.js`, `shared/errors/AppError.js`, `shared/errors/errorHandler.js`, `shared/events/eventBus.js`, Winston logger.
3. **Auth module** — User model, JWT access + refresh (Redis-backed), login/refresh/logout/me routes, auth middleware, RBAC middleware, `scopeToStore` middleware.
4. **Store + Product modules** — schemas, CRUD, indexes, bulk import endpoint (skeleton only in Phase 1).
5. **`gst-utils` package** — pure functions: `computeItemTax(item, isSameState)`, `computeCartTotals(items)`. Fully unit-tested. No DB dependency.
6. **Engines** — `billing.engine.js`, `inventory.engine.js`, `ledger.engine.js`, `gst.engine.js`. Each is a class with static-ish methods accepting a `session` argument. Unit tests > 80% coverage.
7. **Sales module** — model, service with canonical atomic pattern, controller, routes, validators. Integration test: full sale from request → MongoDB.
8. **Purchase module** — PO + GRN flow; atomic GRN triggers stock-in + ledger + input GST credit.
9. **Customer + Supplier modules** — masters + ledger statement endpoints.
10. **GST reports** — aggregation pipelines for GSTR-1 + GSTR-3B; JSON export.
11. **Basic reports** — dashboard KPIs (cached), sales report, stock report, profit summary.
12. **Invoice PDF** — PDFKit template; async via Bull; S3 upload; WhatsApp send.
13. **Frontend POS shell** — Login, dashboard, POS billing screen (barcode scan, cart, payment), invoice print preview. Zustand store. React Query for API.
14. **Frontend admin** — Product master, inventory view, purchase, reports.
15. **Testing, seeding, pre-launch checklist** — seed script for demo data, integration test suite, penetration test checklist.

---

## 18. Working Agreements (for the Claude Code session)

- **Never** bypass `mongoose.startSession()` for financial writes, even "just for testing."
- **Never** do `console.log` — use the Winston logger.
- **Never** compute tax per invoice — always per line item.
- **Never** mutate `sales`, `purchases`, `ledger_entries`, `stock_movements` after creation. Corrections = new documents.
- **Never** expose `_id` without pairing with `storeId` scoping.
- **Always** return the standard response envelope.
- **Always** write the Joi/Zod validator before the controller.
- **Always** add an index for any new field used in a query predicate.
- **Always** emit `eventBus` events for side-effects, never inline them in the transaction.
- When in doubt about scope, ship the smaller, safer version and flag the gap in `docs/progress.md`.

---

**End of CLAUDE.md — v1.0, April 2026**
*Next step: run step 1 (repo scaffold) from §17.*
