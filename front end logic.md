# Frontend Logic — Reference

> **Scope** — every piece of business / state / utility logic that runs in the browser, across both the tenant frontend (`app/` + `components/` + `lib/` + `hooks/`) and the admin frontend (`POS system-admin/app/` + `…/components/` + `…/lib/`).
>
> **Why it's on the frontend** — three reasons recur throughout: (1) instant feedback before a server round-trip (cart math, HSN status), (2) offline-mode operation (POS queue), (3) auth/route gating (RBAC, subscription lock).
>
> **Generated**: 2026-05-12

---

## Table of Contents

1. [Auth & Session Lifecycle](#1-auth--session-lifecycle)
2. [RBAC Gates](#2-rbac-gates)
3. [Subscription & Plan-Limit Gating](#3-subscription--plan-limit-gating)
4. [POS Billing Math](#4-pos-billing-math)
5. [Validation](#5-validation)
6. [Filters / Search / Sort](#6-filters--search--sort)
7. [Print & Share](#7-print--share)
8. [Offline + Sync Queue](#8-offline--sync-queue)
9. [OCR + Bill Scan](#9-ocr--bill-scan)
10. [Barcode Scanning](#10-barcode-scanning)
11. [Sidebar Reshape Logic](#11-sidebar-reshape-logic)
12. [Settings Tab Navigation](#12-settings-tab-navigation)
13. [HSN Autocomplete Logic](#13-hsn-autocomplete-logic)
14. [Warehouse Dashboards & Insights](#14-warehouse-dashboards--insights)
15. [Client-Side Aggregations](#15-client-side-aggregations)
16. [Format Helpers](#16-format-helpers)
17. [Lock Screens (Expired / Blocked)](#17-lock-screens)
18. [WhatsApp / Payment / Share URL Composition](#18-whatsapp--payment--share-url-composition)
19. [Form State Patterns](#19-form-state-patterns)
20. [Theming](#20-theming)
21. [Admin Frontend Specifics](#21-admin-frontend-specifics)
22. [Cross-Cutting Patterns](#22-cross-cutting-patterns)
23. [What's Intentionally NOT on the Frontend](#23-whats-intentionally-not-on-the-frontend)

---

## 1. Auth & Session Lifecycle

### Login

- **Tenant**: `POST /api/auth/login` with `{ email, password }` → response `{ token, user }` → `localStorage.setItem('token', token)` + `localStorage.setItem('user', JSON.stringify(user))` → redirect to `/dashboard`. ([app/page.tsx](app/page.tsx))
- **Admin**: `POST /api/auth/super-admin/login` → response stored under `admin-token` + `admin-user` keys (different from tenant so both apps can coexist in one browser). Refuses any response where `user.userType !== 'super_admin'`. ([POS system-admin/app/page.tsx:38-67](POS system-admin/app/page.tsx))

### Token attachment

Every API call routes through [lib/api.ts:8-11](lib/api.ts) which reads `localStorage.getItem('token')` on every request and attaches it as `Authorization: Bearer <token>`. No interceptor framework — direct fetch wrapper.

```ts
function token(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}
```

### 401 handling

[lib/api.ts:101-105](lib/api.ts) — on any `401 Unauthorized` response, clears `localStorage('token', 'user')` and reloads `/`. No silent token refresh in this phase.

### `/auth/me` refresh

[app/dashboard/layout.tsx:60-76](app/dashboard/layout.tsx) — polls every 30s + on tab focus + on `visibilitychange`. Reads back `user`, `subscription`, `effective` (`'trial' | 'active' | 'expired' | 'blocked'`). Drives the subscription banner / lock screen.

[components/StoreSwitcher.tsx:28-46](components/StoreSwitcher.tsx) — also fetches `/auth/me` on mount, ignoring stale localStorage `user`, so a newly-granted branch shows up in the switcher without a re-login.

### Store switch

`POST /api/auth/switch-store/:id` → server issues a fresh JWT scoped to the new store + returns updated `user`. Frontend writes both to localStorage and **hard-reloads** the page so all cached queries / `useEffect` data refetches against the new store. ([StoreSwitcher.tsx:59-80](components/StoreSwitcher.tsx))

### Logout

[app/dashboard/layout.tsx:169-174](app/dashboard/layout.tsx) — clears `localStorage('token', 'user')` AND `sessionStorage('subscription-block')` then `router.push('/')`.

### "Is admin?" detection

[lib/rbac.ts:95-114](lib/rbac.ts) — `can(user, resource, action)` normalises the role (case-insensitive, `'superadmin'` → `'super_admin'`, `'auditor'` → `'ca'`) and checks against a hardcoded `MATRIX` mirror of the server RBAC matrix. `isReadOnly(user)` returns true only for `ca` role.

```ts
const r = normaliseRole(user?.role)
if (!r) return false
const grants = MATRIX[r]
for (const allowed of [grants['*'], grants[resource]].filter(Boolean)) {
  if (allowed.includes('*') || allowed.includes(action)) return true
}
return false
```

### Warehouse-mode detection

[lib/rbac.ts:133-137](lib/rbac.ts) — `isActiveWarehouse(user)`:

```ts
const active = user.stores.find(s => String(s._id) === String(user.storeId))
return active?.type === 'warehouse'
```

Used by Sidebar, Dashboard, Insights, Transfers, StoreSwitcher.

---

## 2. RBAC Gates

### Hidden-button pattern

Every actionable button is wrapped in `{can(me, '<resource>', '<action>') && <Button …/>}`. Server still re-checks — frontend just hides UI for things the user can't do.

Examples across the codebase:
- Sales page: `{can(me, 'sales', 'create') && <NewSaleButton />}` — cashier sees this, accountant doesn't
- Branches: `{can(me, 'store', 'create') && <NewBranchButton />}` — admin only
- Inventory: `{can(me, 'inventory', 'update') && <EditButton />}`
- Audit: page-level RBAC redirect if `!can(me, 'audit', 'read')`

### Sidebar role gates

[components/Sidebar.tsx:73-100](components/Sidebar.tsx) computes derived booleans once per render:
- `showOrgNav = can(me, 'users', 'read') || can(me, 'audit', 'read') || can(me, 'store', 'create')`
- `showAccounting = !warehouseMode && (can(me, 'accounting', 'read') || can(me, 'gst', 'read'))`
- `showInsights`, `showSettings`, `showPos`, `showSalesHistory`, etc.

Used to filter the `menuItems` array — never render hidden links at all.

### Page-level guard

Dashboard layout doesn't enforce per-page RBAC. Pages that need stricter gating (audit log, payroll, accounting reports) check `can()` and either redirect or show a "you don't have access" card.

---

## 3. Subscription & Plan-Limit Gating

### Effective status

`/auth/me` returns `subscription.effective` (one of `'trial' | 'active' | 'expired' | 'blocked'`). The dashboard layout reacts to it:
- `'trial'` + `daysRemaining <= 7` → `<SubscriptionReminder />` soft banner
- `'expired'` → `<SubscriptionExpiredScreen />` replaces the entire dashboard
- `'blocked'` → `<AccountBlockedScreen />` replaces the entire dashboard

### Soft 402 banner

[components/SubscriptionBanner.tsx:20-45](components/SubscriptionBanner.tsx) — reads the 402-write-rejection stamp from `sessionStorage('subscription-block')`. Auto-hides after 30s (assumes the user has now paid or that the next page refresh will pick up an active status). Polls `sessionStorage` every 5s to catch new blocks.

### Hard lock via Custom Event

When the API layer receives a 402 response, [lib/api.ts:122](lib/api.ts) does:
```ts
sessionStorage.setItem('subscription-block', JSON.stringify(detail))
window.dispatchEvent(new CustomEvent('subscription:block', { detail }))
```

The dashboard layout listens for this and immediately swaps to the lock screen, so the user isn't waiting 30s for the next `/auth/me` poll.

### Plan-limit badges

[lib/plan-limits.ts:24-72](lib/plan-limits.ts) — `PLAN_LIMITS` is hardcoded on the frontend so the "X of Y" badge can render instantly without a server round-trip:

```ts
PLAN_LIMITS = {
  free:       { stores: 1, warehouses: 0, users: { admin:1, ... } },
  starter:    { stores: 2, warehouses: 0, users: { ... } },
  pro:        { stores: 4, warehouses: 1, users: { ... } },
  enterprise: { stores: Infinity, warehouses: Infinity, ... }
}
```

`getEffectiveLimits(plan, customLimits)` layers `customLimits` (enterprise override) on top of the baseline. [components/PlanUsageBadge.tsx](components/PlanUsageBadge.tsx) consumes this for branches / users pages.

The frontend never enforces — server is authoritative — but the badge prevents the user from even clicking "New branch" when at cap.

---

## 4. POS Billing Math

[lib/billing-local.ts](lib/billing-local.ts) is a faithful mirror of `server/engines/billing.engine.js`. Same inputs → same numbers as the server.

### `buildCartLocal(items, productsById, ctx)`

Computes the entire cart locally so the POS UI updates on every keystroke without a network call.

```ts
for each item in cart:
  base       = sellingPrice × quantity
  discount   = type==='percent' ? base × pct/100 : flatDiscount
  taxableAmt = base − discount               (or extracted from gross if priceIncludesGst)
  isSameState = store.stateCode === customer.stateCode
  if (isSameState) {
    cgst = taxableAmt × gstRate/200
    sgst = taxableAmt × gstRate/200
    igst = 0
  } else {
    cgst = 0; sgst = 0
    igst = taxableAmt × gstRate/100
  }
  totalAmount = taxableAmt + cgst + sgst + igst

subtotal     = Σ base
totalDiscount= Σ discountAmount
totalTax     = Σ (cgst+sgst+igst)
grandTotal   = round(subtotal − totalDiscount + totalTax)
roundOff     = grandTotal − raw
```

Every intermediate rounds to 2 decimals so the FE never disagrees with the server total by even ₹0.01.

### Price-inclusive-of-GST handling

When `product.priceIncludesGst === true`:
```ts
taxableAmount = grossAfterDiscount / (1 + rate/100)
```
i.e. tax is extracted from the entered price. Otherwise it's added on top.

### Warranty customer-info gating

[app/dashboard/pos/page.tsx:77-148](app/dashboard/pos/page.tsx) — when any cart item has `warrantyMonths > 0`, the customer card becomes mandatory: name, phone, address fields are required. The "Save" button stays disabled until all three are filled. Server re-checks (CUSTOMER_REQUIRED / _PHONE_REQUIRED / _ADDRESS_REQUIRED) so this is just instant feedback.

### Save + Print orchestration

```ts
const [printAfterSave, setPrintAfterSave] = useState(false)
const [lastSale, setLastSale] = useState<Sale | null>(null)

useEffect(() => {
  if (lastSale && printAfterSave) {
    printInvoice(lastSale, store)
    setPrintAfterSave(false)
  }
}, [lastSale, printAfterSave, store])
```

"Save & Print" sets the flag + POSTs the sale. When the server response sets `lastSale`, the effect fires `printInvoice()`. Guarantees the bill is **persisted** before the print dialog opens.

### Customer search debounce

[app/dashboard/pos/page.tsx:106-123](app/dashboard/pos/page.tsx) — 250ms idle → `GET /customers?q=…&limit=8`. Clears timeout on unmount.

---

## 5. Validation

### GSTIN (15-char pattern)

[app/dashboard/settings/page.tsx](app/dashboard/settings/page.tsx) defines:

```ts
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
function isValidGstin(g) { return GSTIN_RE.test(g.trim().toUpperCase()) }
```

Live in-line error on the GST tab; save also blocks if registered + malformed.

### Pincode

`pincode.replace(/\D/g, '').slice(0, 6)` on every keystroke. Save validates `/^\d{6}$/`. Settings + Branches form.

### Phone

`phone.replace(/[^0-9+\-\s]/g, '')` — digits + `+` + `-` + space only.

### HSN/SAC (client-side mirror of `server/utils/hsn.js`)

Done via the `<HsnAutocomplete>` component which calls `GET /api/hsn/:code` and derives status:
- `verified` — format ok, in master, rate matches
- `rate_mismatch` — in master, rate differs from applied
- `unknown_hsn` — well-formed but not in master (warning only)
- `invalid_format` — fails the digit-count check

### Empty / required guards

Inline on every form. Pattern: `if (!form.name.trim()) { toast.error('…'); return }`. The save handler is the gatekeeper.

---

## 6. Filters / Search / Sort

Every list page does its filtering in the browser against an already-fetched array (no server-side filter param in most cases — the entire page-1 set comes back, and client filters it). Where pagination matters, page changes refetch.

| Page | Search by | Filter pills | Sort |
|---|---|---|---|
| Inventory | name / SKU / barcode | All / In stock / Low / Out / With warranty / Inactive | name asc, stock desc |
| HSN audit | name / SKU | All / Verified / Mismatch / Unknown / Invalid / Missing | by status |
| Sales | invoice # / customer | All / Paid / Credit / Partial / Returned / Today | createdAt desc |
| Warranties | customer name / phone | All / Active / Expiring ≤30d / Expired | expiresAt asc |
| Purchases | PO # / supplier | All / Draft / Ordered / Partial / Received / Closed / Cancelled | createdAt desc |
| Branches | name | All / Stores / Warehouses + registered/unregistered count | registered first, alpha |
| Expenses | narration | All / per-category pill (17 categories) | date desc |
| Admin Tenants | org / owner / GSTIN | All / Trial / Active / Expired / Blocked | createdAt desc |
| Admin Requests | text | Open / In progress / Resolved / Closed + priority + type | createdAt desc |
| Stock transfers | TRF # | All / requested / in_transit / received / cancelled | createdAt desc |

All filter pills follow the same UI primitive: rounded full button with count chip ([example](app/dashboard/branches/page.tsx)).

---

## 7. Print & Share

### `lib/print-invoice.ts`

iframe-based print pipeline. Two templates:
- **Thermal 80mm** for receipt printers (POS default)
- **A4 GST invoice** for legal/warranty bills (default when `hasWarranty: true`)

Document-title resolver:
```ts
if (sale.status === 'returned')       return 'CREDIT NOTE'
if (!store.gstRegistered)             return 'BILL OF SUPPLY'
if (sale.invoiceType === 'export_*')  return 'EXPORT INVOICE'
if (sale.invoiceType === 'sez_*')     return 'SEZ INVOICE'
return 'TAX INVOICE'
```

Tax columns are computed per supply context (intra-state CGST+SGST vs inter-state IGST vs bill-of-supply none).

Defensive layer:
- `safeSale` shallow copy if `sale.items` missing
- `fix2()` helper around every `.toFixed(2)` — never throws
- `it.productSnapshot?.…` optional chaining everywhere
- Top-level try/catch logs `[print-invoice] <name>: <msg> (invoice=…, format=…)` and alerts the user with the message instead of a stack trace

QR rendering: lazy `require('react-dom/server')` + `qrcode.react` so a Turbopack quirk on one entry can't take down the print. If QR generation fails, the bill still prints (without the QR).

### `lib/print-labels.ts`

Barcode labels for inventory. Generates a sheet of N copies via iframe + auto-print. Single inline template — no React, just HTML strings.

### `lib/print-gst.ts`

Formats GSTR-1 / GSTR-2 / tax summary as printable PDF. Used from `/dashboard/gst`.

### `lib/share-invoice.ts`

```ts
billShareUrl(token)   → `${origin}/bill/${token}`
whatsappLink(sale, store) → `https://wa.me/<phone>?text=<urlencoded msg>` or null
mailtoLink(sale, store)   → `mailto:<email>?subject=…&body=…` or null
copyToClipboard(text)     → navigator.clipboard.writeText(text)
```

Sale-detail dialog shows whichever channels have data: WhatsApp if customer phone exists, email if customer email exists, copy-link always, QR always (rendered with `qrcode.react`'s `<QRCodeSVG>`).

---

## 8. Offline + Sync Queue

### IndexedDB schema ([lib/offline-db.ts:1-101](lib/offline-db.ts))

Three object stores:
- `outbox` — pending mutations: `{ id, kind: 'sales:create', payload, display, createdAt, attempts, lastError, status }`
- `products` — master cache for offline lookup
- `meta` — bookkeeping (last sync time, etc.)

### Sync queue ([lib/sync.ts](lib/sync.ts))

```ts
outboxAdd(item)   // queue a sale when network is down
syncNow()         // coalesces concurrent calls, drains FIFO
subscribeSync(cb) // listen for {syncing, pending, lastDrainAt, lastError}
```

### Triggers

- `window.addEventListener('online', syncNow)`
- `document.addEventListener('visibilitychange', syncNow)` (tab focus)
- 30-second background interval
- Explicit `syncNow()` from the UI

### Visual indicators

- [SyncStatus.tsx:16-44](components/SyncStatus.tsx) — sidebar status pill ("Offline · N queued" / "N to sync" / "All synced")
- [OfflineBanner.tsx:14-42](components/OfflineBanner.tsx) — page-top banner on all pages except POS; POS shows a contextual variant

### Product cache (online)

POS page refreshes the product cache periodically via `useEffect([online])`. Offline lookups use the cached master via [billing-local.ts](lib/billing-local.ts)'s `productsById` map.

---

## 9. OCR + Bill Scan

### `lib/ocr.ts`

```ts
runOcr(file, onProgress) → { text, confidence (0..100), durationMs }
```

Tesseract.js in the browser (WASM, ~30 MB, lazy-imported on first use). Emits progress events `{ status, progress (0..1) }` so the UI can show a real loading bar.

### `lib/invoice-extractor.ts`

Pure-string regex extraction from the OCR'd text:
- Vendor GSTIN
- Invoice number + date
- Per-line: HSN, qty, rate, taxable, tax, total
- Subtotal + tax + grand total

Returns a `{ supplier, items, totals, confidence }` blob.

### Scan-bill page

[app/dashboard/scan-bill/page.tsx](app/dashboard/scan-bill/page.tsx) — upload → OCR progress → extracted form fields → user reviews + corrects → `POST /api/purchases` to create the PO draft. Reduces manual data entry by 90 %+ when the bill is reasonably clean.

---

## 10. Barcode Scanning

### `hooks/use-barcode-scanner.ts`

Global `keydown` listener that distinguishes machine scans from human typing:
- 6+ characters within 50ms inter-key gaps + Enter key → fire `onScan(code)`
- Slower delays → ignored as typing
- Skips when focus is in `<textarea>` or `[contenteditable]`

```ts
useBarcodeScanner({
  onScan: (code) => addProductByBarcode(code),
  minLength: 6,
  maxGapMs: 50,
  charPattern: /[A-Za-z0-9-]/,
})
```

### POS lookup

POS page hooks it up to auto-add to cart with qty=1. ([app/dashboard/pos/page.tsx:26](app/dashboard/pos/page.tsx))

### QR-capture mode

Inventory page enables "capture mode" with a longer maxLength and printable-ASCII pattern, so a product QR (which could be a URL or JSON) gets routed to the product-edit form's QR field instead of the global cart-lookup.

---

## 11. Sidebar Reshape Logic

[components/Sidebar.tsx](components/Sidebar.tsx) is a single render that does substantial work:

1. Calls `getCurrentUser()` once
2. Computes `warehouseMode = isActiveWarehouse(me)`
3. Derives all the show/hide booleans from `can()` checks
4. Builds the `menuItems[]` array conditionally
5. Tracks `openGroups: Record<string, boolean>` for expand/collapse
6. Highlights active group when `pathname.startsWith(basePath)`
7. Mobile hamburger toggles `isOpen` state from parent layout

The most consequential reshape is **warehouse mode**, which hides POS / Sales / Warranties / GST / Party-settlement / Customers entirely, leaving only Inventory + Stock transfers + Purchases + Insights + Organisation + Settings.

---

## 12. Settings Tab Navigation

### Deep-link via `?tab=`

```ts
const tabParam = useSearchParams()?.get('tab') || ''
const initialTab = TAB_KEYS.includes(tabParam) ? tabParam : 'business'
```

`/dashboard/settings?tab=whatsapp` opens directly on the WhatsApp config.

### Sticky vertical sidebar

10 tabs (business, logo, gst, preferences, whatsapp, einvoice, subscription, billing, help, documentation). On desktop, the sidebar is sticky-top via `md:sticky md:top-0`. On mobile, the tabs collapse to a horizontal scrolling pill row. Styles are unified via a single `TAB_TRIGGER_CLASS` constant — adding/removing tabs is one-line.

### Secret-input masking

[Settings page](app/dashboard/settings/page.tsx) — every password / access-token / client-secret input has:
- `type={show ? 'text' : 'password'}`
- Eye / EyeOff toggle button with `aria-label` and `title`
- Placeholder shows `(saved — paste new to replace)` when the field is masked (`startsWith('••')`)
- Save handler only sends the value to the server if it's NOT a mask (so refresh + save without typing doesn't clobber the real secret)

### Test connection (WhatsApp, e-invoice)

```ts
async function runTest() {
  await api.put('/store/me', { eInvoice: form })   // save first
  const result = await api.post('/store/einvoice/test', {})
  setTestResult(result)   // green panel with TTL info
}
```

Saves form before testing so the test exercises the values shown in the UI, not the previously-saved set.

---

## 13. HSN Autocomplete Logic

[components/HsnAutocomplete.tsx](components/HsnAutocomplete.tsx).

### Debounced search

```ts
useEffect(() => {
  if (!value.trim()) return
  setSearching(true)
  const t = setTimeout(async () => {
    const res = await api.get(`/hsn?q=${value}&limit=15`)
    setSuggestions(res.matches)
    setSearching(false)
  }, 200)
  return () => clearTimeout(t)
}, [value])
```

### Verification on commit

A separate 400ms debounced effect hits `/hsn/:code` to get format validation + prescribed rates. Status pill is computed:

```ts
status = !verification         ? 'idle'
       : !verification.format.valid          ? 'invalid'
       : verification.entries.length === 0   ? 'unknown'
       : appliedRate not in prescribedRates  ? 'rate_mismatch'
       : 'verified'
```

### One-tap rate fix

When status is `rate_mismatch`, an "Apply 18%" button appears next to the pill. Clicking it calls `onRateSuggest(prescribedRates[0])`, which the parent form binds to the product's `gstRate` setter. No modal.

### Inline cell on the inventory grid

Each row in the inventory table has a tiny status pill + a shield-icon **Verify** button → opens a focused dialog with master description, prescribed rate(s), one-click rate-fix. Reuses the same component.

---

## 14. Warehouse Dashboards & Insights

### `<WarehouseDashboard>` ([components/WarehouseDashboard.tsx](components/WarehouseDashboard.tsx))

Fetches `/api/reports/warehouse-dashboard` and renders:
- Stat cards: closing stock (at cost + at MRP), inbound units this month, outbound units this month
- Low-stock / out-of-stock banner
- Outbound pipeline table (requested + in_transit transfers)
- Recent inbound GRNs
- Top 10 stock holdings by value (sorted on server, displayed verbatim)
- Quick-action tiles (Inventory · Send to store · Receive PO · Insights)

### `<WarehouseInsights>` ([components/WarehouseInsights.tsx](components/WarehouseInsights.tsx))

Fetches `/api/reports/warehouse-insights`. Displays:
- Summary KPIs (dead-stock value, slow-mover value, top destination, stockout count)
- Top shipped SKUs (last 90 days)
- Top destination branches (last 90 days)
- Fast movers (lifetime out + transfer qty)
- Supplier reliability (avg lead time in days)
- Dead stock table
- Slow movers table
- Stockout incidents

The server does the aggregation; the component just renders. Filtering / re-sorting on top of the server response stays client-side.

### Routing logic

[app/dashboard/page.tsx](app/dashboard/page.tsx) and [app/dashboard/insights/page.tsx](app/dashboard/insights/page.tsx) both check `isActiveWarehouse(getCurrentUser())` and early-return the warehouse variant. Same /dashboard URL, different render. The retail-side data fetch is skipped entirely.

---

## 15. Client-Side Aggregations

A lot of "small" reporting math happens after data lands in the browser. This keeps the server endpoints simple (raw rows) and lets the UI re-aggregate on filter change without a refetch.

| Page | Computation |
|---|---|
| Sales history | `rows.reduce((s,r)=>s+r.grandTotal,0)` for filtered total |
| Sales P&L tab | per-bill margin = `Σ taxableAmount − Σ qty×purchasePrice` |
| Expenses page | `rows.reduce((s,r)=>s+r.amount,0)` + per-category bar |
| Inventory | low-stock / out-of-stock counts as derived booleans per row |
| HSN audit | summary counters derived from `rows[].status` |
| Warranty register | `daysLeft = ceil((expiresAt − now) / 86_400_000)` + active count / expired count / expiring-soon count |
| Insights | dead-stock value rollup |
| Branches | registered vs unregistered counts |
| Trial balance | `Σ Dr − Σ Cr` per account for the imbalance highlight |
| Closing stock tab | `Σ stock × purchasePrice` by category |

The pattern is: server gives **per-row** data, frontend gives **per-pill / per-card** summaries derived from the visible rows. This means filter changes never refetch.

---

## 16. Format Helpers

### Money (INR locale)

Spread across files but the pattern is consistent:
```ts
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
})
```

In `lib/print-invoice.ts` it's centralised; in component files it's usually re-defined inline.

### Numbers (en-IN locale)

```ts
const num = (n) => Number(n || 0).toLocaleString('en-IN')  // 1,00,000 not 100,000
```

### Dates

```ts
new Date(iso).toLocaleString('en-IN')                                       // long
new Date(iso).toLocaleDateString('en-IN')                                   // date only
new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) // short
```

### Amount-in-words

Only in `lib/print-invoice.ts::numberToIndianWords(n)`. Handles crore / lakh / thousand / rest with paise fallback ("Rupees Two Lakh Forty Five Thousand and Fifty Paise Only"). Not used outside the A4 print template.

### Time-left (warranty)

```ts
const daysLeft = (iso) => Math.ceil((new Date(iso).getTime() - now) / 86_400_000)
const months = Math.floor(daysLeft / 30)
const days = daysLeft % 30
// "5m 12d" or "12d"
```

---

## 17. Lock Screens

### Subscription expired

[components/SubscriptionExpiredScreen.tsx](components/SubscriptionExpiredScreen.tsx) replaces the dashboard when `effective === 'expired'`. Reads `NEXT_PUBLIC_VENDOR_*` env vars for contact CTAs. Shows:
- Org name pill
- Expiry date + days overdue
- Dynamic cycle toggle (monthly / yearly / 2-year) pulling published plans
- Per-plan pay button — chain: `plan.paymentUrl > org.paymentUrl > platform.gatewayUrl > /pay/upi/<ref>`
- Hourglass SVG with gradient body
- Logout

### Account blocked

[components/AccountBlockedScreen.tsx](components/AccountBlockedScreen.tsx) — replaces dashboard when `effective === 'blocked'`. Shows "Account suspended" message + vendor contact only. No pay button (vendor must un-block first).

### Trigger sources

Both can be triggered three ways:
1. `/auth/me` polling sees a status change
2. Any API call returns 402 → CustomEvent dispatched
3. Page-load `sessionStorage('subscription-block')` is present

---

## 18. WhatsApp / Payment / Share URL Composition

### WhatsApp

```ts
function normalisePhone(p) {
  const digits = String(p || '').replace(/\D+/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}
function whatsappLink(sale, store) {
  const phone = normalisePhone(sale.customerSnapshot?.phone)
  if (!phone) return null
  const msg = `Hi ${name}, your bill from ${store.name}:
Invoice: ${invoiceNumber}
Total: ₹${grandTotal}
${warranty ? 'Warranty included.' : ''}
View / save: ${billShareUrl(sale.shareToken)}`
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}
```

The WhatsApp Cloud API path (server-side `POST /sales/:id/whatsapp`) is the **automated** alternative — the wa.me link is the **free / manual** fallback when no API credentials are configured.

### UPI deep-link

[components/UserAddonRequest.tsx](components/UserAddonRequest.tsx), [collections/page.tsx](app/dashboard/collections/page.tsx), [pay/upi page](app/pay/upi/[reference]/page.tsx):
```ts
const upiUrl = `upi://pay?pa=${upiId}&pn=${storeName}&tr=${ref}&tn=${desc}&am=${amount}&cu=INR`
```

Rendered as a QR (via `qrcode.react`) on the `/pay/upi/[reference]` page so a customer can scan from their phone. Mobile users get a clickable button that triggers their UPI app.

### Razorpay / PhonePe redirect

Server creates the payment intent, returns a redirect URL. Frontend does `window.location.href = redirectUrl`. Callback comes back to `/api/billing/(razorpay|phonepe)/callback` which then redirects to `/dashboard/settings?tab=billing&payment=success`. The settings page detects the query param and shows a toast.

### Bill share URL

```ts
function billShareUrl(token) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
  return `${origin}/bill/${token}`
}
```

---

## 19. Form State Patterns

### Vanilla `useState`

The dominant pattern across the entire codebase:
```ts
const [form, setForm] = useState({
  name: '', code: '', address: { line1: '', city: '', ... }
})

<Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
```

Nested objects spread inline — no reducers, no Formik, no react-hook-form. Three reasons:
1. Forms are typically small (≤ 20 fields)
2. Save handlers are explicit (no auto-submit)
3. Per-field debounce / validation kept localised

### Derived state via `useMemo`

POS cart totals:
```ts
const totals = useMemo(
  () => buildCartLocal(lines, productsById, ctx),
  [lines, store, online]
)
```

### Memoised callbacks via `useCallback`

POS `addProduct` since it's called from the barcode scanner hook + manual click + offline queue path — all need a stable reference.

### Refs

```ts
const invoiceRef = useRef<HTMLDivElement>(null)   // for print iframe
const searchInputRef = useRef<HTMLInputElement>(null) // for auto-focus
const fileInputRef = useRef<HTMLInputElement>(null)   // hidden file picker
```

---

## 20. Theming

`components/theme-provider.tsx` wraps the app via Next.js' `<html suppressHydrationWarning>` pattern (likely `next-themes` under the hood). Dark-mode toggle isn't in a prominent UI location — comes via system preference or `localStorage` flip.

All component styles use Tailwind's `dark:` variants (~31 occurrences in the settings page alone). Status pills, cards, badges all have dark counterparts. No hardcoded greys.

---

## 21. Admin Frontend Specifics

### Login

[POS system-admin/app/page.tsx](POS system-admin/app/page.tsx) — same JWT shape as tenant but POSTs to `/auth/super-admin/login`. Refuses any user where `userType !== 'super_admin'`. Token stored under `admin-token` key.

### Dashboard layout

[POS system-admin/app/dashboard/layout.tsx](POS system-admin/app/dashboard/layout.tsx) — auth gate on mount: verifies token + user type before rendering children. "Checking your session…" loading state. Logout clears `admin-token` + `admin-user`.

### Plans CRUD

[POS system-admin/app/dashboard/plans/page.tsx](POS system-admin/app/dashboard/plans/page.tsx):
- Blank form template OR edit existing
- Fields: code, name, description, tier (free/starter/pro/enterprise), price, cycle (monthly/yearly/2-year), trial days, store cap, warehouse cap, per-role user caps, features array, paymentMethods toggles (UPI / card / netbanking / bank transfer / manual)
- POST or PUT depending on `editing` state
- Delete with confirmation

### Tenants CRUD

[POS system-admin/app/dashboard/tenants/page.tsx](POS system-admin/app/dashboard/tenants/page.tsx):
- Search by org / owner / GSTIN
- Filter by subscription status pills
- Inline org-level fields edit
- Subscription actions: start trial, activate, extend, cancel
- Toggle account active/inactive

### Support requests inbox

[POS system-admin/app/dashboard/requests/page.tsx](POS system-admin/app/dashboard/requests/page.tsx):
- Status / priority / type filter pills
- Counter strip (open / in_progress / resolved / closed)
- Detail dialog: thread of messages, status dropdown, priority dropdown
- Reply box

### Payment manager

[POS system-admin/app/dashboard/payments/page.tsx](POS system-admin/app/dashboard/payments/page.tsx):
- Manual payment creation
- Confirm / reject pending payments
- Delete failed records

### Settings page

[POS system-admin/app/dashboard/settings/page.tsx](POS system-admin/app/dashboard/settings/page.tsx) — platform-wide vendor config: payment gateway URL, contact info, plan defaults.

---

## 22. Cross-Cutting Patterns

### Debounce

Three places: customer search on POS (250ms), HSN autocomplete search (200ms), HSN verify (400ms). All use the same `setTimeout` + cleanup-on-unmount pattern, no third-party debounce lib.

### Custom events

`subscription:block` is the only cross-component custom event. Lets a 402 response anywhere in the app trigger an immediate dashboard-level reaction without prop drilling.

### Toast usage

`sonner` library. Wherever a server call happens:
```ts
try {
  await api.put('/store/me', form)
  toast.success('Saved')
} catch (err) {
  if (err instanceof ApiError) toast.error(err.message)
}
```

Errors carry NIC-translated messages already (e.g. e-invoice), so the toast is human-readable.

### Computed badges

Inline expressions on every list page:
```ts
{p.stock <= 0 ? <Badge variant="destructive">Out</Badge>
 : p.stock <= p.minStock ? <Badge className="bg-orange-500">Low</Badge>
 : <Badge variant="secondary">OK</Badge>}
```

### Optimistic updates

Used sparingly — only the offline POS queue adds optimistically (writes to IndexedDB, displays immediately, syncs in the background). Everything else is server-authoritative: action → API call → response → setState → render.

---

## 23. What's Intentionally NOT on the Frontend

Things the frontend deliberately doesn't compute, even though it could:

1. **Final invoice numbering** — server's per-store counter; can never be derived locally because of multi-cashier concurrency.
2. **IRN / Ack No / Signed QR** — all from NIC IRP (via GSP). Frontend just displays.
3. **Atomic transactions** — sale + stock + ledger writes are server-side. The offline queue replays as one call; the server still runs the atomic block.
4. **Ledger entries** — every Dr/Cr pair is server-derived from the source event. The frontend can't post entries directly.
5. **HSN master** — server's curated list (~600 entries). Frontend doesn't bundle a copy; it queries.
6. **Subscription state** — `effective` is derived server-side from `trialEndsAt`, `subscriptionEndsAt`, `isActive`. The frontend trusts the `/auth/me` response.
7. **Plan-limit enforcement** — `enforceStoreLimit()` server-side. The frontend just shows the X/Y badge so the user knows when they're near cap.
8. **Cross-store reports** — anything that joins data across stores (org-wide totals, supplier across branches) is server-aggregated.

The bright-line rule: anything that affects state on the server is computed by the server. The frontend computes for **display and instant feedback** only.

---

*End of reference — 2026-05-12*
