# Radsting POS + ERP - Master Test Case Suite

This document maps the broad "complete billing software" test suite to the actual Radsting POS + ERP product. The detailed executable checklist remains `docs/test-cases.md`; this file is the high-level coverage index and gap tracker.

## Scope Mapping

| Area | Product fit | Detailed coverage | Notes / action |
| ---- | ----------- | ----------------- | -------------- |
| Authentication & Authorization | Covered | `docs/test-cases.md` sections 1, 2, 24, 27.1 | Tenant, CA, super-admin, invalid JWT, RBAC, subscription lock. |
| User Management | Covered | sections 17, 27.10 | Add/edit/disable/invite users, CA creation, role changes, invite accept flow. |
| Store / Branch Management | Covered | sections 3, 16, 27.9 | Radsting uses organizations, stores, branches, and warehouses. |
| Restaurant Management | Out of scope | N/A | Generic restaurant wording should be replaced with organization/store/branch tests. |
| Table Management | Out of scope | N/A | No table/floor/reservation module exists in the current web app. |
| KOT / Kitchen Orders | Out of scope | N/A | No kitchen display or KOT workflow exists in the current app. |
| POS Billing | Covered | sections 5, 6, 22, 27.2, 28, 32.7, 32.8 | Billing, barcode, payments, invoice, print, draft carts, public bill share. |
| Menu Management | Not applicable | section 7 covers products | In Radsting this is product/inventory catalogue management, not food-menu management. |
| Inventory Management | Covered | sections 7, 8, 10, 26, 27.3, 32.6, 32.12 | Products, HSN, stock movement, low stock, labels, valuation, invariants. |
| Purchase Order / GRN | Covered | sections 11, 27.4, 32.1, 32.2, 32.3, 32.10, 32.11 | PO, submit/cancel, GRN, ancillary costs, advances, supplier payable. |
| OCR / Invoice Scan | Covered | section 12 | Browser-side scan-bill flow and structured invoice extraction. |
| Supplier Management | Covered | sections 12, 27.5, 32.5 | Supplier list, supplier ledger, enriched supplier stats. |
| Expense Tracking | Covered | sections 15, 27.6, 32.10 | Expenses are voucher-backed accounting entries. |
| Reports & Analytics | Covered | sections 13, 14, 15, 27.6, 27.7, 27.8 | Dashboard, P&L, balance sheet, GST reports, insights, warehouse reports. |
| Notifications | Partial | sections 18, 19, 32.9 | WhatsApp/subscription/support covered. In-app notification center is not a separate module. |
| API Testing | Covered | sections 27, 32.11 | Keep endpoint names aligned with implemented routes. |
| UI / UX Testing | Covered | sections 3, 5, 16, 17, 20, 21, 22, 23, 28 | Manual browser pass still required per release. |
| Buttons & Navigation | Covered | section 31 plus module sections | Button behavior is spread across modules instead of one global checklist. |
| Cloud Sync | Partial | sections 26, 28, 32.7 | Offline outbox/sync status exists; add conflict-resolution rows if multi-device merge is introduced. |
| Offline Mode | Partial | sections 5, 26, 28, 32.7 | POS draft/local persistence covered; full offline sale replay needs staging validation. |
| Security Testing | Covered | sections 1, 2, 24, 27 | JWT, RBAC, cross-tenant access, XSS/NoSQL injection, PII redaction. |
| Performance Testing | Covered | sections 26, 29 | Load/perf gates exist; execute against staging before launch. |
| Database Validation | Covered | sections 25, 29, 32.12 | Transactions, ledger balance, stock movement and purchase invariants. |
| Electron / Desktop | Future scope | N/A | Current repo is web SaaS. Add Electron tests only if a desktop shell is introduced. |
| Mobile Responsiveness | Covered | sections 3, 5, 16, 20, 21, 28 | Manual visual pass needed on mobile/tablet. |
| Error Handling | Covered | section 28 plus per-module negative rows | API failure, invalid form input, network failure, payment failures. |
| Backup & Restore | Release gate | section 29 | Checklist item exists; implementation/drill evidence should live in ops runbook. |
| AI / OCR Invoice Processing | Partial | section 12 | Current extraction is OCR plus regex mapping. Add AI provider tests only when AI mapping is implemented. |

## Generic Checklist Items Not Present In Product

| Generic item | Current status | Decision |
| ------------ | -------------- | -------- |
| Waiter role | Not present | Use cashier, manager, accountant, CA, admin, tenant admin, and super-admin roles instead. |
| Table reservation, merge table, split table | Not present | Restaurant/table-service scope; do not test for retail POS release. |
| Kitchen order ticket and kitchen live updates | Not present | Restaurant/table-service scope; do not test for retail POS release. |
| Menu item image upload | Not present | Product catalogue supports product data; add image-upload tests only if product images are implemented. |
| `/api/bills` endpoints | Stale/generic | Radsting uses `/api/sales`, `/api/pos/*`, and public bill routes. |
| `/api/ocr/*` endpoints | Stale/generic | OCR currently runs browser-side via `/dashboard/scan-bill`; no backend OCR endpoint exists. |
| Electron auto-update / local DB | Not present | Future desktop release only. |

## Missing Test Rows To Add If Scope Expands

| ID | Trigger | Test to add |
| -- | ------- | ----------- |
| TC-OCR-200 | AI provider replaces regex extraction | Upload invoice, compare AI JSON schema to required purchase draft fields, verify confidence and fallback behavior. |
| TC-SYNC-200 | Multi-device offline conflict resolution is implemented | Same product stock edited on two offline clients; reconnect both; expected deterministic conflict policy and audit trail. |
| TC-BACKUP-100 | Backup tooling is implemented | Create backup, restore into fresh staging DB, compare counts and financial invariants. |
| TC-PERF-200 | Dedicated load harness exists | Simulate 100 concurrent billing sessions with seeded products; assert no duplicate invoice numbers and acceptable latency. |
| TC-UI-200 | Visual regression tooling is installed | Capture dashboard, POS, inventory, purchase, and settings at mobile/tablet/desktop widths; assert no overlap or unreadable text. |

## Execution Order

1. Run the smoke gate from `docs/test-cases.md` section 31.
2. Run all P1 test cases from authentication, POS, inventory, purchases, accounting, GST, security, and API contracts.
3. Run write flows only against a disposable QA/staging database.
4. Run the release gate from `docs/test-cases.md` section 29.
5. Record failures in the bug template from `docs/test-cases.md` section 30.
