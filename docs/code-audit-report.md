# Code Audit Report — Retail POS + ERP

**Date:** 2026-06-16
**Scope:** Full codebase — core engines, service layer, Mongoose models/schemas, routes/middleware/RBAC, frontend lib + pages, and integrations (e-invoice/GSP, WhatsApp, payments).
**Method:** Six parallel deep-read audits (one per subsystem), each checking correctness, the Five Non-Negotiables (atomicity, item-level GST, double-entry, immutability, multi-tenant by `storeId`), security, validation, schema/indexes, and error handling. The three headline P0s were re-verified by hand against the source.

> **How to read this:** Severities are P0 (critical — fix before any production exposure), P1 (high), P2 (medium), P3 (low/cosmetic). Every finding cites `file:line`. A "Done well" section at the end records what is genuinely solid, so this isn't read as all-negative — it isn't.

---

## v2 — Verification pass & remediation status (2026-06-16)

A second pass ran **executable algorithm tests** (`server/scripts/algo-tests.mjs`, **54/54 passing**) plus four parallel static re-audits of every route/CRUD/button after the fixes below. Status of the original findings:

### Fixed and verified this session
| Original finding | Fix | Verified by |
|---|---|---|
| **P0-1** idempotency duplicate-key | Partial unique index `{idempotencyKey:{$type:'string'}}`; key omitted (not null) when absent | algo-tests + regression audit |
| **P0-2** JWT hard-coded fallback | Fail-closed in prod; ephemeral dev secret | regression audit (boots when set) |
| **P0-3** RBAC not enforced | `enforceResource` on all data routers + explicit `requirePermission` on sale void/return, einvoice/ewb, all purchase sub-actions | route audit (per-route table) + 24 RBAC unit assertions |
| **P1** purchase payable not derived | Derived `subtotal+totalTax` in-engine, throws on mismatch | algo-tests + regression audit (Σ Dr = Σ Cr) |
| **P1** sale-return over-refunds inclusive | Totals from per-line `totalAmount`/`taxableAmount` | regression audit |
| **P1** `postVoucher` no balance guard | Rejects <2 entries, ≤0/NaN amounts, unbalanced | algo-tests (3 reject cases) |
| **P1** `bank` payment marked credit | Every non-credit tender counts | code review |
| **P1** `shareToken` not unique | `unique: true, sparse: true` | schema |
| **GST inclusive** double-count | ex-tax subtotal aggregation; client mirror in lockstep | algo-tests (cart parity) + frontend audit |
| **#1 throughput bottleneck** | Invoice range-pre-allocation allocator (counter write removed from txn) | allocator unit test (no dup across workers) |
| Resilience | login rate-limit, pool tuning, HTTP timeouts, graceful shutdown, load-shed, `/api/ready` | code review |

### New findings from the verification pass
| Sev | Finding | Status |
|---|---|---|
| **P1 (regression, FIXED)** | `enforceResource` mapped read-style POSTs to `create`, wrongly blocking CA/manager/accountant on `POST /gst/reconcile/2a`, `/accounting/bank-reconciliation`, `/payroll/preview` | **Fixed** — tagged `requirePermission(resource,'read')`; verified 9/9 |
| **P1 (regression, FIXED)** | Stale `store.stateCode` ReferenceError in `createSale` after removing the in-txn store load (crashed sales for linked customers with no stateCode) | **Fixed** → `storeDoc.stateCode` |
| **P2** | Frontend double-submit on 3 buttons (inventory "Save serials", sales "Generate IRN", purchase row "Submit") — no in-flight disable | Open — see Frontend §below |
| **P2** | `GET /api/public/bill/:token` returns full `customerSnapshot` (email/address) — strips only `createdBy` | Open (pre-existing) |
| **P3** | `POST /products/:id/adjust-stock`, `/sales/:id/payment`, `/customers/:id/remind` gated as `create` → reachable by cashier (likely intended; confirm) | Open |

### Still open from the original audit (not yet done — mostly P2/hardening)
Money-as-float epsilon, immutable-doc schema guards (recordPayment still mutates sale), optimistic locking, refresh-token rotation, webhook replay idempotency, `select:false` on passwords, structured logging (Winston), per-route Zod/Joi, org-scoped unique fields, TTL indexes. These are tracked in [production-scaling-plan.md](production-scaling-plan.md) §4.

> **Net:** all original P0s and the financial P1s are fixed and test-verified; the verification pass found and fixed 2 P1 regressions it had introduced; remaining items are P2/P3 hardening + infrastructure. See the **Test results** section at the bottom.

---

## Executive summary

The system is **architecturally sound and unusually careful in places** — multi-tenant *data* isolation is correctly enforced from the JWT, the double-entry ledger balances on the happy path, the GST-inclusive math is consistent between client and server, payment webhooks (Razorpay) are signature-verified against raw bytes with constant-time compare, and secrets are masked on read and never overwritten by masked echoes.

The risk is concentrated in **three confirmed P0 issues** that should block production, plus a cluster of P1 correctness/immutability gaps:

| # | P0 (verified) | Effect |
|---|---|---|
| 1 | `Sale.idempotencyKey` is `unique, sparse` **but** `default: null`, and `createSale` writes `null` when no key is supplied ([Sale.js:151,161](../server/models/Sale.js#L151), [sale.service.js:323](../server/services/sale.service.js#L323)) | The **second** sale created without a client idempotency key throws `E11000` and the whole atomic sale aborts. Normal billing breaks. |
| 2 | JWT secret falls back to the hard-coded string `'your-secret-key'` ([auth.js:21](../server/middleware/auth.js#L21)) | If `JWT_SECRET` is unset in any env, anyone can forge a `super_admin` token and take over the entire platform. |
| 3 | `requirePermission` is wired into only 4 of ~25 routers; `blockWritesForReadOnlyRoles` blocks **only** the `ca` role ([matrix.js:149-152](../server/rbac/matrix.js#L149)) | A **cashier** can post journal vouchers, run payroll, pay suppliers, delete products, and rewrite store/GSP settings. The RBAC matrix is decorative for most of the API. |

**Recommendation:** fix the three P0s and the P1 ledger/immutability items (below) before onboarding real merchants. None require architectural change — they are contained fixes.

---

## P0 — Critical (verified by hand)

### P0-1 · Duplicate-key bug breaks normal billing
**`server/models/Sale.js:151,161` + `server/services/sale.service.js:323`**
`idempotencyKey: { type: String, default: null }` with `index({ idempotencyKey: 1 }, { unique: true, sparse: true })`. A sparse index still indexes documents where the field is **present with value `null`** — it only skips documents where the field is *absent*. Because the default writes an explicit `null` (and `createSale` also explicitly stores `null` when no key is passed), the first keyless sale succeeds and the **second throws `E11000`**, aborting the transaction.
**Fix:** Use a partial index instead of sparse, and stop writing `null`:
```js
saleSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
```
and in `createSale`, omit the field entirely when there's no key (don't set `null`).

### P0-2 · Hard-coded JWT secret fallback
**`server/middleware/auth.js:21`** — `const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';`
If `JWT_SECRET` is ever unset, tokens are signed/verified with a publicly known string. An attacker forges `{ userType: 'super_admin' }` and owns every tenant.
**Fix:** Fail closed at boot: `if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');` Remove the default everywhere (also in `.env.example`). Enforce a minimum length.

### P0-3 · RBAC not enforced on most write routes (privilege escalation)
**`server/rbac/matrix.js:149-152`; routers listed below**
`requirePermission` is imported only by `audit`, `stores`, `transfers`, `users` routers. The only authz applied globally is `blockWritesForReadOnlyRoles`, and `isReadOnlyRole` returns true **only for `ca`**. Every other role passes. Concretely, a **cashier** can:
- `POST /api/accounting/vouchers`, `/accounts`, `/party-settlements` — post arbitrary journal entries
- `POST /api/payroll/run/:period`, `/employees`, `mark-paid` — run payroll, mark salaries paid
- `POST /api/purchases/:id/pay | /grn | /return | /cancel` — pay suppliers, receive stock
- `DELETE /api/products/:id`, `POST /api/expenses`
- `PUT /api/store/me` — rewrite GSTIN, invoice prefix, **WhatsApp + GSP credentials/endpoints** ([store.routes.js](../server/routes/store.routes.js))

Routers missing `requirePermission`: accounting, sale, purchase, product, customer, supplier, gst, payroll, expenses, pos, store, reports.
**Fix:** Add `requirePermission('<resource>','<action>')` to every write handler (and restricted reads). Best implemented as a default-deny middleware mapping method→action per router, with per-route overrides. Do **not** rely on `blockWritesForReadOnlyRoles` as the authorization layer.

---

## P1 — High

### Financial correctness (engines + ledger)

- **P1 · Purchase receipt/return trust three independent money figures to balance.** [ledger.engine.js:200-249,457-509](../server/engines/ledger.engine.js#L200) — supplier payable is credited as `grandTotal` while debits sum to `subtotal + totalTax`. A discounted/freight PO silently breaks `Σ debits = Σ credits`. **Fix:** derive payable in-engine as `round2(subtotal + totalTax)`, or assert equality and throw.
- **P1 · Sale-return over-refunds GST-inclusive items.** [sale.service.js:440-443](../server/services/sale.service.js#L440) recomputes `subtotal = Σ basePrice` (gross) for the credit note, so for inclusive lines `subtotal − discount + tax` double-counts tax and the refund exceeds what the customer paid. **Fix:** build return totals from `taxableAmount`/`subtotalExTax` and `grandTotal = Σ returnedItems.totalAmount`, mirroring the cart.
- **P1 · `postVoucher` has no balance guard.** [ledger.engine.js:512-530](../server/engines/ledger.engine.js#L512) posts entries verbatim. Manual vouchers are the only human-entered Dr/Cr path; the engine should be the last line of defense for invariant #3. **Fix:** assert `|Σ Dr − Σ Cr| < 0.01` and reject `amount <= 0`/`NaN` before posting.
- **P1 · Self-heal seeds accounts outside the caller's session, then reads with the session.** [ledger.engine.js:32-50](../server/engines/ledger.engine.js#L32) — under snapshot isolation on Atlas the just-committed account may be invisible inside the in-progress transaction → spurious "not found after self-heal". Also `CACHED_BY_STORE` never invalidates (stale account `_id` after re-seed/rename). **Fix:** read the re-seeded account with `.session(null)`; add cache invalidation.

### Transaction flow & immutability (services)

- **P1 · `submit`/`preClose`/`cancel` mutate POs outside any transaction.** [purchase.service.js:229-264](../server/services/purchase.service.js#L229) — read-then-write with a plain `findOne`; a concurrent `cancel` + `receiveGrn` can interleave and discard received goods on the PO header while stock/ledger were already posted. **Fix:** load + re-check status + save inside `withTransaction`.
- **P1 · `recordPayment` mutates an immutable sale.** [sale.service.js:592-602](../server/services/sale.service.js#L592) pushes payments and rewrites `amountPaid`/`paymentStatus` on the sale doc — violates Non-Negotiable #4. **Fix:** derive payment state from ledger/payment docs, or formally accept the deviation and document it.
- **P1 · Supplier/Product writes not scoped to `storeId`.** [purchase.service.js:433-437,553-557,743-747](../server/services/purchase.service.js#L433) (`Supplier.updateOne({_id})`), [accounting.service.js:431-433](../server/services/accounting.service.js#L431) (`Product.find({_id:$in})`). ObjectId collisions are improbable, but this violates the stated defense-in-depth rule (§18). **Fix:** add `storeId` to every filter.
- **P1 · `sale.created` eventBus event is never emitted.** No `eventBus.emit` anywhere in the service layer — so the entire async post-sale pipeline (invoice PDF, low-stock alerts, report aggregates, WhatsApp) described in CLAUDE.md §8.1 step 7 never fires. **Fix:** emit `sale.created` after commit and wire the listeners (or confirm where this moved).

### Schema / multi-tenancy (models)

- **P1 · Passwords are not `select: false`.** [User.js:17](../server/models/User.js#L17), [TenantAdmin.js:25](../server/models/TenantAdmin.js#L25), [SuperAdmin.js:17](../server/models/SuperAdmin.js#L17) — any unprojected `find` loads the bcrypt hash; one careless endpoint leaks it. The hash hook itself is correct (factor 12, guarded). **Fix:** `select: false` + `.select('+password')` in the auth path only.
- **P1 · `Sale.shareToken` is indexed but not unique.** [Sale.js:78](../server/models/Sale.js#L78) — it backs the public un-authenticated bill URL; a collision serves the wrong customer's bill (PII leak). **Fix:** `{ unique: true, sparse: true }`.
- **P1 · `Customer (storeId, phone)` is not unique but services treat it as a key.** [Customer.js:20](../server/models/Customer.js#L20) vs [sale.service.js:164](../server/services/sale.service.js#L164) — concurrent warranty sales for a new phone create duplicate customer rows; outstanding/loyalty aggregation corrupts. **Fix:** unique sparse `(storeId, phone)`.
- **P1 · `Payment` model has no `storeId` and no model-cache guard.** [Payment.js:1-51](../server/models/Payment.js) — currently dead code (no importer), but if wired up it's a cross-tenant leak and throws `OverwriteModelError` on hot reload. **Fix:** add `storeId` + `mongoose.models.Payment ||` guard, or delete the file.
- **P1 · Staff `email` is globally unique, not org-scoped.** [User.js:15](../server/models/User.js#L15) — two tenants can't reuse a staff email; same email can also exist across `users`/`tenantadmins` causing ambiguous auth. **Fix:** scope to `(organizationId, email)` + cross-collection check on create.

### Security / integrations

- **P1 · No rate limiting anywhere — including login.** `server/middleware/rateLimit.js` exists but is imported by **zero** routes. Tenant + super-admin logins are unthrottled (contradicts §9.3's "20 auth attempts/hour"). **Fix:** apply to `/login` and `/super-admin/login`; back with Redis for the multi-instance deploy.
- **P1 · No refresh-token mechanism; 24h non-revocable access tokens.** [auth.routes.js:125](../server/routes/auth.routes.js#L125) signs `expiresIn: '24h'`; no `/refresh`, `/logout`, or blacklist. Role downgrades/grant removals aren't re-checked against the DB per request (claims come from the token). `isActive` *is* re-checked (partial mitigation). **Fix:** short-lived access + rotating refresh, or re-derive role/permissions from the DB in `authenticate`.
- **P1 · WhatsApp webhook "single enabled store" fallback → cross-tenant misattribution.** [webhooks.routes.js:43-49](../server/routes/webhooks.routes.js#L43) — when no WABA id matches, it guesses the only enabled store and writes status under the wrong `storeId`. **Fix:** require an explicit WABA-id match; never guess.
- **P1 · GSP `clientSecret` sent as an HTTP header on every IRN/cancel/EWB call.** [gsp-client.js:240-247,285-291,311-317](../server/services/einvoice/gsp-client.js#L240) — headers are far more likely to be logged by proxies/APM than bodies. **Fix:** make the secret-in-header opt-in per provider; rely on the Bearer token otherwise.
- **P1 · PhonePe webhook reads outcome from `decoded?.code`** [billing-public.routes.js:135](../server/routes/billing-public.routes.js#L135) — PhonePe's callback nests state under `data.state`/`responseCode`; if absent, paid subscriptions silently never activate. **Fix:** normalize both shapes; test against a real callback sample.

### Frontend

- **P1 · Offline-synthesized sale drops warranty data.** [pos/page.tsx:1709](../app/dashboard/pos/page.tsx#L1709) hardcodes `hasWarranty: false, warranties: []`. Warranty items *can* be sold offline (the cart enforces customer capture), but the printed bill then omits the warranty block and prints as a plain thermal receipt. **Fix:** derive `hasWarranty`/`warranties` from cart line `warrantyMonths` when synthesizing.

---

## P2 — Medium (condensed)

**Engines/services**
- 1-paisa CGST/SGST split drift on inclusive lines — split from `totalTax` first, not independently rounded halves ([gst.engine.js:31-39](../server/engines/gst.engine.js#L31)).
- `deductStock` has no own negative-stock guard; trusts a separate pre-check ([inventory.engine.js:31-59](../server/engines/inventory.engine.js#L31)). `adjustStock` runs outside a transaction (stock vs StockMovement can desync). `addStock` silently skips unknown products.
- Possible double stock deduction for serialized lines (`markSold` + `deductStock`) — [sale.service.js:333-348](../server/services/sale.service.js#L333) (verify).
- Initial-sale payment filter excludes `'bank'` mode → a fully-paid bank sale is marked `credit` ([sale.service.js:235](../server/services/sale.service.js#L235)).
- `returnPurchase` rewrites the original PO's `receivedQty`, damaging the audit trail ([purchase.service.js:749-754](../server/services/purchase.service.js#L749)).
- Payslip number via `countDocuments` is race/gap-prone; parallel runs can double-pay ([payroll.service.js:300-301](../server/services/payroll.service.js#L300)).
- Customer upsert runs outside the sale transaction → orphaned customer on abort ([sale.service.js:162-180](../server/services/sale.service.js#L162)).

**Models**
- Money stored as float `Number` across all financial docs — enforce epsilon comparison / consider integer paise. `LedgerEntry.amount`/voucher amounts lack `min: 0`.
- No TTL on `InviteToken.expiresAt`; no TTL on `AuditLog` (spec wants 7-year retention).
- `Store.code`, `StoreTransfer.transferNumber` globally unique instead of org-scoped.
- `BankAccount.currentBalance` is a mutable cached number that can drift from the ledger.

**Security**
- `uncaughtException` handler keeps the process alive in a corrupted state ([app.js:232-235](../server/app.js#L232)) — dangerous for a financial system; exit and let the orchestrator restart.
- Audit log readable by admin/manager/accountant, not super-admin-only as §9.4 states; not append-only at the DB layer.
- `PUT /store/me` mass-assignment surface is mostly whitelisted and secrets are mask-guarded, but the route lacks `requirePermission` (see P0-3).
- `DEBUG_API_ERRORS=1` returns raw message + stack frames to clients ([errorHandler.js:59-66](../server/middleware/errorHandler.js#L59)).
- Invite-accept password floor is 6 chars vs 8 elsewhere ([invites.public.routes.js:36](../server/routes/invites.public.routes.js#L36)).

**Integrations**
- No replay/idempotency protection on any webhook (Razorpay/PhonePe/WhatsApp); money path is saved only by the `status==='completed'` short-circuit; WhatsApp status webhook has none.
- IRN generation isn't atomically guarded — concurrent requests can burn two IRNs at NIC ([e-invoice.service.js:303-312](../server/services/e-invoice.service.js#L303)). Use a conditional `findOneAndUpdate`.
- WhatsApp send isn't idempotent — retries double-send and append duplicate audit rows ([sale.routes.js:137-192](../server/routes/sale.routes.js#L137)).
- Error `details.raw` may carry provider responses (and echoed secrets) into client/Sentry — whitelist fields, scrub auth-class errors.

**Frontend**
- `scan-bill` object URL leaked on unmount / on re-scan without reset ([scan-bill/page.tsx](../app/dashboard/scan-bill/page.tsx)).
- OCR line-item seeding races product load — dialog opens before `products` arrive → everything "unmatched" ([purchases/page.tsx:1095-1139](../app/dashboard/purchases/page.tsx#L1095)).

---

## P3 — Low / cosmetic (selected)

- `console.log`/`console.warn`/`console.error` instead of Winston in: [seedStoreAccounts.js:144](../server/services/seedStoreAccounts.js#L144), ledger self-heal, all webhook routes, and client print helpers — violates §18/§12.
- `round2` redefined per-function across engines; hoist to a shared util.
- Dead code: `void mongoose` in [expense.service.js:272](../server/services/expense.service.js#L272); typo'd GSTR section key `5A_BC2L` in [gst.service.js:388](../server/services/gst.service.js#L388); NIC-direct module is an intentional scaffold (all 501).
- `void userId` drops the actor on IRN/EWB generation — no `generatedBy` recorded.
- `extractLabeledAmount` "last number on line" can grab a rate instead of an amount on odd layouts; line-item regexes are bounded (no catastrophic ReDoS) but worth per-line anchoring.
- `Product.category` is a free-text string while a `Category` master with `categoryId` exists (schema drift vs §6.2).
- Public bill endpoint returns full `customerSnapshot` (name/phone/address/GSTIN) — by-design sharing, but a privacy note.

---

## What's done well (verified)

- **Multi-tenant *data* isolation is genuinely strong.** `storeId`/`organizationId` come from the verified JWT everywhere; the two client-supplied store ids (switch-store, user-create) are validated against grants. No route trusts `req.body.storeId`.
- **Double-entry balances on the core sale/payment path** — revenue absorbs integer round-off so `Σ Dr = Σ Cr` survives grand-total rounding.
- **GST-inclusive math is correct and the client mirror (`billing-local.ts`) is in exact lockstep** with `server/engines/gst.engine.js` across inclusive/exclusive/discount/intra-vs-inter-state/rounding — confirmed line-by-line.
- **No external HTTP call is made inside a Mongo transaction** — atomicity isn't violated by e-invoice/WhatsApp/payment integrations.
- **Razorpay webhook is properly verified** (HMAC-SHA256 over raw body, `timingSafeEqual`, refuses when secret unset).
- **Secrets are masked on read and not overwritten by masked echoes** (store WhatsApp/eInvoice, platform Razorpay/PhonePe). GSP token cache is correctly keyed `(storeId, environment)`.
- **E-invoice 24h cancel window, eligibility (B2B/GSTIN), and already-cancelled guards** are enforced.
- Frontend is careful about async cancellation, idempotent offline sync, graceful offline degradation, and object-URL cleanup (except the two noted spots).

---

## Recommended remediation order

1. **P0-1, P0-2, P0-3** — duplicate-key billing bug, JWT fallback, RBAC enforcement. Block production on these.
2. **P1 ledger correctness** — purchase payable derivation, sale-return inclusive refund, `postVoucher` balance guard.
3. **P1 immutability + transactions** — `recordPayment`/PO-status mutations, customer upsert in-session, `submit/cancel` in-transaction.
4. **P1 security** — login rate-limiting, refresh tokens (or per-request role re-derivation), WhatsApp webhook store-match.
5. **P1 schema** — password `select:false`, unique `shareToken`, unique `(storeId, phone)`, org-scoped emails.
6. **P1 frontend** — offline warranty data.
7. Work down P2/P3 as hardening.

---

## Coverage & limitations

- This audit is **static** — no tests were executed against a database, no live billing/ledger run, no penetration testing. Findings are from reading the code against the spec.
- Dynamic items from the prior QA run (write-path tests, 1000-item cart, concurrent cashiers, kill-mid-transaction, live external integrations) remain **unexecuted** and should be run against a disposable QA database.
- Some provider-shape findings (PhonePe callback fields, GSP header requirements) depend on the exact third-party contract and should be confirmed against real sandbox payloads.

*Generated from a six-way parallel subsystem review; the three P0s were re-verified directly against source.*
