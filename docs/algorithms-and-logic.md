# Algorithms & Logic Map — Retail POS + ERP

**Purpose:** A single reference for *every* algorithm and business rule in the system — what it does, the exact file that implements it, and the UI page/route where it surfaces. Use it to find "where does X live" without grepping.

**Conventions**
- **Engine/Service** = backend logic file. **Page** = the Next.js screen a user sees. **API** = the route that connects them.
- Money rule everywhere: `round2(n) = Math.round(n*100)/100`. Tax is computed **per line item**, never per invoice.
- Every backend query is scoped to `storeId` taken from the JWT (multi-tenant). Every financial write runs inside a MongoDB transaction.

---

## 1. Core engines (the four that every transaction flows through)

| Engine | What it does | File | Surfaced on page(s) |
|---|---|---|---|
| **Billing** | Resolves cart products, applies the GST-inclusive/exclusive flag, hands lines to the GST engine | [server/engines/billing.engine.js](../server/engines/billing.engine.js) | [POS/Billing](../app/dashboard/pos/page.tsx) |
| **GST** | Per-line CGST/SGST/IGST, inclusive-vs-exclusive extraction, cart totals | [server/engines/gst.engine.js](../server/engines/gst.engine.js) | [POS](../app/dashboard/pos/page.tsx), [GST](../app/dashboard/gst/page.tsx), [Inventory price preview](../app/dashboard/inventory/page.tsx) |
| **Inventory** | Stock validate / deduct / add / adjust; writes immutable `StockMovement` | [server/engines/inventory.engine.js](../server/engines/inventory.engine.js) | [Inventory](../app/dashboard/inventory/page.tsx), POS, [Purchases GRN](../app/dashboard/purchases/page.tsx) |
| **Ledger** | Double-entry posting for every financial event; `Σ debits == Σ credits` | [server/engines/ledger.engine.js](../server/engines/ledger.engine.js) | [Ledger](../app/dashboard/ledger/page.tsx), [Accounting](../app/dashboard/accounting/page.tsx) |

### 1.1 GST per-item tax algorithm
**File:** [gst.engine.js `computeItemTax`](../server/engines/gst.engine.js) · client mirror [lib/billing-local.ts](../lib/billing-local.ts)

```
discountAmount = percent ? base × pct/100 : flat
grossAfterDiscount = base − discountAmount
isSameState = store.stateCode === customer.stateCode

if priceIncludesGst && rate>0:        # tax is INSIDE the price
    taxableAmount = round2(gross / (1 + rate/100))
    subtotalExTax = round2(basePrice / (1 + rate/100))
    tax = round2(gross − taxableAmount)
else:                                  # tax ADDED on top
    taxableAmount = gross
    subtotalExTax = basePrice
    tax = taxable × rate/100

intra-state → cgst = sgst = tax/2 ;  inter-state → igst = tax
```
**Cart totals** (`computeCartTotals`): `subtotal = Σ subtotalExTax`, `totalTax = Σ tax`, `totalDiscount = subtotal − Σ taxable`, `grandTotal = round(Σ taxable + Σ tax)`, `roundOff` absorbs the rupee rounding. This guarantees **`grandTotal == Σ line.totalAmount`** for both pricing modes.
**Pages:** live cart math on [POS](../app/dashboard/pos/page.tsx); the inclusive/exclusive toggle + live preview on [Inventory product form](../app/dashboard/inventory/page.tsx).

### 1.2 Double-entry ledger — event → Dr/Cr map
**File:** [ledger.engine.js](../server/engines/ledger.engine.js)

| Event | Debit | Credit | Function |
|---|---|---|---|
| POS sale (cash) | Cash | Sales Revenue + Output GST | `recordSale` |
| POS sale (upi/card/bank) | Bank | Sales Revenue + Output GST | `recordSale` |
| Credit sale | Sundry Debtors | Sales Revenue + Output GST | `recordSale` |
| Customer payment | Cash/Bank | Sundry Debtors | `recordSalePayment` |
| Purchase GRN | Purchase Expense + Input GST | Supplier Payable | `recordPurchaseReceipt` |
| Supplier payment | Supplier Payable | Cash/Bank | `recordPurchasePayment` |
| Sales return (CN) | Sales Revenue + Output GST | Cash/Bank/Debtors | `recordSaleReturn` |
| Purchase return (DN) | Supplier Payable | Purchase Expense + Input GST | `recordPurchaseReturn` |
| Manual voucher | any | any (Σ Dr = Σ Cr enforced) | `postVoucher` |

**Invariants enforced:** sale revenue is derived as `grandTotal − totalTax` so Dr=Cr survives rupee rounding; purchase payable is **derived in-engine** as `subtotal + totalTax` (throws if the caller's grandTotal disagrees); `postVoucher` rejects empty/negative/unbalanced vouchers. Balance self-check: `verifyBalance(storeId)`.
**Pages:** [Ledger](../app/dashboard/ledger/page.tsx), [Accounting](../app/dashboard/accounting/page.tsx); account self-heal seeds the chart of accounts on first ledger touch.

### 1.3 Inventory movement
**File:** [inventory.engine.js](../server/engines/inventory.engine.js) — `validateStock` (no negative unless `store.settings.allowNegativeStock`), `deductStock` (sale), `addStock` (GRN/return), `adjustStock` (manual). Every change writes an immutable `StockMovement`.
**Pages:** [Inventory](../app/dashboard/inventory/page.tsx) (adjust, low-stock), POS (deduct), [Purchases](../app/dashboard/purchases/page.tsx) (GRN add).

---

## 2. The atomic transaction pattern
**File:** [sale.service.js `createSale`](../server/services/sale.service.js) (canonical), mirrored in [purchase.service.js](../server/services/purchase.service.js), [transfer.service.js](../server/services/transfer.service.js), [payroll.service.js](../server/services/payroll.service.js).

```
pre-validate (stock, warranty, payments)  →  mongoose.startSession()
withTransaction:
   create Sale  →  deduct stock + StockMovement  →  ledger entries  →  GST records
commit  →  (side-effects: PDF / WhatsApp / low-stock — via eventBus, OUTSIDE the txn)
abort on any error → nothing persists
```
**Page:** [POS "Save" / "Save & Print"](../app/dashboard/pos/page.tsx).

---

## 3. Sequential document numbering
**File:** [server/utils/numbering.js](../server/utils/numbering.js) + invoice counter on the `Store` doc, incremented **inside the session**.
Formats: `INV-YYYY-#####` (sales), `PO-YYYY-#####`, `GRN-YYYY-#####`, `CN-/DN-YYYY-#####`, voucher `PMT-/RCT-/JV-/CON-…`, `PSL-…` (payslip), transfer numbers.
Backstop: unique index `(storeId, invoiceNumber)` etc.
**Pages:** every document-creating screen (POS, Purchases, Accounting vouchers, Payroll, Transfers).

---

## 4. Sales & POS

| Logic | File | Page |
|---|---|---|
| Cart build + totals | [sale.service.js `calculate`](../server/services/sale.service.js) → BillingEngine | [POS](../app/dashboard/pos/page.tsx) |
| Atomic sale create | `createSale` | POS |
| Idempotency (offline replay dedupe) | partial unique index on `idempotencyKey` ([Sale.js](../server/models/Sale.js)) + [lib/sync.ts](../lib/sync.ts) | POS (offline) |
| Warranty capture rule (customer mandatory if any line `warrantyMonths>0`) | `createSale` validation §8.5a | POS (customer card), [Warranties register](../app/dashboard/warranties/page.tsx) |
| Sales return → credit note (totals from per-line `totalAmount`, inclusive-safe) | `returnSale` | [Sales history](../app/dashboard/sales/page.tsx) |
| Record customer payment against credit sale | `recordPayment` | [Sales](../app/dashboard/sales/page.tsx), [Collections](../app/dashboard/collections/page.tsx) |
| Payment split / change / `amountPaid` (every non-credit tender counts) | `createSale` | POS payment panel |
| Offline cart totals (mirror of server GST engine) | [lib/billing-local.ts](../lib/billing-local.ts) | POS when offline |
| Draft carts | [lib/pos-drafts.ts](../lib/pos-drafts.ts) | POS "Drafts" |

---

## 5. Purchases
**File:** [purchase.service.js](../server/services/purchase.service.js) · **Page:** [Purchases](../app/dashboard/purchases/page.tsx)

State graph `draft → ordered → (partial ⇄ ordered) → received`, with `→ cancelled` / `→ closed`.

| Step | Function | API |
|---|---|---|
| Create PO | `create` | `POST /purchases` |
| Submit (draft→ordered) | `submit` | `POST /purchases/:id/submit` |
| GRN (atomic stock-in + ledger) | `receiveGrn` | `POST /purchases/:id/grn` |
| Supplier payment | `payPurchase` | `POST /purchases/:id/pay` |
| Pre-close (forgive pending qty) | `preClose` | `POST /purchases/:id/pre-close` |
| Cancel (nothing received) | `cancel` | `POST /purchases/:id/cancel` |
| Purchase return (debit note) | `returnPurchase` | `POST /purchases/:id/return` |
| Outstanding by supplier / item | aggregation | `GET /purchases/outstanding/...` |

---

## 6. Accounting (Tally-grade statements)
**File:** [accounting.service.js](../server/services/accounting.service.js) · **Page:** [Accounting](../app/dashboard/accounting/page.tsx), [Ledger](../app/dashboard/ledger/page.tsx), [Party settlement](../app/dashboard/party-settlement/page.tsx)

| Statement | Algorithm | Function |
|---|---|---|
| **Trial balance** | per account: opening + ΣDr + ΣCr → closing; assert ΣDr = ΣCr | `trialBalance` |
| **Profit & Loss** | income = ΣCr−ΣDr; expense = ΣDr−ΣCr; Net = Income − Expense | `profitAndLoss` |
| **Balance sheet** | assets = opening+ΣDr−ΣCr; liab/equity = opening+ΣCr−ΣDr; + retained earnings; balanced check | `balanceSheet` |
| **Cash flow** | bucketise Dr/Cr to cash/bank by referenceType | `cashFlow` |
| **Day book** | chronological ledger stream for a date range | `dayBook` |
| **Bank reconciliation** | amount-match (±₹0.01) book vs uploaded statement | `bankReconciliation` |
| **Voucher posting** | payment/receipt/journal/contra, Σ Dr = Σ Cr enforced | `postVoucher` (ledger engine) |
| **Account/group tree** | Tally-style hierarchy Assets/Liab/Income/Expense | `createGroup`/`createAccount` |
| Chart-of-accounts seeding | default accounts per store | [seedStoreAccounts.js](../server/services/seedStoreAccounts.js) |

---

## 7. GST reports
**File:** [gst.service.js](../server/services/gst.service.js) · **Page:** [GST](../app/dashboard/gst/page.tsx)

| Report | Logic | Function |
|---|---|---|
| Monthly summary | output GST − input ITC = net payable | `summary` |
| **GSTR-1** | B2B / B2C-Large (> b2cLargeThreshold) / B2C-Small / HSN summary buckets | `gstr1` |
| **GSTR-3B** | Output liability − ITC = net payable / carry-forward | `gstr3b` |
| JSON export | portal-shaped JSON | `export` |
| HSN validation/search | format check (2/4/6/8 digit; SAC 99…) | [server/utils/hsn.js](../server/utils/hsn.js), [HSN audit page](../app/dashboard/inventory/hsn-audit/page.tsx) |

---

## 8. Auth, RBAC & multi-tenancy

| Logic | File | Notes |
|---|---|---|
| JWT verify + attach `req.user` | [middleware/auth.js](../server/middleware/auth.js) | **fail-closed** on missing `JWT_SECRET` in prod; ephemeral dev secret |
| Account lookup across superadmins/tenantadmins/users | [services/accountLookup.js](../server/services/accountLookup.js) | |
| **RBAC matrix** (role → resource → actions) | [rbac/matrix.js](../server/rbac/matrix.js) | `canActOn(role,resource,action)` |
| Resource gate on every data router | [middleware/rbac.js `enforceResource`](../server/middleware/rbac.js) | wired in [app.js](../server/app.js) auth stack |
| Per-route fine gates (sale void/return, purchase grn/pay/cancel) | `requirePermission` in [sale.routes.js](../server/routes/sale.routes.js), [purchase.routes.js](../server/routes/purchase.routes.js) | defense in depth |
| Store-scope injection | [rbac/storeAccess.js](../server/rbac/storeAccess.js), `scopeToStore` | storeId from JWT, never client |
| Read-only role block (CA) | `blockWritesForReadOnlyRoles` | |
| PII redaction for CA | [middleware/piiRedaction.js](../server/middleware/piiRedaction.js) | |
| Subscription guard (402 if expired) | [middleware/subscriptionGuard.js](../server/middleware) | |
| Audit log (immutable writes) | [middleware/audit.js](../server/middleware/audit.js) | [Audit page](../app/dashboard/audit/page.tsx) |
| Frontend permission helper (hides buttons) | [lib/rbac.ts](../lib/rbac.ts) | server still enforces |
| Plan limits (stores/users/warehouses per tier) | [lib/plan-limits.ts](../lib/plan-limits.ts) | [Branches](../app/dashboard/branches/page.tsx), [Users](../app/dashboard/users/page.tsx) |

---

## 9. E-invoice (IRN) & E-Way Bill
**File:** [e-invoice.service.js](../server/services/e-invoice.service.js) (façade: mock / gsp / nic), [einvoice/gsp-client.js](../server/services/einvoice/gsp-client.js), [einvoice/nic-direct.js](../server/services/einvoice/nic-direct.js) · **Page:** [Settings → E-Invoice](../app/dashboard/settings/page.tsx), generate/cancel from [Sales](../app/dashboard/sales/page.tsx)

| Logic | Function |
|---|---|
| NIC schema-v1.1 payload build | `buildEInvoicePayload` |
| Eligibility (B2B + GSTIN, not voided/returned, no existing IRN) | `assertEligibleForIrn` |
| GSP OAuth2 token cache, keyed `(storeId, environment)` | `gsp-client.js fetchAuthToken` |
| IRN generate / cancel (24h window) | `EInvoiceService.generate/cancel` |
| E-Way bill (threshold `settings.eWayBillThreshold`) | `EWayBillService.generate` |
| NIC error code → human message | [einvoice/nic-errors.js](../server/services/einvoice/nic-errors.js) |

Full setup guide: [docs/einvoice-integration-guide.md](einvoice-integration-guide.md).

---

## 10. Bill scanning / OCR pipeline
**Page:** [Scan Bill](../app/dashboard/scan-bill/page.tsx) → pre-fills [Purchases](../app/dashboard/purchases/page.tsx)

| Stage | Algorithm | File |
|---|---|---|
| Orchestrator (route by file type) | digital-PDF text vs scanned-PDF/image OCR | [lib/bill-scan.ts](../lib/bill-scan.ts) |
| PDF text-layer extract + column-gap preservation | pdfjs text items, x-gap → column break; rasterise fallback | [lib/pdf-extract.ts](../lib/pdf-extract.ts) |
| Image preprocessing | upscale → grayscale → contrast stretch → **Otsu binarize** | [lib/ocr.ts `preprocessImage`/`otsuThreshold`](../lib/ocr.ts) |
| OCR with adaptive multi-pass | Tesseract PSM 6→4→3, keep best confidence | [lib/ocr.ts `runOcr`](../lib/ocr.ts) |
| Field extraction (GSTIN/invoice/date/amounts/HSN) | labelled-regex + "last number on line" for totals | [lib/invoice-extractor.ts](../lib/invoice-extractor.ts) |
| **Line-item table parse** | column-aware split, standalone-HSN detection, qty/rate/amount inference | [lib/invoice-extractor.ts `extractLineItems`](../lib/invoice-extractor.ts) |
| Product auto-match to catalogue | HSN + fuzzy name; unmatched → review panel | [purchases/page.tsx `CreatePoDialog`](../app/dashboard/purchases/page.tsx) |

---

## 11. Delivery & integrations

| Feature | Algorithm | File | Page |
|---|---|---|---|
| WhatsApp send (Meta/Twilio) + audit trail | phone normalise, text vs template, append `whatsappSends` | [whatsapp.service.js](../server/services/whatsapp.service.js) | [Settings → WhatsApp](../app/dashboard/settings/page.tsx), POS share |
| Free share (wa.me / mailto / copy / QR) | link builders | [lib/share-invoice.ts](../lib/share-invoice.ts) | POS invoice preview, [public bill page](../app/bill) |
| Public bill lookup (no auth, by shareToken) | strips PII not on the bill | [routes/public.routes.js](../server/routes/public.routes.js) | [/bill/[token]](../app/bill) |
| Razorpay (HMAC-verified webhook) | signature over raw body, `timingSafeEqual` | [razorpay.service.js](../server/services/razorpay.service.js) | [Billing](../app/dashboard/billing/page.tsx), [/pay](../app/pay) |
| PhonePe (S2S verify) | `sha256(payload+saltKey)` xVerify | [phonepe.service.js](../server/services/phonepe.service.js) | [/pay/upi](../app/pay) |
| Payroll run | per-employee salary → payslip + ledger | [payroll.service.js](../server/services/payroll.service.js) | [Payroll](../app/dashboard/payroll/page.tsx) |
| Inter-store transfer | dispatch/receive, stock move both stores | [transfer.service.js](../server/services/transfer.service.js) | [Transfers](../app/dashboard/transfers/page.tsx) |
| Expenses | expense → journal voucher | [expense.service.js](../server/services/expense.service.js) | [Expenses](../app/dashboard/expenses/page.tsx) |
| Offline sync (outbox, idempotent replay) | FIFO drain, 5xx retry / 4xx skip | [lib/sync.ts](../lib/sync.ts) | POS (offline indicator) |
| Reports / KPIs | dashboard aggregates | [routes/reports.routes.js](../server/routes/reports.routes.js) | [Reports](../app/dashboard/reports/page.tsx), [Insights](../app/dashboard/insights/page.tsx), [Dashboard](../app/dashboard/page.tsx) |
| Printing (80mm thermal / A4, GST invoice, labels) | iframe print, number-to-Indian-words | [lib/print-invoice.ts](../lib/print-invoice.ts), [lib/print-gst.ts](../lib/print-gst.ts), [lib/print-labels.ts](../lib/print-labels.ts) | POS, Sales, Inventory labels |

---

## 12. Platform (vendor / super-admin)
**Pages:** [/admin](../app/admin), [/ca-portal](../app/ca-portal) · **Files:** [routes/platform.routes.js](../server/routes/platform.routes.js), [platform-payments.routes.js](../server/routes/platform-payments.routes.js)
Tenant/organization management, subscription plans, platform payments, support requests — all behind `requireSuperAdmin`, cross-tenant by design.

---

---

## 13. Test status of the algorithms

The pure algorithms here are covered by an executable suite — `node server/scripts/algo-tests.mjs` (**54/54 passing**, no DB needed) — and a read-only data-integrity scanner — `node server/scripts/integrity-scan.js` (verifies the invariants against live data).

| Algorithm | Where | Executable test | Notes |
|---|---|---|---|
| GST per-item tax (incl/excl, intra/inter, discount, zero-rate) | gst.engine.js | ✅ algo-tests §1 | client mirror billing-local.ts verified in lockstep |
| GST cart totals (`grandTotal == Σ totalAmount`) | gst.engine.js | ✅ algo-tests §2 | inclusive ₹250→₹250, exclusive→₹280 |
| Double-entry postings (Σ Dr = Σ Cr) | ledger.engine.js | ⚠ partial — `postVoucher` guard unit-tested; sale/GRN postings need DB (integrity-scan TC-BOOK-150–156) | payable derived in-engine |
| `postVoucher` balance guard | ledger.engine.js | ✅ algo-tests §3 | rejects unbalanced/negative/single |
| Invoice sequence allocator | utils/sequence.js | ✅ algo-tests §5 | no dup across concurrent workers; legacy seed |
| RBAC `canActOn` matrix | rbac/matrix.js | ✅ algo-tests §4 (19 cases) + 9 read-route cases | enforced via enforceResource + requirePermission |
| Invoice field/line-item extraction | invoice-extractor.ts | ✅ ad-hoc runtime test (columnar + GST% sample) | OCR text quality is the variable, not the parser |
| Accounting statements (TB/P&L/BS/cash-flow) | accounting.service.js | ⚠ needs DB — see test-cases §33.8 | invariant: TB Σ Dr = Σ Cr |

Manual + integration cases for everything that needs a database (concurrent billing, returns, e-invoice, scan-bill, resilience) are in [test-cases.md §33](test-cases.md).

---

*Cross-references: financial rules → [CLAUDE.md](../CLAUDE.md) §6–§8; known issues + test results → [docs/code-audit-report.md](code-audit-report.md); e-invoice setup → [docs/einvoice-integration-guide.md](einvoice-integration-guide.md); scaling → [docs/production-scaling-plan.md](production-scaling-plan.md).*
*Last updated 2026-06-16.*
