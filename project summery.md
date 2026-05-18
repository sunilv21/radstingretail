# Retail POS + ERP — Project Summary

> **Project**: Radsting POS — a multi-tenant cloud-first retail POS + ERP SaaS for Indian SMBs.
> **Phase**: 1 (wide MVP — most modules at 60–80 % depth).
> **Maintainer**: Mindmap Digital
> **Last updated**: 2026-05-12

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Apps & Deployment Layout](#4-apps--deployment-layout)
5. [Five Non-Negotiables](#5-five-non-negotiables)
6. [Data Model — Mongoose Collections](#6-data-model--mongoose-collections)
7. [Core Engines](#7-core-engines)
8. [Modules — Backend Services](#8-modules--backend-services)
9. [Modules — Backend Routes](#9-modules--backend-routes)
10. [Modules — Frontend Pages](#10-modules--frontend-pages)
11. [Modules — Components](#11-modules--components)
12. [Settings Tabs (10 tabs)](#12-settings-tabs)
13. [Auth, RBAC & Multi-Tenancy](#13-auth-rbac--multi-tenancy)
14. [End-to-End Flows](#14-end-to-end-flows)
15. [Events & Side-Effects](#15-events--side-effects)
16. [Print / Invoice Layer](#16-print--invoice-layer)
17. [Integrations](#17-integrations)
18. [Working Logics — Detailed](#18-working-logics--detailed)
19. [Subscription, Plans & Billing](#19-subscription-plans--billing)
20. [Warehouse Mode](#20-warehouse-mode)
21. [HSN Verification System](#21-hsn-verification-system)
22. [Expenses (general + per-GRN ancillary)](#22-expenses-general--per-grn-ancillary)
23. [E-Invoice & E-Way Bill](#23-e-invoice--e-way-bill)
24. [Missing Pieces / Known Gaps](#24-missing-pieces--known-gaps)
25. [Legacy / Transitional Files](#25-legacy--transitional-files)
26. [Phased Roadmap](#26-phased-roadmap)

---

## 1. Executive Summary

A cloud-first, offline-capable SaaS POS + ERP positioned as a modern alternative to Tally/Marg. Combines transactional accounting accuracy with consumer-POS speed. Target tier ₹999–₹4,999/month per store.

Built as a **Modular Monolith** in Phase 1 — clean module boundaries for an eventual Phase 2 microservices split, with everything still in one Node process so MongoDB ACID sessions can wrap multi-step financial writes.

**One Next.js app (route-split), one backend, one MongoDB Atlas database:**

| Surface | Route | Audience |
|---|---|---|
| **Tenant** (`app/page.tsx`, `app/dashboard/*`) | `/`, `/dashboard/*` | Shop owners, cashiers, accountants |
| **Admin** (`app/admin/page.tsx`, `app/admin/dashboard/*`) | `/admin`, `/admin/dashboard/*` | Mindmap Digital staff (vendor side) |
| **Single backend** (`server/`) | `:5000` → `/api/*` | Serves both routes; RBAC-gates `/api/platform/*` to `super_admin` only |

Tenant routes hold 99 % of the user-facing functionality. Admin routes manage plans, support, vendor payouts, and platform-wide settings. Both call the same Express backend; `/api/platform/*` routes are gated by `requireSuperAdmin` middleware so a tenant JWT can never reach them. Tenant uses `token` / `user` localStorage keys, admin uses `admin-token` / `admin-user` — both can be signed in simultaneously in one browser without colliding.

A single `npm run dev` boots the whole stack: backend on `:5000` + Next.js on `:3000` (which serves both `/dashboard/*` and `/admin/*`).

---

## 2. Architecture Overview

### 2.1 Layered View

```
CLIENT LAYER     →  Next.js App Router · React 18 · Tailwind · Zustand · React Query
                    Server components for shells + Client components for interactivity
                    Public bill page (no auth)  ·  CA portal (read-only)  ·  Invite & Pay routes
API GATEWAY      →  Express.js 5 (ESM)  ·  CORS  ·  Rate-limit  ·  JWT auth  ·  Audit middleware
                    Plan-limit + subscription guards  ·  Request raw-body capture for webhooks
APPLICATION      →  Feature modules (auth, sales, inventory, purchase, accounting,
                    gst, transfers, reports, customers, suppliers, expenses, hsn,
                    payroll, support, billing, platform, webhooks)
                    Cross-cutting: EventBus  ·  Subscription guard  ·  RBAC matrix
CORE ENGINES     →  Billing · Inventory · Ledger · GST  (all transactions pass through)
DATA LAYER       →  MongoDB Atlas 7  ·  Mongoose 8  ·  ACID via session.withTransaction
                    Redis (cache + Bull queue, Phase 2 scale-out)
INTEGRATIONS     →  WhatsApp Cloud API  ·  Razorpay  ·  PhonePe  ·  UPI deep-links
                    GSP for e-invoice (ClearTax / IRIS / Masters India / Tally Signer / …)
                    NIC IRP direct (scaffolded, not wired — needs AES/RSA Sek crypto)
                    Tesseract OCR for purchase-bill scan
```

### 2.2 Atomic Transaction Pattern (canonical)

Every financial write follows this shape — sale, GRN, transfer, voucher, expense, party settlement:

```js
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    await Model.create([doc], { session, ordered: true });   // 1. primary doc
    await engineA.dispatch(args, { session });               // 2. side effects
    await engineB.dispatch(args, { session });               // 3. ledger entries
    await store.save({ session });                           // 4. counter bump
  });
} finally {
  await session.endSession();
}
```

If any step throws, **everything rolls back** — no partial sales, no orphan ledger entries, no stock leaks.

---

## 3. Tech Stack

| Layer | Tech |
|---|---|
| **Runtime** | Node.js 20 LTS (ESM throughout) |
| **Web framework** | Express.js 5 |
| **Frontend** | Next.js 16 (App Router) · React 18 · TypeScript · Tailwind CSS · Radix UI primitives · sonner (toasts) · lucide-react (icons) |
| **State (FE)** | Local component state · localStorage for auth · React Query patterns ad-hoc |
| **Primary DB** | MongoDB Atlas 7.0 (multi-AZ, transactions) |
| **ODM** | Mongoose 8 |
| **Auth** | JWT (HS256) · 24h access tokens · bcrypt work-factor 12 |
| **Validation** | Ad-hoc Joi/Zod-style checks in services (no top-level Joi yet) |
| **PDF / Print** | HTML-in-iframe via `printHtml()` · `react-dom/server` renderToStaticMarkup for QR · `qrcode.react` |
| **Barcodes** | `react-barcode` · `qrcode.react` for QR · auto EAN-13 generator |
| **OCR** | Tesseract (purchase bill scan) |
| **WhatsApp** | Meta Cloud API v21.0 (HMAC-SHA256 webhook signing) |
| **Payments** | Razorpay Payment Links · PhonePe Standard Checkout V1 (X-VERIFY HMAC) · UPI deep-links (`upi://pay?...`) |
| **Logging** | Console (Winston scaffolded for Phase 2) |
| **Hosting target** | Vercel (frontend) · Vercel functions (API) for prod · long-running Node for local |

---

## 4. Apps & Deployment Layout

### 4.1 Repo Top-Level

```
POS system/                          ← Single Next.js project, one backend
├── app/                             ← Next.js App Router
│   ├── page.tsx                     ← Tenant login splash
│   ├── layout.tsx                   ← Root layout
│   ├── dashboard/                   ← Tenant dashboard (POS, sales, inventory, …)
│   ├── admin/                       ← Admin (vendor) routes
│   │   ├── page.tsx                 ← Admin login (gates super_admin only)
│   │   └── dashboard/               ← Plans · tenants · payments · requests · users · settings
│   ├── bill/[token]/                ← PUBLIC bill share page (no auth)
│   ├── invite/[token]/              ← Public invite acceptance
│   ├── pay/upi/[reference]/         ← UPI checkout intermediary
│   └── ca-portal/                   ← CA read-only audit portal
├── components/                      ← React UI
│   ├── pos/, ui/                    ← Tenant + shadcn primitives
│   └── admin/Sidebar.tsx            ← Admin-only nav
├── lib/                             ← Frontend libs
│   ├── api.ts                       ← Tenant API client
│   ├── admin-api.ts                 ← Admin API client (separate token key)
│   ├── admin-types.ts               ← Admin-only types
│   ├── types.ts, rbac.ts, print-invoice.ts, share-invoice.ts, …
│   └── plan-limits.ts               ← Shared limits + additive customLimits
├── hooks/                           ← React hooks (barcode-scanner, online-status, …)
├── server/                          ← SINGLE backend (Express) — port 5000
│   ├── app.js                       ← Express factory (route mounts)
│   ├── index.js                     ← Local dev entry
│   ├── config/                      ← database, env
│   ├── middleware/                  ← auth, rbac, audit, rateLimit, subscriptionGuard, requireSuperAdmin, …
│   ├── routes/                      ← HTTP handlers — tenant (~25 files) + /api/platform/* (super_admin gated)
│   ├── services/                    ← Business logic + atomic transactions
│   ├── engines/                     ← Billing · Inventory · Ledger · GST
│   ├── models/                      ← Mongoose schemas (29 collections; SuperAdmin lives here)
│   ├── data/                        ← Static seed data (HSN master)
│   ├── utils/                       ← numbering, response, planLimits, hsn, …
│   └── scripts/                     ← bootstrap, seeders, migrations, create-super-admin
├── api/[[...slug]].js               ← Vercel serverless wrapper (`serverless-http`)
├── README.md, CLAUDE.md, project summery.md, front end logic.md
└── package.json                     ← One npm run dev → backend + frontend together
```

### 4.2 Persistence Layer

Phase-1 used an in-memory JSON store (`server/store/memoryStore.js`); production now runs against **MongoDB Atlas**. The in-memory bridge stays available for offline dev. Atlas connection is established in `server/config/database.js::connectDB()`.

---

## 5. Five Non-Negotiables

These are architectural laws:

1. **Atomicity First** — every financial transaction wrapped in a Mongo session; rollback on any failure.
2. **GST-Native, Item-Level** — tax computed per line item, not per invoice. HSN mandatory.
3. **Double-Entry Ledger** — Σ debits == Σ credits at all times. Corrections are reversal entries.
4. **Immutable Financial Documents** — sales, purchases, ledger entries, stock movements never updated post-creation; corrections create new docs with `referenceId`.
5. **Multi-Tenant by `storeId`** — every query scoped via JWT-injected `storeId`; never trust request params for scoping.

---

## 6. Data Model — Mongoose Collections

29 models in `server/models/`:

| Model | Purpose |
|---|---|
| `Organization` | Top tenant. Owns stores, plan, subscription dates, customLimits, userAddons[], hsnDigitsRequired |
| `Store` | Branch (`type: 'store' \| 'warehouse'`). Counters, GST registration, WhatsApp + e-invoice config, address |
| `SuperAdmin` | Vendor-side users (admin portal) |
| `TenantAdmin` | Org owner accounts |
| `User` | Staff under an org (manager, cashier, accountant, ca) |
| `InviteToken` | Public token for staff/CA invites |
| `SubscriptionPlan` | Plan catalogue (free / starter / pro / enterprise × monthly / yearly / 2-year) |
| `PlatformPayment` | Subscription + user-addon payment intents (pending / awaiting_confirmation / completed) |
| `PlatformSettings` | Vendor-side global config (gateway URL, vendor contact) |
| `Product` | Per-store SKU. HSN, GST, stock, minStock, warrantyMonths, isSerialised |
| `ProductUnit` | Per-unit serial for serialised products |
| `Category` | Hierarchical product categories |
| `Customer` | Per-store customer master. Outstanding, loyalty, GSTIN |
| `Supplier` | Per-store supplier master. Outstanding |
| `Sale` | POS invoice (immutable). Items + tax breakup + payments + warranties + eInvoice + eWayBill |
| `Purchase` | PO + GRN history. `receiptRefs[]` carries per-GRN items + ancillaryExpenses |
| `StoreTransfer` | Inter-branch transfer (warehouse → store etc). Status: requested → in_transit → received |
| `StockMovement` | Immutable stock-change audit trail (in / out / adjustment / transfer) |
| `Payment` | Customer/supplier payment records |
| `BankAccount` | Cash / bank ledger accounts |
| `AccountGroup` | Tally-style chart group (Assets / Liabilities / Income / Expenses + sub-groups) |
| `Account` | Individual ledger account under a group |
| `Voucher` | Manual + auto journal entries (payment / receipt / journal / contra). Σ Dr == Σ Cr enforced |
| `LedgerEntry` | Atomic immutable Dr or Cr; mirrors every voucher entry |
| `GSTReport` | Aggregated GSTR-1 / GSTR-3B snapshots per period |
| `Employee` | Payroll master |
| `Payslip` | Per-employee monthly payslip |
| `AuditLog` | Immutable mutation log (super-admin only read) |
| `SupportRequest` | In-app support inbox (`new / open / replied / closed`) |

### Compound indexes (key invariants)

- `(storeId, sku)` — Product, unique per store
- `(storeId, invoiceNumber)` — Sale, unique
- `(storeId, poNumber)` — Purchase, unique
- `(storeId, grnNumber)` — Purchase.receiptRefs.grnNumber, unique
- `(storeId, voucherNumber)` — Voucher, unique
- `(storeId, createdAt -1)` — most history queries
- `(referenceId, referenceType)` — LedgerEntry → drill-back

---

## 7. Core Engines

`server/engines/` — every transactional service routes through these.

| Engine | Responsibilities | Critical rule |
|---|---|---|
| **`billing.engine.js`** | Cart math, discount, GST calc, totals, change | Per-line tax; intra-state CGST+SGST vs inter-state IGST |
| **`inventory.engine.js`** | `addStock`, `deductStock`, `validateStock`. Always writes a `StockMovement` row | No negative stock unless `store.settings.allowNegativeStock` |
| **`ledger.engine.js`** | `recordSale`, `recordPurchaseReceipt`, `recordSupplierPayment`, `postVoucher`. Writes paired LedgerEntry docs | Σ Dr == Σ Cr per call; immutable entries |
| **`gst.engine.js`** | `computeItemTax(item, isSameState)` — per-line CGST/SGST/IGST split | HSN required; rate must be in {0, 5, 12, 18, 28} (+ specials) |

---

## 8. Modules — Backend Services

`server/services/` — feature-level business logic + atomic transactions.

| Service | Notes |
|---|---|
| `sale.service.js` | `createSale` (atomic), return, void, warranty lookup, ledger mirror |
| `purchase.service.js` | `createPurchase`, `submitPurchase`, `receiveGrn` (atomic incl. ancillary expenses), pre-close, cancel, payments, outstanding reports |
| `product.service.js` | List/get/create/update + barcode/QR validation + HSN format check |
| `product-unit.service.js` | Serial-tracked unit lifecycle |
| `transfer.service.js` | `create`, `dispatch`, `receive`, `cancel`. Each step atomic |
| `accounting.service.js` | Groups, accounts, voucher posting (Σ Dr == Σ Cr enforced), ledgers, P&L, balance sheet, day book, party settlement, closing stock, sales P&L |
| `gst.service.js` | GSTR-1 / GSTR-3B builders, HSN summary |
| `expense.service.js` | Friendly wrapper that creates a payment voucher under the hood. Auto-creates the "Indirect Expenses" group + per-category sub-accounts |
| `e-invoice.service.js` | Dispatcher: `mock` / `gsp` / `nic`. `EInvoiceService.generate / cancel / testConnection` + `EWayBillService.generate`. Sub-modules in `services/einvoice/` |
| `einvoice/gsp-client.js` | Real OAuth2 + Bearer flow. Token cache by `(storeId, env)`. NIC payload pass-through. EWB through same auth |
| `einvoice/nic-direct.js` | Scaffold with proper request shapes + AES/RSA Sek flow docs (not wired) |
| `einvoice/nic-errors.js` | Error-code translator (2150 Duplicate IRN, 2172 cancel-window, 2233 buyer GSTIN, …) |
| `whatsapp.service.js` | Cloud API: text-message send, phone-profile fetch, webhook signature verify |
| `phonepe.service.js` | Standard Checkout V1 — X-VERIFY HMAC-SHA256, sandbox/prod hosts |
| `razorpay.service.js` | Payment Links API, HMAC callback verify, webhook verify |
| `payroll.service.js` | Employee CRUD, payslip generation, leave + LOP, salary structure |
| `accountLookup.js` | Resolves an account by name/control-type — shared by ledger reports |
| `applyPlatformPaymentEffects.js` | On `user_addon` payment confirm → push to `org.userAddons[]` with expiry |
| **Legacy** (`*Service.js` not `*.service.js`) | `authService.js`, `inventoryService.js`, `purchaseService.js`, `salesService.js`, `ledgerService.js` — older singleton-style services still in use by some legacy route files |

---

## 9. Modules — Backend Routes

All authenticated routes pass through `authStack`: `authenticate → subscriptionGuard → blockWritesForReadOnlyRoles → piiRedactionForReadOnly → auditMiddleware`. Mount points in `server/app.js`:

| Mount | File | Surface |
|---|---|---|
| `/api/auth` | `auth.routes.js` | login, refresh, logout, `/me`, switch-store |
| `/api/public` | `public.routes.js` | Un-authenticated bill share, plan list |
| `/api/webhooks` | `webhooks.routes.js` | WhatsApp + payment-gateway callbacks |
| `/api/invites` | `invites.public.routes.js` | Public invite accept |
| `/api/products` | `product.routes.js` | CRUD + barcode + bulk import (skel) |
| `/api/pos` | `pos.routes.js` | Lookup, calculate cart totals |
| `/api/sales` | `sale.routes.js` | Create, list, void, return, warranties, **einvoice/generate · cancel**, **ewb/generate**, public bill token |
| `/api/reports` | `reports.routes.js` | `/dashboard`, **/warehouse-dashboard**, **/warehouse-insights**, `/insights`, `/aging`, `/low-stock`, `/ledger-balance` |
| `/api/customers` | `customer.routes.js` | CRUD + ledger |
| `/api/suppliers` | `supplier.routes.js` | CRUD + ledger |
| `/api/purchases` | `purchase.routes.js` | CRUD, submit, **GRN (with ancillary)**, pre-close, cancel, pay, outstanding-by-supplier / by-item |
| `/api/accounting` | `accounting.routes.js` | Groups, accounts, vouchers, trial-balance, P&L, balance-sheet, cash-flow, day-book, bank-reconciliation, party-settlement, closing-stock, sales-profit |
| `/api/gst` | `gst.routes.js` | GSTR-1, GSTR-3B, summary, JSON export |
| `/api/payroll` | `payroll.routes.js` | Employees, payslips |
| `/api/store` | `store.routes.js` | `/me`, `/subscription`, PUT `/me`, `/whatsapp/test`, `/whatsapp/verify`, **/einvoice/test** |
| `/api/stores` | `stores.routes.js` | Branch CRUD (with `type: 'store' \| 'warehouse'`, plan-limit gated) |
| `/api/users` | `users.routes.js` | Staff CRUD, role assignment |
| `/api/audit` | `audit.routes.js` | Audit-log read |
| `/api/transfers` | `transfers.routes.js` | Stock transfer flow (request → dispatch → receive → cancel) |
| `/api/hsn` | `hsn.routes.js` | Search, lookup-by-code, audit-products |
| `/api/expenses` | `expenses.routes.js` | Categories, list, create, breakdown |
| `/api/support` | `support.routes.js` | Tenant support inbox |
| `/api/billing` (public) | `billing-public.routes.js` | Razorpay + PhonePe S2S callbacks |
| `/api/billing` (auth) | `platform-payments.routes.js` | Payment intent creation, history |
| `/api/platform` | `platform.routes.js` | Admin-portal — vendor surfaces (read in tenant only via super_admin) |

**Legacy duplicates** still mounted in some setups: `auth.js`, `inventory.js`, `purchase.js`, `sales.js`, `reports.js`, `ledger.js` — pre-`*.routes.js` style. See [§25](#25-legacy--transitional-files).

---

## 10. Modules — Frontend Pages

### 10.1 Tenant Dashboard (`app/dashboard/`)

| Path | File | Purpose |
|---|---|---|
| `/dashboard` | `page.tsx` | Landing — sales KPIs (or **WarehouseDashboard** if active branch is a warehouse) |
| `/dashboard/pos` | `pos/page.tsx` | POS billing screen — barcode scan, cart, payment, invoice preview |
| `/dashboard/sales` | `sales/page.tsx` | Sales history. Filter pills, void, return, **Generate IRN**, share, print |
| `/dashboard/inventory` | `inventory/page.tsx` | Product master + stock list. Filter pills, label print, HSN status pill, **Verify button** per row |
| `/dashboard/inventory/hsn-audit` | `inventory/hsn-audit/page.tsx` | Full HSN audit — verified / mismatch / unknown / invalid / missing pills + inline fix dialog |
| `/dashboard/warranties` | `warranties/page.tsx` | Warranty register, time-left column, expiring-≤30d filter |
| `/dashboard/purchases` | `purchases/page.tsx` | PO list, supplier filter, status pills, GRN dialog **with ancillary expenses** |
| `/dashboard/scan-bill` | `scan-bill/page.tsx` | OCR-based supplier bill capture (extracts items → PO draft) |
| `/dashboard/transfers` | `transfers/page.tsx` | Inter-store transfer flow. Warehouse-aware (locks source) |
| `/dashboard/accounting` | `accounting/page.tsx` | "Books" — trial balance, P&L, balance sheet, **Sales P&L tab**, **closing stock tab** |
| `/dashboard/ledger` | `ledger/page.tsx` | Account ledger drill-down |
| `/dashboard/expenses` | `expenses/page.tsx` | Expense register + new-expense dialog (writes payment voucher) |
| `/dashboard/party-settlement` | `party-settlement/page.tsx` | Customer / supplier outstanding settlement |
| `/dashboard/gst` | `gst/page.tsx` | GSTR-1 / GSTR-3B / HSN summary |
| `/dashboard/reports` | `reports/page.tsx` | Sales / stock / profit / aging reports |
| `/dashboard/insights` | `insights/page.tsx` | Insights (**WarehouseInsights** when active branch is warehouse) |
| `/dashboard/collections` | `collections/page.tsx` | Outstanding receivables + reminders |
| `/dashboard/payroll` | `payroll/page.tsx` | Employee + payslip |
| `/dashboard/branches` | `branches/page.tsx` | Branch list. **Type filter pills (Stores / Warehouses)**, plan-cap badges |
| `/dashboard/users` | `users/page.tsx` | Staff & access |
| `/dashboard/audit` | `audit/page.tsx` | Audit log (super-admin only) |
| `/dashboard/billing` | `billing/page.tsx` | Subscription billing (deeplinks to Settings → Billing) |
| `/dashboard/settings` | `settings/page.tsx` | **10-tab vertical sidebar** — see [§12](#12-settings-tabs) |

### 10.2 Public / Non-Dashboard Routes

| Path | Purpose |
|---|---|
| `/` | Marketing splash + login |
| `/bill/[token]` | **Public** read-only bill view (no auth). Token from `sale.shareToken`. Print 80mm / A4 |
| `/invite/[token]` | Public invite acceptance — sets staff password, joins org |
| `/pay/upi/[reference]` | UPI checkout intermediary — embeds QR + intent link |
| `/ca-portal` | Read-only audit portal for CAs (turnover, payments, GST reports) |
| `/ca-portal/balance-sheet` | … |
| `/ca-portal/cash-flow` | … |
| `/ca-portal/profit-loss` | … |
| `/ca-portal/trial-balance` | … |
| `/ca-portal/gstr1` | … |
| `/ca-portal/gstr3b` | … |
| `/ca-portal/purchases` | … |
| `/ca-portal/sales` | … |

---

## 11. Modules — Components

`components/` (44 React components):

### Layout / shell
- `Sidebar.tsx` — main navigation. **Warehouse-aware** (hides POS/Sales/GST/Customers when active branch is warehouse). RBAC-gated entries.
- `StoreSwitcher.tsx` — dropdown to switch active branch. **Visual warehouse badge** (violet halo + "WH" chip).
- `SyncStatus.tsx` / `OfflineBanner.tsx` — offline-mode indicator
- `theme-provider.tsx` — dark mode

### Dashboards
- `WarehouseDashboard.tsx` — stat cards (closing stock cost/MRP, inbound/outbound units), outbound-pipeline table, recent GRNs, top holdings
- `WarehouseInsights.tsx` — dead stock, slow movers, fast movers, top shipped SKUs, top destinations, supplier lead time, stockout incidents

### POS / invoice
- `pos/InvoicePreview.tsx` — live 80mm-style preview. Title variants, BoS handling, CGST/SGST vs IGST, IRN block
- `ErrorBoundary.tsx`

### Settings tabs (extracted)
- `BillingTab.tsx` — subscription payments
- `DocumentationTab.tsx` — 17-section in-app manual with TOC
- `PlansShowcase.tsx` — plan tiles
- `PlanUsageBadge.tsx` — "X/Y branches used"
- `SubscriptionReminder.tsx` / `SubscriptionBanner.tsx` / `SubscriptionLock.tsx` / `SubscriptionExpiredScreen.tsx` / `AccountBlockedScreen.tsx`
- `SupportRequestsPanel.tsx`
- `UserAddonRequest.tsx`

### Standalone helpers
- `HsnAutocomplete.tsx` — type-ahead picker with live verification + rate-suggest
- `ui/*` — shadcn-style primitives (Card, Button, Input, Table, Dialog, …)

---

## 12. Settings Tabs

`/dashboard/settings` uses a vertical sidebar layout (`md:grid-cols-[180px_1fr]`). 10 tabs, deep-linked via `?tab=`:

| Tab key | Label | Renders | API |
|---|---|---|---|
| `business` | **Store profile** | Name, code, phone, email, address, invoice prefix, UPI ID | `PUT /store/me` |
| `logo` | **Logo** | URL or file upload (≤ 512 KB), 40×40 preview | `PUT /store/me` |
| `gst` | **GST** | **Registered / Unregistered toggle**, GSTIN, state code, validation | `PUT /store/me` |
| `preferences` | **Preferences** | GST mode, print copies, allow neg stock, **invoice footer (textarea)**, low-stock threshold, default warranty months, **Loyalty card** (enable + rate), aging buckets, e-way / B2C-Large thresholds | `PUT /store/me` |
| `whatsapp` | **WhatsApp** | Status badge, credentials, **Configured / Not Configured pill**, message template, webhook setup (verify token + app secret), test send, last 10 attempts log | `POST /store/whatsapp/test`, `/whatsapp/verify`, `PUT /store/me` |
| `einvoice` | **E-Invoice** | Provider (mock/nic/gsp), env, GSTIN, creds, **Advanced — endpoint paths**, **Test connection** button (auth-only, no quota burn) | `PUT /store/me`, **`POST /store/einvoice/test`** |
| `subscription` | **Subscription** | Plan, status, usage bars (stores / warehouses / per-role users), vendor contact CTAs, plan tiles | `GET /store/subscription` |
| `billing` | **Billing** | `<BillingTab />` — pay history, gateway selector | platform-payments |
| `help` | **Help & Support** | `<SupportRequestsPanel />` + vendor contact (WhatsApp / phone / email / website env vars) + About card |  `/support/requests` |
| `documentation` | **Documentation** | `<DocumentationTab />` — 17-section in-app manual with debounced search |  static |

### Repeating styling primitive

```ts
const TAB_TRIGGER_CLASS =
  'md:w-full md:justify-start gap-2 px-3 py-2 h-auto text-sm font-medium ' +
  'whitespace-nowrap rounded-none border-b md:border-b border-border ' +
  'data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950/30 ' +
  'data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300 ' +
  'data-[state=active]:shadow-none';
```

Applied to all 10 tabs via a single constant.

---

## 13. Auth, RBAC & Multi-Tenancy

### 13.1 User types

Three completely separate collections:

| Collection | Used by | Auth | App |
|---|---|---|---|
| `SuperAdmin` | Mindmap vendor staff | Same JWT | Admin portal |
| `TenantAdmin` | Org owner | Tenant POS | Tenant POS |
| `User` | Staff (manager / cashier / accountant / ca) | Tenant POS | Tenant POS |

The `userType` claim in the JWT discriminates. `findAccountById(id, userType)` resolves to the right collection.

### 13.2 RBAC Matrix (`server/rbac/matrix.js` + `lib/rbac.ts`)

Backend and frontend share the matrix shape. Backend always re-checks; frontend uses it to hide buttons.

| Resource × Action | Super admin | Admin | Manager | Cashier | Accountant | CA |
|---|---|---|---|---|---|---|
| sales create / void | * / * | * / * | * / * | * / ✗ | ✗ / ✗ | ✗ / ✗ |
| products manage | * | * | * | basic | ✗ | ✗ |
| inventory | * | * | * | r-u | ✗ | ✗ |
| purchases | * | * | * | r-c | r | r |
| accounting | * | * | r | ✗ | * | r-export |
| gst | * | * | r | ✗ | *,export | r,export |
| reports | * | * | r,export | basic | r,export | r,export |
| transfers | * | * | r-c-u | r-c | ✗ | ✗ |
| users | * | * | r | ✗ | ✗ | ✗ |
| audit | * | r | r | ✗ | r | ✗ |

### 13.3 Scoping middleware

- `authenticate` — parse JWT → `req.user = { id, userType, role, organizationId, storeId, storeIds, permissions }`
- `subscriptionGuard` — rejects writes with HTTP 402 if org is expired/blocked
- `blockWritesForReadOnlyRoles` — CAs never write
- `piiRedactionForReadOnly` — masks customer phone/email for CA role
- `auditMiddleware` — appends to `AuditLog` for sensitive mutations
- Implicit: every store-scoped service does `findOne({ _id, storeId: req.user.storeId })`. **Never trust request params for scoping.**

---

## 14. End-to-End Flows

### 14.1 Sale (POS Billing)

```
1. Scan barcode → POST /api/pos/lookup → Product + ProductUnit
2. Cart build → POST /api/pos/calculate → totals with per-item GST split
3. Pay → POST /api/sales/{ items, payments, customerInfo? }
   ┌─ ATOMIC TXN ─────────────────────────────┐
   │  Snapshot stock + counters               │
   │  Sale.create([{...}], {session})         │
   │  InventoryEngine.deductStock(session)    │  +1 StockMovement per item
   │  LedgerEngine.recordSale(session)        │  +N LedgerEntry pairs
   │  GSTEngine.recordSaleTax(session)        │  +1 row to current period
   │  Store.invoiceCounter++  session save    │
   └──────────────────────────────────────────┘
4. eventBus.emit('sale.created') — async PDF, WhatsApp, low-stock alerts
5. Response: sale doc + shareToken (public bill URL)
```

**Warranty branch**: any item with `warrantyMonths > 0` forces `customerInfo` (name + phone + address); server re-checks. Sale gets `hasWarranty: true` + `warranties[]` frozen at sale time.

**Credit sale branch**: ledger debits go to the `customerId`, not the control account (so settlement works per-party).

### 14.2 Purchase → GRN

```
1. POST /api/purchases — draft PO (no stock or ledger impact)
2. POST /api/purchases/:id/submit — draft → ordered
3. POST /api/purchases/:id/grn — receive goods (atomic):
   • Validates line.receivedQty ≤ outstanding
   • Distributes ancillaryExpenses (landed cost) across line items proportionally
   • product.stock += receivedQty (with potentially-bumped purchasePrice)
   • StockMovement(type='in', ref=purchase)
   • LedgerEngine.recordPurchaseReceipt:
       Dr Purchase Expense (subtotal)
       Dr Input GST Credit (totalTax)
       Cr Sundry Creditors (grandTotal)
   • For ancillary lines NOT in landed cost:
       Dr Direct Labour / Freight Inwards / … (per-type sub-account)
       Cr Cash
   • Supplier.outstandingBalance += grandTotal
   • PO.receiptRefs.push({ grnNumber, items, ancillaryExpenses, … })
   • PO.status = allReceived ? 'received' : 'partial'
4. POST /api/purchases/:id/pay — record supplier payment
5. POST /api/purchases/:id/pre-close — accept partial as final
6. POST /api/purchases/:id/cancel — only if nothing received
```

### 14.3 Stock Transfer

```
1. POST /api/transfers — request (no stock impact)
2. POST /api/transfers/:id/dispatch — source deducts
   • InventoryEngine.deductStock at fromStoreId
   • StockMovement(type='transfer', ref=transfer)
3. POST /api/transfers/:id/receive — destination adds
   • InventoryEngine.addStock at toStoreId (auto-creates product in dest if missing)
   • StockMovement(type='transfer', ref=transfer)
4. POST /api/transfers/:id/cancel — only if status='requested'
```

### 14.4 Expense

```
POST /api/expenses { category, amount, paymentMode, narration }
  ↓
ExpenseService.create →
  AccountingService.postVoucher({
    type: 'payment',
    entries: [
      { Debit:  Indirect Expenses → <category account> },
      { Credit: Cash },
    ]
  })  ← atomic, Σ Dr == Σ Cr enforced
```

### 14.5 IRN (E-Invoice) Generate

```
POST /api/sales/:id/einvoice/generate
  ↓
EInvoiceService.generate →
  assertEligibleForIrn(sale)         ← B2B only, not voided, no existing IRN
  payload = buildEInvoicePayload()   ← NIC schema v1.1
  switch (store.eInvoice.provider) {
    case 'mock':  → mockProvider.generate()                  ← deterministic SHA-256 hash
    case 'gsp':   → generateIrnViaGsp()                       ← real HTTP, Bearer token, cached
    case 'nic':   → throw EINV_NIC_NOT_IMPLEMENTED            ← scaffolded only
  }
  sale.eInvoice = { irn, ackNo, ackDate, signedQr, status: 'active' }
  await sale.save()
```

---

## 15. Events & Side-Effects

`server/shared/events/eventBus.js` — Node EventEmitter wrapper.

| Event | Listeners |
|---|---|
| `sale.created` | PDF generation · WhatsApp send · low-stock check · daily-report refresh · loyalty accrual |
| `sale.voided` | Reverse all ledger entries · refund payments · audit log |
| `purchase.received` | Low-stock email digest · supplier outstanding refresh |
| `payment.received` | Customer credit-limit recompute · settlement-candidate refresh |
| `stock.low` | Notification queue · vendor digest (Phase 2) |
| `whatsapp.message.failed` | Status update on `sale.whatsappSends[]` |

All listeners are non-blocking — emitted **after** the atomic transaction commits, never inside it.

---

## 16. Print / Invoice Layer

`lib/print-invoice.ts` — iframe-based print pipeline.

### Two templates

| Template | Use | Trigger |
|---|---|---|
| **Thermal 80mm** | Receipt printer | Default for non-warranty sales |
| **A4 GST invoice** | A4 printer / PDF save | Default for warranty sales; explicit "A4" button on POS |

### Document-title resolver

```js
function resolveDocTitle(sale, store) {
  if (sale.status === 'returned')          return 'CREDIT NOTE';
  if (store.gstRegistered === false)       return 'BILL OF SUPPLY';
  if (sale.invoiceType === 'export_*')     return 'EXPORT INVOICE';
  if (sale.invoiceType === 'sez_*')        return 'SEZ INVOICE';
  if (sale.invoiceType === 'deemed_export') return 'DEEMED EXPORT INVOICE';
  return 'TAX INVOICE';
}
```

### Tax-column layout

- **Bill of Supply** — no tax columns
- **Intra-state** — `CGST` and `SGST` parent headers, each with `%` and `Amount` sub-columns (two-row `<thead>`)
- **Inter-state** — single grouped `IGST` parent with `%` and `Amount`

### A4 sections (in order)

1. Header (store logo + name + address + GSTIN + state code · invoice title + number + date · RCM badge)
2. **Place-of-supply line** (state code + reverse-charge flag)
3. Buyer + payment boxes
4. **Items table with grouped tax headers**
5. Totals + amount-in-words (Indian crore/lakh)
6. **HSN/SAC summary table** with `<tfoot>` totals row
7. **E-invoice block** — IRN (word-break), Ack No, Ack Date, 110×110 signed QR (inline SVG via `react-dom/server` + `qrcode.react`)
8. **E-way bill block** — EWB No, date, validity, vehicle, mode, transporter
9. Warranty table (orange-bordered, if any)
10. Payment table (mode, reference, amount)
11. Terms & Conditions (from `store.settings.invoiceFooter`, multi-line)
12. Signature block

### Defensive layer

- `printInvoice(sale, store, format?)` wraps everything in try/catch
- All `.toFixed(2)` calls routed through `fix2()` helper (handles undefined)
- All `it.productSnapshot.*` access uses optional chaining
- `safeSale` shallow copy if `sale.items` is missing (no mutation of props)
- Errors logged with rich context (`[print-invoice] <name>: <msg> (invoice=…, format=…)`) + alert
- Multi-copy printing via `stampMultipleCopies(html, copies)` — single page-break-separated print job with labels (ORIGINAL / DUPLICATE / OFFICE COPY)

### Public bill page

`/bill/[token]` renders the same `<InvoicePreview>` + Print buttons for the customer (no auth, token from `sale.shareToken`).

---

## 17. Integrations

| Integration | Status | Notes |
|---|---|---|
| **WhatsApp Cloud API** | Real | Meta v21.0. Text-message send, phone profile verify, HMAC webhook receive. Per-store credentials in `store.whatsapp.*` |
| **Razorpay** | Real | Payment Links API + HMAC callback verify + webhook |
| **PhonePe** | Real | Standard Checkout V1. X-VERIFY HMAC-SHA256 |
| **UPI deep-link** | Real | `upi://pay?pa=...&pn=...&am=...&tr=...&tn=...` + QR rendering |
| **E-invoice GSP** | Real | `services/einvoice/gsp-client.js`. OAuth2 client_credentials + Bearer. Configurable endpoint paths per provider. Token cache |
| **E-invoice NIC direct** | Scaffold only | AES/RSA Sek key exchange documented but not wired. Use a GSP for production |
| **E-way bill** | Real (via GSP) / Mock | Same auth as e-invoice |
| **OCR (purchase bill)** | Real | Tesseract on uploaded image. Extracts line items → PO draft |
| **Tally export** | Phase 3 | XML/CSV not built |
| **NIC IRP direct e-invoice** | Phase 3 | Scaffolded only |

---

## 18. Working Logics — Detailed

### 18.1 GST per-line tax (the canonical math)

```js
isSameState = store.stateCode === customer.stateCode
taxableAmount = basePrice - discountAmount

if (isSameState) {
  cgst = taxableAmount × (gstRate / 200)   // half
  sgst = taxableAmount × (gstRate / 200)   // half
  igst = 0
} else {
  cgst = 0
  sgst = 0
  igst = taxableAmount × (gstRate / 100)
}
```

For walk-in customers with no `stateCode`, treat as intra-state (store's own state).

### 18.2 Double-Entry mapping (event → Dr / Cr)

| Event | Debit | Credit |
|---|---|---|
| POS sale (cash) | Cash | Sales Revenue |
| POS sale (UPI/card) | Bank | Sales Revenue |
| POS sale (GST component) | — | Output GST Payable |
| Credit sale | **customerId** (per-party) | Sales Revenue |
| Customer payment | Cash / Bank | customerId |
| Purchase GRN (subtotal) | Purchase Expense | Sundry Creditors |
| Purchase GRN (tax) | Input GST Credit | Sundry Creditors |
| Ancillary expense (landed) | folds into product.purchasePrice | Cash (no separate ledger) |
| Ancillary expense (operating) | `Direct <Type>` sub-account | Cash |
| Supplier payment | Sundry Creditors | Cash / Bank |
| Sales return | Sales Revenue (reversal) | Cash / Bank or Receivable |
| Manual voucher | any | any (Σ == Σ enforced) |

### 18.3 Plan-limit enforcement (`server/utils/enforcePlanLimit.js`)

```js
async enforceStoreLimit(organizationId, type) {
  const org    = await Organization.findById(organizationId);
  const limits = getEffectiveLimits(org);   // plan baseline + customLimits + active addons
  const count  = await Store.countDocuments({ organizationId, type, isActive: { $ne: false } });
  if (count >= limits[type === 'warehouse' ? 'warehouses' : 'stores']) {
    throw new AppError('PLAN_LIMIT_REACHED', '…', 402);
  }
}
```

Stores and warehouses count separately. Enforced at branch-create time AND at every transactional gate (no warehouse on Free plan, etc.).

### 18.4 `getEffectiveLimits` layering

```
result = planBaseline[org.plan]
   + customLimits (absolute for enterprise, additive elsewhere)
   + activeUserAddons (sum of unexpired userAddons[] for each role)
```

### 18.5 Atomic snapshot-restore (Phase-1 fallback)

When MongoDB session is not available (the legacy in-memory bridge), services use a custom `snapshotBackup() / restore()` pattern in `sale.service.js`. Captures product stock, array lengths, and invoice counter; restores on any failure mid-transaction. Semantically equivalent to `session.abortTransaction()`.

---

## 19. Subscription, Plans & Billing

### 19.1 Plans

`SubscriptionPlan` collection seeded by `server/scripts/seed-plans.js`:

| Tier | Monthly | Yearly (17 % off) | 2-Year (25 % off) | Stores | Warehouses | Users (admin/manager/cashier/acct/ca) |
|---|---|---|---|---|---|---|
| Free | ₹0 | ₹0 | ₹0 | 1 | 0 | 1 / 0 / 0 / 0 / 0 |
| Starter | ₹999 | … | … | 2 | 0 | 2 / 1 / 2 / 1 / 1 |
| Pro | ₹2499 | … | … | 4 | 1 | 4 / 4 / 8 / 2 / 2 |
| Enterprise | Custom | Custom | Custom | customLimits (absolute) | customLimits | customLimits |

### 19.2 Lifecycle

```
created → trial (until trialEndsAt)
        → active (after first payment, subscriptionEndsAt set)
        → expired (subscriptionEndsAt < now)
        → blocked (org.isActive=false, vendor hard-block)
```

`subscriptionGuard` middleware rejects writes (402 + body with payment URL) for `expired` or `blocked`. Reads still work so the user can see the lock screen + pay.

### 19.3 Payment intent flow

```
1. Tenant clicks Pay → POST /api/billing/intent { planId, cycle }
2. Server creates PlatformPayment with status='pending'
3. attachGatewayUrl() dispatches:
   - plan.paymentUrl  >  org.paymentUrl  >  platform.gatewayUrl  >  /pay/upi/<ref>
4. If gateway is PhonePe/Razorpay/UPI, server initiates a real intent
5. Redirect → user pays
6. Callback hits /api/billing/(razorpay|phonepe)/callback
7. Re-verify with gateway S2S
8. status → 'awaiting_confirmation' (or 'completed' if auto-confirm enabled)
9. Vendor confirms (admin portal) → status='completed'
10. applyPlatformPaymentEffects():
    - subscription:  org.subscriptionEndsAt += cycleMonths
    - user_addon:    org.userAddons.push({role, qty, expiresAt: now + months})
```

### 19.4 User addons

Time-bound paid grants (e.g. "5 extra cashier slots for 1 month"). Pricing per month × qty × cycle (25 % off yearly). Slots count toward the per-role cap only while `expiresAt > now`.

---

## 20. Warehouse Mode

`store.type` = `'store' | 'warehouse'`. Drives the entire UI when the user switches into a warehouse branch:

### 20.1 Detection

```ts
isActiveWarehouse(user) = user.stores.find(s => s._id === user.storeId)?.type === 'warehouse'
```

Helper in `lib/rbac.ts`.

### 20.2 Sidebar reshape

Hides: **POS / Billing**, **Sales History**, **Warranties**, the entire **Accounting group** (which carries GST + Party Settlement). Keeps: Inventory, **Stock transfers**, Purchases, Insights, Organisation, Settings.

### 20.3 Dashboard reshape

`/dashboard` swaps to `<WarehouseDashboard />`:

- Closing stock at cost + at MRP
- Total units + SKUs
- Inbound this month (units + movements + recent GRNs)
- Outbound this month (units + movements + pending pipeline)
- Top 10 holdings by value
- Low / out-of-stock alert
- Quick actions (Inventory · Send to store · Receive PO · Insights)

### 20.4 Insights reshape

`/dashboard/insights` swaps to `<WarehouseInsights />` (new endpoint `/api/reports/warehouse-insights`):

- Dead stock (no out-movement in 90+ days, sorted by value at cost)
- Slow movers (last out 30–80 days)
- Fast movers (lifetime out + transfer top 10)
- Top shipped SKUs (last 90 days)
- Top destination branches (last 90 days)
- Stockout incidents (last 30 days)
- Supplier lead time (avg/min/max days from PO → first GRN)

### 20.5 Transfers reshape

When in warehouse mode, the New Transfer dialog locks source = active warehouse, restricts destination dropdown to `type='store'` branches only, defaults the title to "Send stock to a store".

### 20.6 StoreSwitcher

Shows violet halo + `Warehouse` icon + `WH` chip when the active branch is a warehouse. Dropdown rows tag each option similarly.

---

## 21. HSN Verification System

### 21.1 HSN master (`server/data/hsn-master.js`)

~600 curated entries spanning every retail-relevant HS chapter (01–99) + 25 SAC codes (services). Each row: `{ code, kind: 'hsn'|'sac', gstRate, description }`. Multiple-rate entries for the same code allowed (e.g. HSN 1701 — 5 % raw / 18 % refined).

### 21.2 Validation (`server/utils/hsn.js`)

- **Format check**: HSN = 2/4/6/8-digit numeric; SAC = 6-digit starting with `99`
- **Digit count enforcement** based on `org.hsnDigitsRequired` (4 for <₹5Cr, 6 for ≥₹5Cr, 8 for exports)
- **Rate match**: compares `product.gstRate` to prescribed rates from the master. If mismatch, status='rate_mismatch' (warning, not error)
- **Unknown code**: format valid, not in our master → 'unknown_hsn' (informational)

### 21.3 Endpoints

| Method | Path | Use |
|---|---|---|
| GET | `/api/hsn?q=...` | Type-ahead search (code prefix or description substring) |
| GET | `/api/hsn/:code` | Single-code lookup with prescribed rates |
| GET | `/api/hsn/audit/products` | Bulk audit of all SKUs — `summary` + `rows[]` with status per SKU |

### 21.4 UI surfaces

- `<HsnAutocomplete>` in product form — live status pill + rate auto-suggest on pick
- Inline `HsnCell` on inventory grid — status badge + `<Verify>` button per row → opens detail dialog with one-click rate fix
- `/dashboard/inventory/hsn-audit` — full audit page with filter pills + inline fix dialog

### 21.5 Enforcement

`product.service.js::assertHsnFormat()` runs before any product save. Rejects empty / wrong-digit-count / non-numeric with precise error codes (`HSN_REQUIRED`, `HSN_BAD_DIGIT_COUNT`, `HSN_BELOW_REQUIRED_DIGITS`, `HSN_INVALID_FORMAT`).

---

## 22. Expenses (general + per-GRN ancillary)

### 22.1 General store expenses

`/dashboard/expenses` — register with `+ New expense` dialog.

17 preset categories (rent, salaries, electricity, internet, water, fuel, delivery, transport, packaging, marketing, repairs, office, travel, professional, bank, insurance, misc). `misc` accepts a freeform `customCategory` that becomes a new sub-account.

Each save calls `ExpenseService.create` which delegates to `AccountingService.postVoucher`:
- **Debit**: per-category account under "Indirect Expenses" group (auto-created)
- **Credit**: Cash account
- Numbered as `PMT-YYYY-NNNNN`

KPI strip: total spent in period · top-5 category bars · register table with voucher number + category badge + paid-via + amount.

### 22.2 Per-GRN ancillary expenses

Added to the GRN receive dialog ([app/dashboard/purchases/page.tsx]). Each line: type (10 presets) + description + amount + **Landed cost?** toggle + paid-via.

Defaults:
- ON (landed cost): freight, transport, octroi, insurance, customs
- OFF (operating expense): labour, loading, unloading, packaging

Server flow (`purchase.service.js::receiveGrn`):
- Landed-cost lines → distributed across GRN items proportional to value, bumping each line's `purchasePrice`. Then `Product.purchasePrice` is updated so future margin reports use the new cost.
- Operating lines → grouped by type, posted as LedgerEntry pairs (Debit "Direct Labour" / "Freight Inwards" / … / Credit Cash). Per-type sub-accounts auto-created under a "Direct Expenses" group.

Live preview cards in the dialog show split totals (₹ to product cost vs ₹ to P&L) before submit.

---

## 23. E-Invoice & E-Way Bill

### 23.1 Provider dispatcher

`store.eInvoice.provider`:

- `mock` — deterministic SHA-256 IRN, base64-JSON QR. No network calls. Ideal for dev/demos.
- `gsp` — real HTTP via `services/einvoice/gsp-client.js`. OAuth2 client_credentials → Bearer token → cached per `(storeId, env)` with TTL from `expires_in` (capped 6h). All paths configurable.
- `nic` — scaffolded only. Throws `EINV_NIC_NOT_IMPLEMENTED` with explicit "use a GSP" guidance. AES/RSA Sek key exchange documented in `services/einvoice/nic-direct.js`.

### 23.2 Service surface

```js
EInvoiceService.generate({ storeId, saleId, userId })
EInvoiceService.cancel({ storeId, saleId, reason, remarks })
EInvoiceService.testConnection({ storeId })          // ← auth-only, no quota
EWayBillService.generate({ storeId, saleId, vehicleNumber, transportMode, transporterId, distanceKm, transporterName })
```

### 23.3 Test connection

`POST /api/store/einvoice/test` → calls `gsp-client.testConnection(store)` which clears the cache + does a fresh auth round-trip + returns `{ ok, provider, environment, expiresAtIso, ttlSeconds }`.

Settings UI shows green / amber panel with TTL minutes or NIC-translated error.

### 23.4 Error translation (`services/einvoice/nic-errors.js`)

~30 NIC error codes translated to human messages: 2150 Duplicate IRN, 2172 cancel window expired, 2176/2233 invalid GSTIN format, 2189 invalid HSN, 2227 invoice total mismatch, 2240 missing place-of-supply, 2295 invalid cancel reason, plus 4xxx auth/network errors.

### 23.5 Eligibility

`assertEligibleForIrn(sale)`:
- Sale must NOT be `returned` or `voided`
- Customer must have GSTIN (B2B only)
- No existing IRN

### 23.6 24-hour cancel window

NIC enforces. Service re-checks `Date.now() - sale.eInvoice.generatedAt < 24h` before the network call.

---

## 24. Missing Pieces / Known Gaps

### 24.1 E-invoice

- **NIC direct (`provider='nic'`)** intentionally not wired — needs AES-256 + RSA-2048 Sek key exchange. Most SMBs use GSP anyway. Scaffold + docs in place for future enterprise tenant.
- **Real GSP testing** has only been verified against the mock provider end-to-end. The first real GSP signup will surface any vendor-specific quirks.

### 24.2 Settings UI

- **WhatsApp tab has two save buttons** (credentials vs webhook) — confusing UX. Should be one form.
- **Webhook public base** is stored in `localStorage`, not on the server — lost on device switch.
- **No "unsaved changes" warning** when navigating away mid-edit.
- **`hsnDigitsRequired` has no UI** — only editable via direct DB write or admin portal.
- **Subscription / Help tabs** read `NEXT_PUBLIC_VENDOR_*` env vars on every render (minor perf).
- **E-Invoice NIC + GSP sections** share ~95 % markup but aren't extracted to a shared sub-component.
- **Counter values** (poCounter, grnCounter, voucherCounters) not viewable anywhere in the UI.

### 24.3 Print

- QR rendering uses `react-dom/server` via lazy `require()` for resilience — works but is unusual for client bundles. If a future Next.js / Turbopack upgrade breaks it, the QR silently disappears (rest of bill still prints).

### 24.4 Inventory

- Bulk Excel import is **stubbed** — endpoint exists, parsing logic not built.
- Stock-take / cycle-count workflow not built.

### 24.5 Reports

- **Tally XML export** — Phase 3.
- **E-invoice JSON export for GSTR-1** — Phase 2.

### 24.6 Architecture transitional

- ~30 % of routes are still legacy (`auth.js`, `inventory.js`, `purchase.js`, `sales.js`, `reports.js`, `ledger.js`) — see §25.

### 24.7 Frontend

- React Query is **not** the state cache yet — everything is ad-hoc `useEffect` + local state. Phase 2 should consolidate.
- Offline mode (`lib/offline-db.ts` + `lib/sync.ts`) is scaffolded but not exercised in Phase 1 prod.
- Zustand not yet adopted; was planned for cart/POS state.

### 24.8 Phase 2 ambitions (not yet built)

- Electron offline POS app
- Multi-store admin console (vendor-side)
- ClickHouse / Atlas Analytics Node for heavy reports
- DPDP Act 2023 consent management UI
- 7-year cold-storage archival
- Bull queue for PDF + WhatsApp + reports
- Atlas Search for fuzzy product search

---

## 25. Legacy / Transitional Files

Several routes and services exist in both old + new naming styles. New style is `<feature>.routes.js` + `<feature>.service.js`; old style is `<feature>.js` (route) + `<feature>Service.js` (service). Active code path uses the new files; old files are kept for compat with any caller that hasn't migrated yet.

| Old → New (route) | Old → New (service) |
|---|---|
| `auth.js` → `auth.routes.js` | `authService.js` → (in `auth.routes.js`) |
| `inventory.js` → `product.routes.js` | `inventoryService.js` → `product.service.js` |
| `purchase.js` → `purchase.routes.js` | `purchaseService.js` → `purchase.service.js` |
| `sales.js` → `sale.routes.js` | `salesService.js` → `sale.service.js` |
| `reports.js` → `reports.routes.js` | — |
| `ledger.js` → `accounting.routes.js` | `ledgerService.js` → `accounting.service.js` |

These should be deleted once a final grep confirms no caller hits them. Tracked as Phase 2 cleanup.

---

## 26. Phased Roadmap

### Phase 1 — Wide MVP (Mo 1–3) — **CURRENT**

✓ Done: POS billing · Inventory + HSN audit · Purchases + GRN + ancillary · Customer + Supplier ledgers · GST returns · Reports · Insights · Warehouse mode · Stock transfers · Expenses · Plans + subscription gates · WhatsApp · UPI/Razorpay/PhonePe payments · 10-tab Settings · Documentation tab · Print (thermal + A4 e-invoice ready) · Mock e-invoice + GSP scaffold + EWB · Audit log

### Phase 2 — Depth & accounting (Mo 4–6)

- Full Tally-grade reports (cash flow, profit & loss, balance sheet at any cutoff)
- Batch / expiry tracking (FMCG, pharma)
- Barcode label print queue
- Electron offline app
- Real GSP wiring with one tested provider (ClearTax / IRIS)
- React Query adoption, Zustand for cart
- Cleanup legacy files (§25)

### Phase 3 — Scale & compliance (Mo 7–9)

- Multi-store central admin
- E-invoicing (real NIC direct for enterprise tier)
- E-Way Bill (real)
- Tally XML export
- React Native mobile app for owners
- DPDP compliance UI

### Phase 4 — Advanced platform (Mo 10–12)

- AI demand forecasting
- Loyalty tiers + rewards
- Shopify / WooCommerce sync
- Microservices split (inventory, accounting, reports)
- GSP listing

---

## Appendix A — Repository Quick Reference

### Run locally

```bash
# Backend (long-running Node)
cd "POS system" && node server/index.js     # http://localhost:5000

# Frontend (Next.js dev)
npm run dev                                  # http://localhost:3000
```

### Useful scripts

```
server/scripts/bootstrap.js               # First-run org + admin + sample data
server/scripts/seed-plans.js              # Plan catalogue
server/scripts/seed-demo-data.js          # 350 products, 600 sales, 150 POs
server/scripts/seed-accounting.js         # Chart of accounts + replayed entries
server/scripts/seed-party-settlement.js   # Settlement candidates
server/scripts/seed-warehouse-data.js     # 70 SKUs + 12 suppliers + 25 GRNs + 40 transfers in one warehouse
server/scripts/backfill-credit-sale-ledger.js
server/scripts/fix-document-number-indexes.js
```

### Env vars

| Var | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection |
| `JWT_SECRET` | HS256 signing key |
| `CORS_ORIGIN` | Comma-separated allowed origins (prod) |
| `NEXT_PUBLIC_API_URL` | Frontend → backend base URL |
| `NEXT_PUBLIC_APP_URL` | Self-referencing for share links |
| `NEXT_PUBLIC_VENDOR_WHATSAPP` / `_PHONE` / `_EMAIL` / `_WEBSITE` | Help tab vendor contact |
| `WHATSAPP_API_KEY` | Meta Cloud API token |
| `RAZORPAY_KEY_ID` / `_SECRET` | Payment Links |
| `PHONEPE_SALT_KEY` / `_INDEX` | Standard Checkout |

---

*End of summary — 2026-05-12*
