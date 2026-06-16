# Radsting POS &amp; ERP — Manual QA Test Cases

> **Version** 1.0 · **Date** 2026-05-18 · **Scope** Tenant POS, Super-admin portal, CA portal, public bill share, all background flows · **Status legend** `[ ]` pending · `[x]` pass · `[!]` fail (open bug) · `[-]` blocked · `[s]` skipped (out of scope this run)

This document is the canonical QA checklist for the Radsting POS application. Every meaningful page, button, API endpoint, RBAC rule, money flow and edge case has at least one test case. Each row is independently runnable. Failing cases must be filed as bugs before release.

---

## 0. Conventions

### 0.1 Test ID format

`TC-<MODULE>-<NNN>` — e.g. `TC-POS-014`, `TC-GST-203`. Module prefixes:

| Prefix | Module                            |
| ------ | --------------------------------- |
| AUTH   | Authentication & identity         |
| ONB    | Onboarding & store setup          |
| SET    | Settings tabs                     |
| POS    | POS / billing                     |
| SALE   | Sales history                     |
| INV    | Inventory / products              |
| HSN    | HSN audit                         |
| XFER   | Stock transfers                   |
| WARR   | Warranties register               |
| PUR    | Purchases / POs / GRNs            |
| PARTY  | Customers & suppliers             |
| BOOK   | Books / accounting / vouchers     |
| GST    | GSTR-1 / 3B / 9 / 2A / e-invoice  |
| RPT    | Reports & insights                |
| BRN    | Branches                          |
| USR    | Users & roles                     |
| SUB    | Subscription & billing            |
| WA     | WhatsApp                          |
| CA     | CA portal                         |
| ADM    | Super-admin (vendor) portal       |
| PUB    | Public bill share                 |
| KB     | Knowledge Base / documentation    |
| SEC    | Security & multi-tenancy          |
| ATOM   | Atomicity & transactional         |
| PERF   | Performance                       |
| API    | Raw API contract tests            |

### 0.2 Severity

| Severity | Meaning                                                                    |
| -------- | -------------------------------------------------------------------------- |
| **P1**   | Production blocker — release cannot proceed. Money, security, data loss.   |
| **P2**   | Major feature broken — workaround exists, but ship-blocking.               |
| **P3**   | Minor / cosmetic / edge-case — should be fixed but not release-blocking.   |
| **P4**   | Enhancement — desirable but not required.                                  |

### 0.3 Pre-conditions glossary

- **L1** logged in as tenant admin in an organisation with at least one active branch.
- **L2** logged in as cashier with no admin permissions.
- **L3** logged in as manager.
- **L4** logged in as accountant.
- **L5** logged in as CA via `/ca-portal`.
- **L6** logged in as super-admin via `/admin`.
- **L0** anonymous / unauthenticated.
- **D0** clean MongoDB — no data of any kind.
- **D1** seed data loaded (default demo store, sample products, a few historical sales).
- **D2** seed + active subscription on the org.

### 0.4 Test data fixtures

Tenant admin: `admin@example.com` / `password123`. CA: `ca@example.com` / `CaTest@123`. Super-admin: `radsting@pos.com` / `Admin@123`. State code `27` (Maharashtra). GSTIN `27AAAAA0000A1Z5`.

---

## 1. Authentication & Identity

### 1.1 Tenant login — `POST /api/auth/login`

| ID            | Pre-conditions  | Steps                                                              | Expected                                                                 | Sev | Status |
| ------------- | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | --- | ------ |
| TC-AUTH-001   | L0, D2          | Open `/`. Submit valid admin email + password.                     | 200, token + user in body, redirect to `/dashboard`.                     | P1  | `[ ]`  |
| TC-AUTH-002   | L0              | Submit valid email, blank password.                                | 401 INVALID_CREDENTIALS. Error visible on form.                          | P1  | `[ ]`  |
| TC-AUTH-003   | L0              | Submit unknown email.                                              | 401 INVALID_CREDENTIALS. No info-leak about email existence.             | P1  | `[ ]`  |
| TC-AUTH-004   | L0              | Submit valid email, wrong password.                                | 401 INVALID_CREDENTIALS. Same error text as TC-AUTH-003.                 | P1  | `[ ]`  |
| TC-AUTH-005   | L0              | Submit super-admin email `radsting@pos.com` to tenant endpoint.    | 401 — tenant endpoint never queries superadmins collection.              | P1  | `[ ]`  |
| TC-AUTH-006   | L0              | Submit email with leading/trailing whitespace.                     | Server trims; login succeeds if credentials correct.                     | P3  | `[ ]`  |
| TC-AUTH-007   | L0              | Submit email in mixed case `ADMIN@Example.com`.                    | Lowercased server-side; login succeeds.                                  | P3  | `[ ]`  |
| TC-AUTH-008   | L0              | Submit empty body `{}`.                                            | 400 VALIDATION_ERROR or 401 INVALID_CREDENTIALS. No 500.                 | P2  | `[ ]`  |
| TC-AUTH-009   | L0              | Submit email = `<script>alert(1)</script>@x.com`.                  | 401; no XSS triggered anywhere.                                          | P1  | `[ ]`  |
| TC-AUTH-010   | L0              | Submit `{"email":{"$ne":null},"password":"x"}` (NoSQL injection).  | 401; query is sanitised by Mongoose strict schema.                       | P1  | `[ ]`  |
| TC-AUTH-011   | L0              | 5 rapid wrong-password attempts.                                   | After threshold, rate limit triggers (429) or warning shown.             | P2  | `[ ]`  |
| TC-AUTH-012   | L1              | Inspect localStorage `token` after login.                          | JWT present, decodable, contains `id`, `role`, `userType`, `storeId`.    | P2  | `[ ]`  |
| TC-AUTH-013   | L1              | Inspect localStorage `user`.                                       | JSON object with `id`, `email`, `role`, `userType`, `stores[]`.          | P2  | `[ ]`  |
| TC-AUTH-014   | L0              | Inactive user (admin set `isActive=false`) attempts login.         | 403 ACCOUNT_DISABLED, not 401.                                           | P2  | `[ ]`  |
| TC-AUTH-015   | L0              | Org with expired subscription — admin attempts login.              | Login succeeds, but full-screen takeover with renewal message blocks UI. | P2  | `[ ]`  |
| TC-AUTH-016   | L0              | Tamper with JWT body and submit on any `/api/*` request.           | 401; signature check fails.                                              | P1  | `[ ]`  |
| TC-AUTH-017   | L0              | Use a valid token from another org.                                | 403 — `scopeToStore` middleware blocks cross-tenant access.              | P1  | `[ ]`  |

### 1.2 Super-admin login — `POST /api/auth/super-admin/login`

| ID            | Pre-conditions | Steps                                                  | Expected                                                              | Sev | Status |
| ------------- | -------------- | ------------------------------------------------------ | --------------------------------------------------------------------- | --- | ------ |
| TC-AUTH-050   | L0             | Open `/admin`. Submit valid super-admin credentials.   | 200; token saved as `admin-token`; redirect to `/admin/dashboard`.    | P1  | `[ ]`  |
| TC-AUTH-051   | L0             | Submit tenant admin credentials at `/admin`.           | 401 — super-admin endpoint only queries `superadmins`.                | P1  | `[ ]`  |
| TC-AUTH-052   | L6             | Try to call `/api/auth/switch-store/:id` as super-admin.| 400 NOT_APPLICABLE.                                                   | P2  | `[ ]`  |
| TC-AUTH-053   | L6             | Hit any tenant `/api/products` endpoint with super-admin token. | 403 or 200 with cross-tenant view (depending on intent — verify spec).| P1  | `[ ]`  |
| TC-AUTH-054   | L6             | Verify `admin-token` key vs `token` key are independent in localStorage. | Tenant and admin sessions can coexist in different tabs.          | P2  | `[ ]`  |

### 1.3 CA portal login + redirect

| ID            | Pre-conditions | Steps                                                              | Expected                                                                | Sev | Status |
| ------------- | -------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | --- | ------ |
| TC-AUTH-100   | L0             | Login as CA from `/`.                                              | After login, redirected to `/ca-portal`, not `/dashboard`.              | P1  | `[ ]`  |
| TC-AUTH-101   | L5             | Open `/dashboard` directly.                                        | Bounced to `/ca-portal` by dashboard layout.                            | P1  | `[ ]`  |
| TC-AUTH-102   | L5             | Click sidebar logout.                                              | localStorage cleared; redirect to `/`.                                  | P2  | `[ ]`  |
| TC-AUTH-103   | L0             | Open `/ca-portal` without token.                                   | Redirect to `/`.                                                        | P2  | `[ ]`  |
| TC-AUTH-104   | L1 (admin)     | Open `/ca-portal` as admin.                                        | Redirect to `/dashboard`.                                               | P2  | `[ ]`  |

### 1.4 `GET /api/auth/me` + token refresh

| ID            | Pre-conditions | Steps                                                      | Expected                                                                  | Sev | Status |
| ------------- | -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | --- | ------ |
| TC-AUTH-150   | L1             | Hit `/api/auth/me`.                                        | 200, returns `{user: {...}}` with current grants from DB (live, not JWT). | P2  | `[ ]`  |
| TC-AUTH-151   | L1             | Admin removes user from all stores → user hits `/me`.      | `user.stores` is empty array. UI hides StoreSwitcher.                     | P2  | `[ ]`  |
| TC-AUTH-152   | L1             | Token expired naturally.                                   | Next request returns 401; UI redirects to `/`.                            | P2  | `[ ]`  |
| TC-AUTH-153   | L0             | Hit `/api/auth/me` with no Authorization header.           | 401 UNAUTHENTICATED.                                                      | P1  | `[ ]`  |
| TC-AUTH-154   | L0             | Hit `/api/auth/me` with `Authorization: Bearer garbage`.   | 401 INVALID_TOKEN.                                                        | P1  | `[ ]`  |

### 1.5 Logout

| ID            | Pre-conditions | Steps                                                           | Expected                                                          | Sev | Status |
| ------------- | -------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | --- | ------ |
| TC-AUTH-200   | L1             | Click user menu → Logout.                                       | localStorage `token` + `user` cleared; redirect to `/`.           | P2  | `[ ]`  |
| TC-AUTH-201   | L1             | Logout, then click browser Back.                                | Dashboard does not load. Bounces to `/`.                          | P2  | `[ ]`  |
| TC-AUTH-202   | L5             | CA portal Logout → reopen CA portal directly.                   | Bounces to `/`.                                                   | P2  | `[ ]`  |

---

## 2. RBAC Matrix Enforcement

Each row asserts a role × action × module gate. Run with the matching `L*` precondition; attempt the action either via the UI or directly against the API.

| ID         | Role       | Module / Action            | Pre  | Expected                                                            | Sev | Status |
| ---------- | ---------- | -------------------------- | ---- | ------------------------------------------------------------------- | --- | ------ |
| TC-RBAC-001 | admin      | Create sale (POST /sales) | L1   | 200                                                                 | P1  | `[ ]`  |
| TC-RBAC-002 | manager    | Create sale              | L3   | 200                                                                 | P1  | `[ ]`  |
| TC-RBAC-003 | cashier    | Create sale              | L2   | 200                                                                 | P1  | `[ ]`  |
| TC-RBAC-004 | accountant | Create sale              | L4   | 403 FORBIDDEN                                                       | P1  | `[ ]`  |
| TC-RBAC-005 | ca         | Create sale              | L5   | 403 — `blockWritesForReadOnlyRoles` middleware                      | P1  | `[ ]`  |
| TC-RBAC-006 | cashier    | Void sale (POST :id/void)| L2   | 403 — needs `canVoidSale` permission                                 | P1  | `[ ]`  |
| TC-RBAC-007 | manager    | Void sale                | L3   | 200                                                                 | P1  | `[ ]`  |
| TC-RBAC-008 | cashier    | Edit product (PUT /products/:id) | L2 | 403                                                            | P1  | `[ ]`  |
| TC-RBAC-009 | manager    | Edit product             | L3   | 200                                                                 | P2  | `[ ]`  |
| TC-RBAC-010 | accountant | View P&L (GET /accounting/profit-loss) | L4 | 200                                                       | P2  | `[ ]`  |
| TC-RBAC-011 | cashier    | View P&L                 | L2   | 403                                                                 | P2  | `[ ]`  |
| TC-RBAC-012 | cashier    | List users               | L2   | 403                                                                 | P1  | `[ ]`  |
| TC-RBAC-013 | manager    | List users               | L3   | 403 — manager can't manage users                                    | P1  | `[ ]`  |
| TC-RBAC-014 | admin      | List users               | L1   | 200                                                                 | P1  | `[ ]`  |
| TC-RBAC-015 | ca         | Read sales register      | L5   | 200, but customer PII (phone/email/address) redacted                | P1  | `[ ]`  |
| TC-RBAC-016 | ca         | Read purchases register  | L5   | 200, PII redacted                                                   | P2  | `[ ]`  |
| TC-RBAC-017 | ca         | GET /api/store/me        | L5   | 200, customer phone/email/address fields masked                     | P2  | `[ ]`  |
| TC-RBAC-018 | ca         | Update store (PUT /store/me) | L5 | 403 — write blocked                                                | P1  | `[ ]`  |
| TC-RBAC-019 | ca         | Update product price     | L5   | 403                                                                 | P1  | `[ ]`  |
| TC-RBAC-020 | ca         | Manual stock adjustment  | L5   | 403                                                                 | P1  | `[ ]`  |
| TC-RBAC-021 | ca         | Create voucher           | L5   | 403                                                                 | P1  | `[ ]`  |
| TC-RBAC-022 | ca         | View audit log           | L5   | 403 — audit log is admin-only                                       | P1  | `[ ]`  |
| TC-RBAC-023 | admin      | View audit log           | L1   | 200                                                                 | P2  | `[ ]`  |
| TC-RBAC-024 | manager    | View audit log           | L3   | 403                                                                 | P2  | `[ ]`  |
| TC-RBAC-025 | cashier    | View dashboard KPIs      | L2   | 200 — read-only basic                                               | P2  | `[ ]`  |
| TC-RBAC-026 | cashier    | Apply discount > maxDiscountPct | L2 | 403 / blocked — per-user override enforced                       | P1  | `[ ]`  |
| TC-RBAC-027 | cashier    | Apply discount ≤ maxDiscountPct | L2 | 200                                                              | P2  | `[ ]`  |
| TC-RBAC-028 | admin      | Create CA via /users (direct flow) | L1 | 201 — new direct-create path                                    | P2  | `[ ]`  |
| TC-RBAC-029 | manager    | Create CA via /users      | L3   | 403                                                                  | P2  | `[ ]`  |
| TC-RBAC-030 | admin      | Invite CA (POST /users/invite) | L1 | 201                                                                | P2  | `[ ]`  |

---

## 3. Onboarding & Settings Landing

### 3.1 Settings landing grid

| ID         | Pre  | Steps                                                                                   | Expected                                                                              | Sev | Status |
| ---------- | ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --- | ------ |
| TC-ONB-001 | L1   | Open `/dashboard/settings` with no `tab=` param.                                        | Landing hero + 5 grouped sections (Store / Compliance / Comms / Billing / Support).   | P2  | `[ ]`  |
| TC-ONB-002 | L1   | Count cards on landing.                                                                 | Exactly 10 cards — Store profile, Logo, GST, Preferences, WhatsApp, E-Invoice, Subscription, Billing, Help, Knowledge Base. | P3 | `[ ]` |
| TC-ONB-003 | L1   | Click each card.                                                                        | URL updates to `?tab=<key>`; breadcrumb appears as `‹ Settings ▸ <Label>`.            | P2  | `[ ]`  |
| TC-ONB-004 | L1   | On a sub-page, click the "Settings" breadcrumb segment.                                 | URL clears `?tab`; landing grid re-renders.                                            | P2  | `[ ]`  |
| TC-ONB-005 | L1   | Browser Back from a sub-page.                                                            | Returns to landing; forward returns to the sub-page.                                   | P2  | `[ ]`  |
| TC-ONB-006 | L1   | Bookmark `/dashboard/settings?tab=whatsapp` and reopen later.                            | Lands directly on WhatsApp sub-page with breadcrumb.                                   | P3  | `[ ]`  |
| TC-ONB-007 | L1   | Open `/dashboard/settings?tab=unknown`.                                                  | Falls back to landing grid; no error.                                                  | P3  | `[ ]`  |
| TC-ONB-008 | L0   | Open `/dashboard/settings` without auth.                                                 | Redirects to `/`.                                                                      | P1  | `[ ]`  |
| TC-ONB-009 | L2   | Open Settings as cashier.                                                                | Sub-tabs visible per role permissions — cashier sees limited set or 403 page.          | P2  | `[ ]`  |

---

## 4. Settings Sub-Tabs

### 4.1 Store profile

| ID         | Pre  | Steps                                                                                       | Expected                                                                                  | Sev | Status |
| ---------- | ---- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --- | ------ |
| TC-SET-001 | L1   | Open Store profile sub-tab.                                                                 | Form populated from `/store/me`. All fields editable.                                     | P1  | `[ ]`  |
| TC-SET-002 | L1   | Clear store name, click Save.                                                               | Error toast "Store name is required". No save.                                            | P1  | `[ ]`  |
| TC-SET-003 | L1   | Set GSTIN to `BADGSTIN`, save.                                                              | Error toast "doesn't look like a valid GSTIN".                                            | P1  | `[ ]`  |
| TC-SET-004 | L1   | Set valid GSTIN `27AAAAA0000A1Z5`, save.                                                    | Success toast; `gstNumber` saved.                                                          | P1  | `[ ]`  |
| TC-SET-005 | L1   | On GST sub-tab set `gstRegistered=false`, return to Store profile.                          | GSTIN field becomes optional (no validation error on save).                               | P2  | `[ ]`  |
| TC-SET-006 | L1   | Phone field — type letters.                                                                 | Stripped; only digits, +, -, spaces accepted.                                              | P3  | `[ ]`  |
| TC-SET-007 | L1   | Pincode — type letters and special chars.                                                   | Numeric-only, max 6 digits.                                                                | P3  | `[ ]`  |
| TC-SET-008 | L1   | Pincode `12345` (5 digits), save.                                                            | Error "Pincode must be 6 digits".                                                          | P3  | `[ ]`  |
| TC-SET-009 | L1   | Change invoice prefix from `INV` to `BILL` and save.                                         | Saved. Next sale shows `BILL-...` invoice number.                                          | P2  | `[ ]`  |
| TC-SET-010 | L1   | Save, reload page.                                                                          | All edits persisted.                                                                       | P1  | `[ ]`  |
| TC-SET-011 | L1   | Network throttle to offline → click Save.                                                   | Error toast; no client-side phantom success.                                               | P3  | `[ ]`  |

### 4.2 Logo

| ID         | Pre  | Steps                                                                | Expected                                                                | Sev | Status |
| ---------- | ---- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-SET-050 | L1   | Open Logo sub-tab. Upload PNG ≤ 512 KB.                              | Preview shows immediately; saved on click Save.                          | P2  | `[ ]`  |
| TC-SET-051 | L1   | Upload PNG 600 KB.                                                   | Error "Logo must be under 512 KB".                                       | P3  | `[ ]`  |
| TC-SET-052 | L1   | Upload SVG.                                                          | Accepted.                                                                 | P3  | `[ ]`  |
| TC-SET-053 | L1   | Upload .docx file via DevTools (mime spoofed).                       | Server rejects with 400.                                                  | P2  | `[ ]`  |
| TC-SET-054 | L1   | Paste a remote `https://...` URL into the URL field, save.           | Saved; preview loads if URL is reachable.                                 | P3  | `[ ]`  |
| TC-SET-055 | L1   | Paste an invalid data URL (truncated).                               | Saved as-is or rejected — verify spec; no UI crash.                       | P3  | `[ ]`  |
| TC-SET-056 | L1   | Click Remove logo, Save.                                              | Logo cleared. Bills print without logo header.                            | P2  | `[ ]`  |

### 4.3 GST

| ID         | Pre  | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ---- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-SET-100 | L1   | Toggle GST registration OFF, save.                                     | Saved; new bills print as "Bill of Supply" instead of "Tax Invoice".    | P1  | `[ ]`  |
| TC-SET-101 | L1   | Toggle GST registration ON without GSTIN entered.                      | Save blocked with error.                                                | P1  | `[ ]`  |
| TC-SET-102 | L1   | Toggle composition scheme ON.                                          | Saved; flat 1% rate applied per spec.                                   | P2  | `[ ]`  |
| TC-SET-103 | L1   | Change default GST mode inclusive ↔ exclusive.                         | New cart totals computed accordingly.                                   | P2  | `[ ]`  |
| TC-SET-104 | L1   | Enter state code `99` (invalid).                                       | Server validation rejects or accepts — confirm spec; record behaviour.  | P3  | `[ ]`  |

### 4.4 Preferences

| ID         | Pre  | Steps                                                              | Expected                                                                          | Sev | Status |
| ---------- | ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --- | ------ |
| TC-SET-150 | L1   | Toggle `allowNegativeStock` ON.                                    | Sales with insufficient stock now succeed (test in POS).                          | P2  | `[ ]`  |
| TC-SET-151 | L1   | Set default low-stock threshold = 5, save.                         | New products inherit 5 as min stock.                                              | P3  | `[ ]`  |
| TC-SET-152 | L1   | Set default warranty months = 12.                                  | New products inherit 12 (still editable per product).                             | P3  | `[ ]`  |
| TC-SET-153 | L1   | Set print copies to 0.                                             | Validation: minimum 1.                                                            | P3  | `[ ]`  |
| TC-SET-154 | L1   | Enable loyalty + set rate.                                         | POS shows loyalty earn / redeem options.                                          | P2  | `[ ]`  |
| TC-SET-155 | L1   | Invoice footer free-text — paste long markdown.                    | Saves; renders on invoice without breaking layout.                                | P3  | `[ ]`  |
| TC-SET-156 | L1   | E-way bill threshold = -100.                                       | Validation rejects.                                                                | P3  | `[ ]`  |

### 4.5 WhatsApp

| ID         | Pre  | Steps                                                                              | Expected                                                                          | Sev | Status |
| ---------- | ---- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --- | ------ |
| TC-SET-200 | L1   | Open WhatsApp sub-tab, empty state.                                                | Form blank, status pill "Not configured".                                         | P3  | `[ ]`  |
| TC-SET-201 | L1   | Enter phoneNumberId + accessToken (real Meta creds), save.                         | Status pill switches to "Configured". `enabled` checkbox unlocks.                 | P2  | `[ ]`  |
| TC-SET-202 | L1   | Re-fetch via `/store/me`.                                                          | accessToken returns masked `••••••••<last4>`.                                      | P1  | `[ ]`  |
| TC-SET-203 | L1   | Save again WITHOUT changing the masked field.                                      | Real token preserved (not overwritten with mask).                                 | P1  | `[ ]`  |
| TC-SET-204 | L1   | Paste a new real token, save.                                                       | Real token replaced; new `<last4>` reflects.                                       | P2  | `[ ]`  |
| TC-SET-205 | L1   | Click "Test" with your own phone number.                                            | Meta Graph 200; toast "Test message sent"; phone receives it.                     | P1  | `[ ]`  |
| TC-SET-206 | L1   | Click "Test" with phoneNumberId wrong.                                              | Toast with Meta error code (e.g. `INVALID_PARAMETER`).                            | P2  | `[ ]`  |
| TC-SET-207 | L1   | Flip Enabled ON, then send a bill to a customer with phone.                         | API mode used; bill delivered without opening wa.me.                              | P1  | `[ ]`  |
| TC-SET-208 | L1   | Flip Enabled OFF.                                                                   | WhatsApp click falls back to wa.me mode.                                          | P2  | `[ ]`  |
| TC-SET-209 | L1   | Verify webhook section shows verifyToken + appSecret masked.                        | Both fields masked. Status pill shows webhook status if configured.               | P2  | `[ ]`  |
| TC-SET-210 | L1   | Click "Verify profile" button.                                                      | Fetches `verifiedProfile` from Meta; renders verified business name.              | P3  | `[ ]`  |
| TC-SET-211 | L1   | Set message template name + 4 body params, save.                                    | Saved; template path used for sends outside the 24-hour CS window.                | P2  | `[ ]`  |
| TC-SET-212 | L1   | Set defaultCountryCode `91`. Send bill to a 10-digit number `9876543210`.           | Server normalises to `919876543210`; Meta accepts.                                | P2  | `[ ]`  |
| TC-SET-213 | L1   | Send bill to `123` (less than 10 digits).                                            | 400 INVALID_PHONE.                                                                 | P3  | `[ ]`  |

### 4.6 E-Invoice

| ID         | Pre  | Steps                                                                                 | Expected                                                                          | Sev | Status |
| ---------- | ---- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --- | ------ |
| TC-SET-250 | L1   | Open E-Invoice sub-tab, empty state.                                                  | Provider dropdown = "mock". No real call possible.                                | P3  | `[ ]`  |
| TC-SET-251 | L1   | Switch to "GSP" provider, enter clientId + clientSecret + endpoint, save.             | Saved; secret returns masked.                                                     | P2  | `[ ]`  |
| TC-SET-252 | L1   | Click "Test connection".                                                              | POST to `/store/einvoice/test`; toast shows `{ok:true,provider:'gsp'}` or error. | P1  | `[ ]`  |
| TC-SET-253 | L1   | Provider = mock, run TC-SET-252.                                                       | Test returns `{ok:true,provider:'mock'}` without external call.                   | P2  | `[ ]`  |
| TC-SET-254 | L1   | Save provider as "nic" with bad RSA public key.                                        | Save accepts; Test connection returns clear error code.                           | P3  | `[ ]`  |
| TC-SET-255 | L1   | After config, ring a B2B sale (customer has GSTIN).                                    | IRN + signed QR returned; persisted on sale; printed.                             | P1  | `[ ]`  |
| TC-SET-256 | L1   | Force GSP outage (block via firewall), ring B2B sale.                                  | Sale still saves; IRN request retried in queue.                                   | P1  | `[ ]`  |

---

## 5. POS / Billing

### 5.1 Product lookup

| ID         | Pre   | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-POS-001 | L2,D1 | Scan a barcode of an active product.                                    | Item lands in cart in &lt;100ms.                                        | P1  | `[ ]`  |
| TC-POS-002 | L2,D1 | Scan barcode of an inactive product.                                    | Error toast "Product is inactive".                                      | P2  | `[ ]`  |
| TC-POS-003 | L2,D1 | Type partial SKU.                                                       | Live suggestion list. Enter selects top result.                          | P2  | `[ ]`  |
| TC-POS-004 | L2,D1 | Type product name.                                                      | Fuzzy match list.                                                       | P2  | `[ ]`  |
| TC-POS-005 | L2,D1 | Scan barcode that doesn't exist.                                        | Error toast "Not found"; no row added.                                  | P2  | `[ ]`  |
| TC-POS-006 | L2,D1 | Scan very long input (e.g. paste 200 chars).                            | Server rejects gracefully; no 500.                                       | P3  | `[ ]`  |
| TC-POS-007 | L2    | Disconnect network, scan barcode.                                       | Toast "Network error"; cart unchanged.                                   | P3  | `[ ]`  |
| TC-POS-008 | L2,D1 | Scan same item twice rapidly.                                           | Quantity becomes 2 (or two rows — confirm spec).                         | P3  | `[ ]`  |
| TC-POS-009 | L2,D1 | Search across multiple products via barcode buffer (use scanner emulator). | Buffer flushes correctly; only one item registered.                    | P2  | `[ ]`  |

### 5.2 Cart manipulation

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-POS-050 | L2,D1 | Add item, click qty +.                                                 | Quantity goes 1 → 2; line total recomputes.                              | P1  | `[ ]`  |
| TC-POS-051 | L2,D1 | Click qty − until qty = 0.                                              | Line removed.                                                            | P2  | `[ ]`  |
| TC-POS-052 | L2,D1 | Manually type qty = -3.                                                 | Rejected / clamped to 1.                                                 | P2  | `[ ]`  |
| TC-POS-053 | L2,D1 | Type qty = 9999.                                                        | Allowed if stock available; blocked if not (unless allowNegativeStock).  | P2  | `[ ]`  |
| TC-POS-054 | L2,D1 | Set line discount % = 10.                                               | Recompute: taxableAmount = basePrice × 0.9.                              | P1  | `[ ]`  |
| TC-POS-055 | L2,D1 | Set line discount flat = ₹50.                                           | taxableAmount = basePrice − 50.                                          | P1  | `[ ]`  |
| TC-POS-056 | L2,D1 | Set line discount > basePrice.                                          | Validation blocks save.                                                  | P2  | `[ ]`  |
| TC-POS-057 | L2,D1 | Apply bill-level discount.                                              | Distributed pro-rata across lines per spec.                              | P2  | `[ ]`  |
| TC-POS-058 | L2    | Click "Cancel cart" with items.                                         | Confirmation modal; on confirm, cart empties.                            | P2  | `[ ]`  |
| TC-POS-059 | L2    | Esc key with last-sale modal open.                                      | Modal closes; cart unaffected.                                           | P2  | `[ ]`  |

### 5.3 Customer & GST math

| ID         | Pre   | Steps                                                                   | Expected                                                                   | Sev | Status |
| ---------- | ----- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | --- | ------ |
| TC-POS-100 | L2,D1 | Leave customer empty (walk-in), add only non-warranty items.            | Save allowed.                                                              | P1  | `[ ]`  |
| TC-POS-101 | L2,D1 | Add a warranty-bearing item with walk-in customer.                      | Save blocked: CUSTOMER_REQUIRED with `details.warrantyLines`.              | P1  | `[ ]`  |
| TC-POS-102 | L2,D1 | Add warranty item + customer name only, no phone.                       | CUSTOMER_PHONE_REQUIRED.                                                   | P1  | `[ ]`  |
| TC-POS-103 | L2,D1 | Add warranty item + customer name + phone + no address.                 | CUSTOMER_ADDRESS_REQUIRED.                                                 | P1  | `[ ]`  |
| TC-POS-104 | L2,D1 | All required fields filled — warranty sale.                             | Save 200; warranties[] populated on sale.                                  | P1  | `[ ]`  |
| TC-POS-105 | L2,D1 | Customer same-state as store (state=27, store=27).                      | CGST + SGST split; IGST = 0.                                               | P1  | `[ ]`  |
| TC-POS-106 | L2,D1 | Customer different state (state=07, store=27).                          | IGST applied; CGST/SGST = 0.                                               | P1  | `[ ]`  |
| TC-POS-107 | L2,D1 | Customer with no state code (unregistered, same state).                 | Treated as intra-state by default.                                         | P2  | `[ ]`  |
| TC-POS-108 | L2,D1 | Mix items at 0%, 5%, 18%, 28%.                                          | Per-line tax computed correctly; totals add up.                            | P1  | `[ ]`  |
| TC-POS-109 | L2,D1 | Item with GST mode "inclusive".                                          | basePrice already includes GST; reverse-extract for taxable.               | P1  | `[ ]`  |
| TC-POS-110 | L2,D1 | Round-off: cart total ₹999.49.                                          | grandTotal = ₹999.00, roundOff = -₹0.49, finalAmount = ₹999.                | P2  | `[ ]`  |
| TC-POS-111 | L2,D1 | Cart total ₹999.51.                                                      | grandTotal = ₹1000.00, roundOff = ₹0.49.                                    | P2  | `[ ]`  |

### 5.4 Payment

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-POS-150 | L2,D1 | Pay full amount cash.                                                  | Sale saved; paymentStatus = paid.                                       | P1  | `[ ]`  |
| TC-POS-151 | L2,D1 | Pay full amount UPI, reference field optional.                         | Saved; reference stored.                                                | P1  | `[ ]`  |
| TC-POS-152 | L2,D1 | Pay full amount card with last-4.                                       | Saved; last-4 stored on payment leg.                                    | P2  | `[ ]`  |
| TC-POS-153 | L2,D1 | Split: ₹500 cash + ₹500 UPI for ₹1000 total.                            | Both legs saved; status = paid.                                          | P1  | `[ ]`  |
| TC-POS-154 | L2,D1 | Split: ₹400 cash + ₹400 UPI for ₹1000 total.                            | Validation: payments < grand total. Save blocked.                       | P1  | `[ ]`  |
| TC-POS-155 | L2,D1 | Pay ₹1100 cash for ₹1000 bill.                                          | Change ₹100 displayed; saved with ₹1100 paid.                            | P2  | `[ ]`  |
| TC-POS-156 | L2,D1 | Credit sale — customer with no credit limit.                            | Save blocked: customer required.                                         | P2  | `[ ]`  |
| TC-POS-157 | L2,D1 | Credit sale — customer with credit limit ₹500, bill ₹600.               | Blocked: CREDIT_LIMIT_EXCEEDED.                                          | P1  | `[ ]`  |
| TC-POS-158 | L2,D1 | Loyalty redeem — customer has 100 points, redeem rate ₹1/point.         | ₹100 deducted from bill total; points decremented.                       | P2  | `[ ]`  |
| TC-POS-159 | L2,D1 | Loyalty redeem more points than balance.                                | Blocked: INSUFFICIENT_LOYALTY.                                            | P2  | `[ ]`  |

### 5.5 Save & Print

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-POS-200 | L2,D1 | Click "Save".                                                           | Sale committed; last-sale modal opens.                                  | P1  | `[ ]`  |
| TC-POS-201 | L2,D1 | Click "Save & Print".                                                    | Sale committed; window.print() fires after response; bill is persisted before print dialog. | P1 | `[ ]` |
| TC-POS-202 | L2,D1 | Save & Print, then cancel print dialog.                                  | Sale already saved; visible in Sales History.                            | P2  | `[ ]`  |
| TC-POS-203 | L2,D1 | Disconnect network mid-Save.                                             | Error toast; cart preserved; no phantom sale.                            | P1  | `[ ]`  |
| TC-POS-204 | L2,D1 | Invoice number sequence — 3 sales in row.                                | 3 consecutive prefixed numbers, no gaps.                                 | P1  | `[ ]`  |
| TC-POS-205 | L2,D1 | Two cashiers (two tabs) save simultaneously.                             | Both succeed; invoice numbers differ; no clash.                          | P1  | `[ ]`  |
| TC-POS-206 | L2,D1 | 1000-line cart save.                                                      | Saves in &lt; 1s; UI doesn't freeze.                                     | P2  | `[ ]`  |
| TC-POS-207 | L2,D1 | After save, the last-sale modal shows: invoice #, total, share buttons, print button. | All elements visible.                                       | P2  | `[ ]`  |

### 5.6 Print preview

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-POS-250 | L2,D1 | Open invoice print preview, switch to 80mm.                              | Layout fits 80mm thermal; logo + store address + items + totals + IRN/QR if present. | P2 | `[ ]` |
| TC-POS-251 | L2,D1 | Switch to A4.                                                            | Full A4 invoice with item table, HSN summary, footer T&C.                | P2  | `[ ]`  |
| TC-POS-252 | L2,D1 | Print a bill from a GST-unregistered store.                              | Title "Bill of Supply"; no GST columns.                                  | P2  | `[ ]`  |
| TC-POS-253 | L2,D1 | Print warranty sale.                                                      | Title "TAX INVOICE (WARRANTY)"; dedicated Warranty block lists each line with expiry. | P1 | `[ ]` |
| TC-POS-254 | L2,D1 | Sale with IRN + signed QR.                                                | QR rendered; IRN string under invoice number.                            | P1  | `[ ]`  |

### 5.7 Share

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-POS-300 | L2,D1 | Click WhatsApp on a sale with customer phone (API mode off).             | wa.me URL opens in new tab with pre-filled message + bill link.          | P2  | `[ ]`  |
| TC-POS-301 | L2,D1 | WhatsApp on sale with no customer phone.                                  | Button disabled with tooltip.                                            | P3  | `[ ]`  |
| TC-POS-302 | L2,D1 | WhatsApp click with API mode ON.                                          | Server sends via Meta Graph; toast "Sent"; messageId in sale.whatsappSends. | P1 | `[ ]` |
| TC-POS-303 | L2,D1 | Email click with customer email.                                          | mailto: opens with subject + body + link.                                | P3  | `[ ]`  |
| TC-POS-304 | L2,D1 | Copy link.                                                                | Toast "Copied"; clipboard contains `https://.../bill/<token>`.            | P2  | `[ ]`  |
| TC-POS-305 | L2,D1 | QR.                                                                       | Inline QR rendered with the public URL.                                  | P3  | `[ ]`  |

---

## 6. Sales History

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-SALE-001 | L2,D1 | Open `/dashboard/sales`.                                              | Last N sales sorted desc by createdAt.                                  | P1  | `[ ]`  |
| TC-SALE-002 | L2,D1 | Search by full invoice number.                                         | Exact match found.                                                       | P2  | `[ ]`  |
| TC-SALE-003 | L2,D1 | Search by partial invoice number `2024`.                                | All matching invoices.                                                  | P3  | `[ ]`  |
| TC-SALE-004 | L2,D1 | Search by customer phone.                                              | Filters to that customer's bills.                                       | P2  | `[ ]`  |
| TC-SALE-005 | L2,D1 | Date filter — last 7 days.                                              | Only 7-day window shown.                                                | P2  | `[ ]`  |
| TC-SALE-006 | L2,D1 | Filter by status = "voided".                                            | Only voided sales.                                                       | P2  | `[ ]`  |
| TC-SALE-007 | L2,D1 | Open a bill detail.                                                      | Full item list + payments + customer + totals + IRN/QR if any.           | P2  | `[ ]`  |
| TC-SALE-008 | L2,D1 | Click Reprint on a bill.                                                 | Print dialog opens; document is the saved bill.                          | P2  | `[ ]`  |
| TC-SALE-009 | L2,D1 | Click Return; pick 1 of 3 items, save.                                   | Stock returned; ledger reversal; bill status = "returned" (partial).     | P1  | `[ ]`  |
| TC-SALE-010 | L2,D1 | Click Return on a voided sale.                                            | Blocked: cannot return voided.                                            | P2  | `[ ]`  |
| TC-SALE-011 | L3    | Void a bill as manager (write reason).                                   | Bill status = "voided"; reverse ledger voucher created.                  | P1  | `[ ]`  |
| TC-SALE-012 | L2    | Void as cashier.                                                          | 403.                                                                      | P1  | `[ ]`  |
| TC-SALE-013 | L1    | Void without reason.                                                      | Blocked.                                                                  | P2  | `[ ]`  |
| TC-SALE-014 | L1    | Export sales to Excel.                                                    | .xlsx downloads with current filters applied.                            | P2  | `[ ]`  |
| TC-SALE-015 | L1    | Export to CSV.                                                            | .csv downloads.                                                          | P3  | `[ ]`  |
| TC-SALE-016 | L1    | Reprint a bill from 2 years ago.                                          | Loads correctly; print works.                                            | P3  | `[ ]`  |
| TC-SALE-017 | L1    | Try to edit a saved bill via API directly.                                 | 405 or 403 — bills are immutable.                                         | P1  | `[ ]`  |

---

## 7. Inventory

### 7.1 Product list

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-INV-001 | L1,D1 | Open `/dashboard/inventory`.                                            | Product table loads with paginate.                                       | P1  | `[ ]`  |
| TC-INV-002 | L1,D1 | Search by name.                                                          | Fuzzy match.                                                              | P2  | `[ ]`  |
| TC-INV-003 | L1,D1 | Search by barcode.                                                       | Exact match.                                                              | P2  | `[ ]`  |
| TC-INV-004 | L1,D1 | Filter by category, brand, GST rate, low-stock.                          | Each filter independently and combined works.                            | P2  | `[ ]`  |
| TC-INV-005 | L1,D1 | Sort by stock ascending.                                                  | Low stock at top.                                                         | P3  | `[ ]`  |

### 7.2 Add product

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-INV-050 | L1    | Add product — name, SKU, HSN (valid), GST 18, MRP 100, sell 90, stock 10. | 201; row appears in list.                                                | P1  | `[ ]`  |
| TC-INV-051 | L1    | Add product with duplicate SKU.                                          | 409 DUPLICATE_SKU.                                                       | P1  | `[ ]`  |
| TC-INV-052 | L1    | Add product with no HSN.                                                  | Validation error "HSN required".                                          | P1  | `[ ]`  |
| TC-INV-053 | L1    | Add product with invalid HSN `99XX99` (not in master).                    | Validation error "HSN not recognised".                                    | P1  | `[ ]`  |
| TC-INV-054 | L1    | GST rate selector — pick each of 0/5/12/18/28.                            | Saves each correctly.                                                     | P2  | `[ ]`  |
| TC-INV-055 | L1    | Custom GST rate 7 (not on the list).                                       | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-INV-056 | L1    | MRP &lt; selling price.                                                    | Warning shown but save allowed.                                          | P3  | `[ ]`  |
| TC-INV-057 | L1    | Warranty months = 6.                                                       | Saved; product flagged warranty-bearing.                                  | P2  | `[ ]`  |
| TC-INV-058 | L1    | Negative opening stock.                                                    | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-INV-059 | L1    | Add product, then verify Inventory → Movements shows opening entry.        | Movement of type 'in' with reason "opening stock".                       | P2  | `[ ]`  |
| TC-INV-060 | L1    | Add variant within a product.                                              | Variant with its own barcode + price + stock saved.                      | P3  | `[ ]`  |
| TC-INV-061 | L1    | Bulk import via Excel template.                                             | Validates rows; success + error rows reported.                            | P2  | `[ ]`  |
| TC-INV-062 | L1    | Bulk import with 100 rows, 3 invalid.                                       | 97 created; downloadable error report for 3.                              | P2  | `[ ]`  |

### 7.3 Edit / delete / adjust

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-INV-100 | L1    | Edit product name + price.                                              | Saved; existing sales retain snapshot (immutable).                       | P1  | `[ ]`  |
| TC-INV-101 | L1    | Soft-delete (deactivate) a product.                                     | Hidden from POS lookup; visible in inventory with "inactive" badge.     | P2  | `[ ]`  |
| TC-INV-102 | L1    | Reactivate a deactivated product.                                       | Reappears in POS lookup.                                                 | P3  | `[ ]`  |
| TC-INV-103 | L1    | Manual stock adjustment +10 with reason "damaged recount".              | 200; StockMovement type 'adjustment' created with reason.                | P2  | `[ ]`  |
| TC-INV-104 | L1    | Manual stock adjustment to negative without `allowNegativeStock`.       | Blocked.                                                                  | P2  | `[ ]`  |
| TC-INV-105 | L1    | Adjustment without reason.                                              | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-INV-106 | L1    | Inventory → Movements → filter by product.                              | Complete history with timestamps + reference IDs.                        | P2  | `[ ]`  |
| TC-INV-107 | L1    | Low-stock page.                                                          | Lists every SKU with stock &lt; minStock.                                 | P2  | `[ ]`  |

---

## 8. HSN Audit Page

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-HSN-001 | L1,D1 | Open `/dashboard/inventory/hsn-audit`.                                  | Lists products grouped by HSN with verification status.                  | P2  | `[ ]`  |
| TC-HSN-002 | L1    | Run "verify all" action.                                                 | Each HSN checked against master; mismatches highlighted.                 | P2  | `[ ]`  |
| TC-HSN-003 | L1    | Click into a mismatch row.                                                | Suggested correct HSN; option to apply.                                  | P3  | `[ ]`  |

---

## 9. Stock Transfers

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-XFER-001 | L1,D1 | Org has 2+ branches. Create transfer from A to B with 5 units.         | 201; transfer pending.                                                  | P1  | `[ ]`  |
| TC-XFER-002 | L1    | Dispatch the transfer.                                                  | Source stock decrements; outbound StockMovement created.                 | P1  | `[ ]`  |
| TC-XFER-003 | L1    | Receive at destination.                                                  | Destination stock increments; inbound StockMovement created.             | P1  | `[ ]`  |
| TC-XFER-004 | L1    | Cancel transfer before dispatch.                                          | No stock movement; state = cancelled.                                    | P2  | `[ ]`  |
| TC-XFER-005 | L1    | Cancel after dispatch.                                                    | Blocked or requires reversal flow (per spec).                            | P2  | `[ ]`  |
| TC-XFER-006 | L1    | Dispatch more than source has.                                            | Blocked: INSUFFICIENT_STOCK.                                              | P1  | `[ ]`  |
| TC-XFER-007 | L1    | Try to receive a transfer at a branch the user isn't assigned to.         | 403.                                                                      | P1  | `[ ]`  |
| TC-XFER-008 | L1    | Inter-org transfer attempt (storeId from another org).                    | 403 — multi-tenant isolation.                                            | P1  | `[ ]`  |

---

## 10. Warranties

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-WARR-001 | L1,D1 | Open `/dashboard/warranties`.                                          | List of every warranty sold, with status (active/expired).              | P2  | `[ ]`  |
| TC-WARR-002 | L1    | Search by phone.                                                         | Lists all warranties for that customer.                                 | P2  | `[ ]`  |
| TC-WARR-003 | L1    | activeOnly filter.                                                       | Only non-expired warranties.                                            | P3  | `[ ]`  |
| TC-WARR-004 | L1    | Customer brings expired warranty item — claim flow.                      | Blocked or marked expired with explanation (per spec).                  | P3  | `[ ]`  |

---

## 11. Purchases

### 11.1 PO creation

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-PUR-001 | L1,D1 | New PO — supplier + 3 items, save as draft.                            | 201, status = draft.                                                    | P1  | `[ ]`  |
| TC-PUR-002 | L1    | Submit a draft.                                                          | Status → ordered.                                                       | P1  | `[ ]`  |
| TC-PUR-003 | L1    | Create with new supplier inline.                                          | Supplier created; PO references new supplierId.                          | P2  | `[ ]`  |
| TC-PUR-004 | L1    | PO with item where HSN missing.                                           | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-PUR-005 | L1    | PO with negative quantity.                                                | Rejected.                                                                  | P2  | `[ ]`  |

### 11.2 GRN

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-PUR-050 | L1    | Receive full quantity in one GRN.                                       | Status → received; stock incremented; ledger entries posted (Purchase, Input GST, Creditor). | P1 | `[ ]` |
| TC-PUR-051 | L1    | Receive partial — 5 of 10 units.                                          | Status → partial; receivedQty = 5; PO still open for 5 more.             | P1  | `[ ]`  |
| TC-PUR-052 | L1    | Second GRN of remaining 5.                                                 | Status → received.                                                       | P1  | `[ ]`  |
| TC-PUR-053 | L1    | Receive more than ordered.                                                 | Blocked: OVER_RECEIVED.                                                  | P1  | `[ ]`  |
| TC-PUR-054 | L1    | GRN with ancillary expense ₹500 = "landed cost".                            | Per-unit product cost recalculated to include freight.                   | P2  | `[ ]`  |
| TC-PUR-055 | L1    | GRN with ancillary expense ₹500 = "direct expense".                         | Booked to P&L Expense; product cost unchanged.                            | P2  | `[ ]`  |
| TC-PUR-056 | L1    | Atomicity — kill server between stock-in and ledger.                       | On restart, no half-applied state; manual review queue or rollback.      | P1  | `[ ]`  |
| TC-PUR-057 | L1    | Kill power mid-GRN — restart and check.                                     | No partial commit (Mongo transaction or snapshot/restore).               | P1  | `[ ]`  |
| TC-PUR-058 | L1    | View PO detail after multiple GRNs.                                          | receiptRefs[] shows each with GRN number.                                | P2  | `[ ]`  |

### 11.3 Payments & lifecycle

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-PUR-100 | L1    | Record full payment.                                                    | paymentStatus = paid; supplier outstanding reduced.                     | P1  | `[ ]`  |
| TC-PUR-101 | L1    | Record partial payment.                                                  | paymentStatus = partial.                                                | P2  | `[ ]`  |
| TC-PUR-102 | L1    | Payment via bank account selection.                                       | Right ledger entry (Bank A/c credited).                                 | P1  | `[ ]`  |
| TC-PUR-103 | L1    | Pre-close PO (partial received).                                          | Status → closed; remaining qty forgiven; no further GRN.                | P2  | `[ ]`  |
| TC-PUR-104 | L1    | Cancel PO with zero receipts.                                              | Status → cancelled.                                                      | P2  | `[ ]`  |
| TC-PUR-105 | L1    | Cancel PO with at least one receipt.                                       | Blocked: must pre-close instead.                                         | P2  | `[ ]`  |

### 11.4 Outstanding reports

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-PUR-150 | L1    | Open Outstanding by Supplier.                                           | Each supplier with open PO sum + value.                                 | P2  | `[ ]`  |
| TC-PUR-151 | L1    | Open Outstanding by Item.                                                | Each pending item with PO refs.                                          | P2  | `[ ]`  |
| TC-PUR-152 | L1    | Verify totals match raw PO data.                                          | Sums tally.                                                              | P2  | `[ ]`  |

---

## 12. Customers & Suppliers

### 12.1 Customers

| ID          | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ----------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-PARTY-001 | L1   | Create customer with name + phone.                                     | 201; phone is the unique key in this store.                              | P2  | `[ ]`  |
| TC-PARTY-002 | L1   | Create with same phone again.                                            | Upsert — existing record updated.                                        | P2  | `[ ]`  |
| TC-PARTY-003 | L1   | Edit credit limit.                                                       | Saved.                                                                    | P2  | `[ ]`  |
| TC-PARTY-004 | L1   | View customer ledger.                                                     | Every credit sale (Dr) and payment (Cr) with running balance.            | P1  | `[ ]`  |
| TC-PARTY-005 | L1   | Credit sale that breaches limit.                                          | Blocked at POS save.                                                     | P1  | `[ ]`  |
| TC-PARTY-006 | L1   | Customer GSTIN — invalid format.                                          | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-PARTY-007 | L1   | Customer with state code other than store's.                              | Future sales compute IGST.                                                | P1  | `[ ]`  |
| TC-PARTY-008 | L1   | Loyalty point earn after sale.                                             | Points = sale_amount × rate / 100.                                       | P2  | `[ ]`  |
| TC-PARTY-009 | L1   | Loyalty redeem — points deducted, journal entry posted.                    | Ledger balanced.                                                         | P2  | `[ ]`  |

### 12.2 Suppliers

| ID          | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ----------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-PARTY-050 | L1   | Create supplier with state code.                                       | 201.                                                                     | P2  | `[ ]`  |
| TC-PARTY-051 | L1   | Edit state code.                                                         | Affects future purchases (intra vs inter-state on input GST credit).     | P1  | `[ ]`  |
| TC-PARTY-052 | L1   | View supplier ledger.                                                     | GRNs (Cr) + payments (Dr) with running balance.                          | P1  | `[ ]`  |
| TC-PARTY-053 | L1   | Supplier with empty state code, purchase from them.                       | Falls back to intra-state per spec.                                      | P2  | `[ ]`  |
| TC-PARTY-054 | L1   | Outstanding balance shows on supplier card.                               | Matches ledger closing.                                                  | P2  | `[ ]`  |

---

## 13. Books — Accounting

### 13.1 Chart of accounts

| ID          | Pre  | Steps                                                                   | Expected                                                                 | Sev | Status |
| ----------- | ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | --- | ------ |
| TC-BOOK-001 | L1   | Open `/dashboard/accounting/accounts`.                                 | Tree of account groups + accounts.                                      | P2  | `[ ]`  |
| TC-BOOK-002 | L1   | Create account "HDFC Bank A/c" under Current Assets → Bank Accounts.     | 201.                                                                     | P1  | `[ ]`  |
| TC-BOOK-003 | L1   | Set opening balance ₹100,000.                                            | Opening entry posted; paired with Proprietor's Capital.                  | P1  | `[ ]`  |
| TC-BOOK-004 | L1   | Sum of asset openings = sum of liability+capital openings.                | Trial balance shows Σ Dr = Σ Cr at start.                                | P1  | `[ ]`  |
| TC-BOOK-005 | L1   | Edit account name.                                                        | Saved.                                                                    | P3  | `[ ]`  |
| TC-BOOK-006 | L1   | Delete an account with transactions.                                       | Blocked.                                                                  | P1  | `[ ]`  |
| TC-BOOK-007 | L1   | Create account in wrong nature group.                                      | Spec: allowed, but warning on saving an Asset under Liabilities group.   | P3  | `[ ]`  |

### 13.2 Vouchers

| ID          | Pre  | Steps                                                                   | Expected                                                                 | Sev | Status |
| ----------- | ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | --- | ------ |
| TC-BOOK-050 | L1   | Payment voucher: rent ₹15,000 Cash.                                     | 2 entries — Dr Rent Expense, Cr Cash. Σ Dr = Σ Cr.                       | P1  | `[ ]`  |
| TC-BOOK-051 | L1   | Voucher with Σ Dr ≠ Σ Cr.                                                 | Blocked: VOUCHER_UNBALANCED.                                              | P1  | `[ ]`  |
| TC-BOOK-052 | L1   | Receipt voucher: capital injection ₹500,000.                              | Dr Bank, Cr Proprietor's Capital.                                        | P1  | `[ ]`  |
| TC-BOOK-053 | L1   | Journal voucher: write-off bad debt.                                       | Dr Bad Debt Expense, Cr Sundry Debtors.                                  | P2  | `[ ]`  |
| TC-BOOK-054 | L1   | Contra voucher: cash deposit to bank ₹50,000.                              | Dr Bank, Cr Cash.                                                        | P2  | `[ ]`  |
| TC-BOOK-055 | L1   | Voucher number sequence — 3 payments in row.                                | PMT-YYYY-00001, 00002, 00003 sequential.                                 | P2  | `[ ]`  |
| TC-BOOK-056 | L1   | Edit a saved voucher.                                                       | Blocked — vouchers are immutable; create reversal.                       | P1  | `[ ]`  |
| TC-BOOK-057 | L1   | Delete a voucher.                                                            | Blocked.                                                                  | P1  | `[ ]`  |
| TC-BOOK-058 | L1   | Multi-leg journal: 3 debits + 2 credits balanced.                           | Saved.                                                                    | P2  | `[ ]`  |
| TC-BOOK-059 | L1   | Voucher with future date.                                                    | Spec: allowed or blocked? Record behaviour.                              | P3  | `[ ]`  |
| TC-BOOK-060 | L1   | Voucher with date before financial year start.                              | Allowed (e.g. backdated entry).                                          | P3  | `[ ]`  |

### 13.3 Statements

| ID          | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ----------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-BOOK-100 | L1,D1 | Open Trial Balance for current FY.                                     | Every account row with opening, Dr, Cr, closing. Σ Dr == Σ Cr.          | P1  | `[ ]`  |
| TC-BOOK-101 | L1,D1 | Date range = single day.                                                 | TB scoped to that day.                                                   | P2  | `[ ]`  |
| TC-BOOK-102 | L1,D1 | TB after 30 days of seed data.                                           | Σ Dr = Σ Cr (auto-balance via auto vouchers + opening pairs).            | P1  | `[ ]`  |
| TC-BOOK-103 | L1,D1 | P&L for the period.                                                      | Σ Income − Σ Expense = Net Profit (or Loss).                            | P1  | `[ ]`  |
| TC-BOOK-104 | L1,D1 | Balance Sheet at FY end.                                                  | Total Assets = Total Liabilities + Retained Earnings.                   | P1  | `[ ]`  |
| TC-BOOK-105 | L1,D1 | Day Book for current month.                                               | Every entry chronologically with voucher #.                              | P2  | `[ ]`  |
| TC-BOOK-106 | L1,D1 | Day Book filter by account.                                                | Only entries touching that account.                                      | P2  | `[ ]`  |
| TC-BOOK-107 | L1,D1 | Cash Flow bucketed by sale / payment / voucher.                            | Net cash flow = Σ all buckets.                                           | P2  | `[ ]`  |
| TC-BOOK-108 | L1,D1 | Bank Reconciliation: upload statement CSV with 50 entries.                  | Matched / In-Book-Not-In-Statement / In-Statement-Not-In-Book listed.    | P2  | `[ ]`  |
| TC-BOOK-109 | L1,D1 | Bank rec with statement amount differing by ₹0.005.                         | Matches within ₹0.01 tolerance.                                          | P3  | `[ ]`  |
| TC-BOOK-110 | L1,D1 | Export P&L to Excel.                                                        | Same numbers as on screen.                                               | P2  | `[ ]`  |

---

## 14. GST Returns & E-Invoice

### 14.1 GSTR-1

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-GST-001 | L1,D1 | Open GSTR-1 for current month.                                          | Top-level totals (Taxable, CGST, SGST, IGST, Total Tax) computed from 4A+5A+6A+6B+7−9B_CDNR−9B_CDNUR. | P1 | `[ ]` |
| TC-GST-002 | L1,D1 | Each section card shows row count + section totals.                      | Sections with 0 rows hidden.                                            | P2  | `[ ]`  |
| TC-GST-003 | L1,D1 | Section 8 (NilExempt) shows nil/exempt/nonGst breakdown.                  | Renders distinct shape correctly.                                       | P2  | `[ ]`  |
| TC-GST-004 | L1,D1 | Section 13 (Documents) shows invoice range from-to + cancelled count.    | Distinct shape.                                                         | P2  | `[ ]`  |
| TC-GST-005 | L1,D1 | Period with no sales.                                                     | Empty state "No outward supplies for YYYY-MM".                          | P2  | `[ ]`  |
| TC-GST-006 | L1,D1 | Bad period like `2026-13`.                                                | Server validation error; UI shows error card.                           | P3  | `[ ]`  |
| TC-GST-007 | L1,D1 | Click Export JSON.                                                         | File downloads with proper portal-ready JSON shape.                     | P1  | `[ ]`  |
| TC-GST-008 | L1,D1 | Export disabled when no data.                                              | Button greyed.                                                          | P3  | `[ ]`  |
| TC-GST-009 | L5    | Open GSTR-1 on CA portal.                                                   | Loads; PII (customerName in rows) may be redacted per spec.             | P1  | `[ ]`  |

### 14.2 GSTR-3B

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-GST-050 | L1,D1 | Open GSTR-3B.                                                            | Section 3.1 outward, 4 ITC, 6.1 net payable rendered.                   | P1  | `[ ]`  |
| TC-GST-051 | L1,D1 | Net Payable = output − ITC.                                              | Math matches summed sale + purchase tax.                                 | P1  | `[ ]`  |
| TC-GST-052 | L1,D1 | Section 3.1(d) shows RCM inward supplies if any.                          | Visible when non-zero.                                                  | P2  | `[ ]`  |
| TC-GST-053 | L1,D1 | Section 3.2 shows inter-state to unregistered taxable value.              | Sum matches B2C-Large + B2C-Small interstate.                            | P2  | `[ ]`  |

### 14.3 HSN summary & GSTR-9

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-GST-100 | L1,D1 | HSN summary for month.                                                  | One row per HSN-rate pair; quantity + value + tax.                       | P2  | `[ ]`  |
| TC-GST-101 | L1,D1 | GSTR-9 for FY.                                                            | Annual rollup; matches sum of 12 monthly 3Bs.                            | P2  | `[ ]`  |

### 14.4 GSTR-2A reconcile

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-GST-150 | L1,D1 | Upload 2A JSON for the period.                                          | Matched / mismatched lists; net ITC delta shown.                        | P2  | `[ ]`  |
| TC-GST-151 | L1,D1 | Upload malformed JSON.                                                    | 400 with clear message.                                                  | P3  | `[ ]`  |

### 14.5 E-Invoice / IRN

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-GST-200 | L1,D1 | E-invoice configured. Ring B2B sale.                                    | IRN + signed QR returned; persisted on sale; printed.                   | P1  | `[ ]`  |
| TC-GST-201 | L1    | E-invoice configured but turnover &lt; ₹5 Cr threshold flag.              | IRN flow skipped (or honoured if forced).                                | P2  | `[ ]`  |
| TC-GST-202 | L1    | GSP downtime.                                                             | Sale persists; IRN queued; retries periodically.                        | P1  | `[ ]`  |
| TC-GST-203 | L1    | GSP returns error 2150 (duplicate IRN).                                   | Existing IRN re-used; no new generation.                                 | P2  | `[ ]`  |
| TC-GST-204 | L1    | E-Way Bill threshold = ₹50,000 (default). Sale > threshold inter-state.   | EWB requirement flagged; UI prompts to generate.                         | P2  | `[ ]`  |
| TC-GST-205 | L1    | Sale below EWB threshold.                                                  | No EWB prompt.                                                            | P3  | `[ ]`  |

---

## 15. Reports

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-RPT-001 | L1,D1 | Dashboard home.                                                         | KPIs (today/week/month sales, gross profit, top SKUs, low stock count). | P2  | `[ ]`  |
| TC-RPT-002 | L1,D1 | KPI cache fresh after Redis flush.                                       | First load may be slower; subsequent loads &lt; 200ms.                  | P2  | `[ ]`  |
| TC-RPT-003 | L1,D1 | Sales report — filter by date range, customer, product, payment mode.    | Rows match filters.                                                     | P2  | `[ ]`  |
| TC-RPT-004 | L1,D1 | Profit report — per-SKU gross margin.                                     | (Selling − COGS − discount) per SKU.                                    | P2  | `[ ]`  |
| TC-RPT-005 | L1,D1 | Stock valuation by cost.                                                  | Σ (stock × purchasePrice) per product.                                   | P2  | `[ ]`  |
| TC-RPT-006 | L1,D1 | Stock valuation by MRP.                                                    | Σ (stock × MRP).                                                          | P2  | `[ ]`  |
| TC-RPT-007 | L1,D1 | Customer aging — buckets 0-30/31-60/61-90/90+.                             | Customers placed into correct buckets.                                   | P2  | `[ ]`  |
| TC-RPT-008 | L1,D1 | Purchase report.                                                            | Supplier-wise spend totals.                                              | P2  | `[ ]`  |
| TC-RPT-009 | L1,D1 | Branch comparison (multi-branch).                                            | Side-by-side KPIs.                                                       | P3  | `[ ]`  |
| TC-RPT-010 | L1,D1 | Export every report to Excel.                                                | .xlsx valid Excel.                                                       | P2  | `[ ]`  |
| TC-RPT-011 | L1,D1 | Reports for date range > 90 days.                                            | Loads in &lt; 3s; not blocked.                                            | P2  | `[ ]`  |
| TC-RPT-012 | L1,D1 | Date range crossing FY boundary.                                              | Handled gracefully.                                                       | P3  | `[ ]`  |

---

## 16. Branches

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-BRN-001 | L1    | Open `/dashboard/branches`.                                             | All branches in org listed.                                              | P2  | `[ ]`  |
| TC-BRN-002 | L1    | Create branch with name + GSTIN.                                          | 201; user auto-granted access.                                           | P1  | `[ ]`  |
| TC-BRN-003 | L1    | Create branch with duplicate code.                                         | 409 DUPLICATE_CODE.                                                       | P2  | `[ ]`  |
| TC-BRN-004 | L1    | Edit branch GSTIN.                                                          | Saved.                                                                    | P2  | `[ ]`  |
| TC-BRN-005 | L1    | Switch branch via StoreSwitcher.                                            | New JWT issued; page reloads; data scoped to new branch.                 | P1  | `[ ]`  |
| TC-BRN-006 | L2    | Cashier assigned to Branch A — try `/dashboard/products?storeId=B`.          | 403 — scope is from JWT, not query.                                       | P1  | `[ ]`  |
| TC-BRN-007 | L1    | Deactivate branch.                                                            | Hidden in switcher; data preserved.                                       | P2  | `[ ]`  |
| TC-BRN-008 | L1    | Reactivate branch.                                                             | Visible again.                                                            | P3  | `[ ]`  |
| TC-BRN-009 | L1    | Branch invoice prefix differs per branch.                                       | Each branch generates its own sequence.                                   | P1  | `[ ]`  |

---

## 17. Users & Roles

### 17.1 Listing

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-USR-001 | L1   | Open `/dashboard/users`.                                                | Users + pending invites tabs.                                            | P2  | `[ ]`  |
| TC-USR-002 | L1   | Count users.                                                              | Includes the admin themselves.                                          | P3  | `[ ]`  |
| TC-USR-003 | L1   | Plan-limit badge visible.                                                  | Shows X/Y per role.                                                      | P2  | `[ ]`  |

### 17.2 Create user (direct)

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-USR-050 | L1   | Click "Create user". Pick role = cashier.                               | Form opens.                                                              | P2  | `[ ]`  |
| TC-USR-051 | L1   | Submit valid cashier + password.                                          | 201; credentials confirmation panel.                                     | P1  | `[ ]`  |
| TC-USR-052 | L1   | Click "Copy credentials".                                                  | Clipboard contains email + password.                                     | P3  | `[ ]`  |
| TC-USR-053 | L1   | Try password &lt; 8 chars.                                                  | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-USR-054 | L1   | Email already exists.                                                       | 409 USER_EXISTS.                                                          | P1  | `[ ]`  |
| TC-USR-055 | L1   | Plan-limit hit for that role.                                               | 403 PLAN_LIMIT_EXCEEDED with upgrade hint.                                | P1  | `[ ]`  |
| TC-USR-056 | L1   | Pick role = CA. Submit valid name + email + password (no branch picked).    | 201; CA auto-granted every org store.                                    | P1  | `[ ]`  |
| TC-USR-057 | L1   | CA selected — branch checkboxes hidden, emerald note shown.                  | UI per implementation.                                                   | P2  | `[ ]`  |
| TC-USR-058 | L1   | "Generate strong" password button.                                            | 20-char strong password filled.                                          | P3  | `[ ]`  |
| TC-USR-059 | L1   | Toggle show/hide password.                                                     | Visible/hidden state matches icon.                                       | P3  | `[ ]`  |
| TC-USR-060 | L1   | Create with name field blank.                                                  | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-USR-061 | L1   | Branches multi-select for non-CA roles.                                         | Checked branches saved on user.                                          | P2  | `[ ]`  |
| TC-USR-062 | L1   | Create user across multiple branches.                                            | User's `storeIds[]` populated correctly.                                 | P2  | `[ ]`  |

### 17.3 Invite CA

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-USR-100 | L1   | Click "Invite CA". Enter name + email.                                    | InviteToken created; expiry 90 days.                                    | P1  | `[ ]`  |
| TC-USR-101 | L1   | Copy invite link.                                                          | Link is `/invite/<token>`.                                              | P2  | `[ ]`  |
| TC-USR-102 | L0   | Open `/invite/<token>` as anonymous.                                       | Public landing with set-password form.                                   | P1  | `[ ]`  |
| TC-USR-103 | L0   | Submit weak password.                                                       | Validation rejects.                                                       | P2  | `[ ]`  |
| TC-USR-104 | L0   | Submit strong password.                                                       | User record created; auto-login to `/ca-portal`.                         | P1  | `[ ]`  |
| TC-USR-105 | L0   | Reopen the invite link after acceptance.                                       | 410 INVITE_USED or similar.                                              | P2  | `[ ]`  |
| TC-USR-106 | L0   | Open expired invite (older than 90 days).                                       | 410 INVITE_EXPIRED.                                                       | P2  | `[ ]`  |
| TC-USR-107 | L0   | Tamper token (single char flip).                                                 | 404 INVITE_NOT_FOUND.                                                     | P1  | `[ ]`  |
| TC-USR-108 | L1   | View "Invites" tab in users page.                                                | All pending + expired invites listed.                                    | P3  | `[ ]`  |
| TC-USR-109 | L1   | Revoke a pending invite.                                                          | Token deleted; opening it returns 404.                                   | P2  | `[ ]`  |

### 17.4 Edit / deactivate / reset password

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-USR-150 | L1   | Edit user role from cashier to manager.                                  | Updated; user must re-login to refresh permissions (or live via /me).   | P2  | `[ ]`  |
| TC-USR-151 | L1   | Change user's branches.                                                    | StoreSwitcher updates after their next /auth/me refresh.                | P2  | `[ ]`  |
| TC-USR-152 | L1   | Set per-user maxDiscountPct = 5.                                            | Cashier blocked from applying &gt; 5% discount.                          | P1  | `[ ]`  |
| TC-USR-153 | L1   | Reset another user's password.                                              | New password set; user must use it next login.                          | P1  | `[ ]`  |
| TC-USR-154 | L1   | Edit themselves (admin).                                                     | Allowed.                                                                  | P2  | `[ ]`  |
| TC-USR-155 | L1   | Try to remove last admin.                                                     | Blocked: at least one admin required.                                    | P1  | `[ ]`  |
| TC-USR-156 | L1   | Deactivate a user.                                                             | isActive=false; user gets ACCOUNT_DISABLED at next login.                | P1  | `[ ]`  |
| TC-USR-157 | L1   | Reactivate a user.                                                              | Can log in again.                                                         | P2  | `[ ]`  |
| TC-USR-158 | L3   | Manager tries to edit a user.                                                    | 403.                                                                      | P1  | `[ ]`  |

---

## 18. Subscription & Billing

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-SUB-001 | L1    | Open Subscription sub-tab.                                              | Plan name, renewal date, user count, payment history visible.           | P2  | `[ ]`  |
| TC-SUB-002 | L1    | Request more users.                                                     | Ticket created in support inbox.                                         | P2  | `[ ]`  |
| TC-SUB-003 | L1    | Trial (status=trial) — banner.                                          | Yellow trial banner shows remaining days.                               | P2  | `[ ]`  |
| TC-SUB-004 | L1    | T-3 days before renewal — banner.                                        | Renewal-soon yellow banner across pages.                                | P2  | `[ ]`  |
| TC-SUB-005 | L1    | Org subscription expired today (no grace).                                | Red banner; subscriptionGuard returns 402 on writes.                    | P1  | `[ ]`  |
| TC-SUB-006 | L1    | Subscription expired + 3 days grace done.                                  | Full-screen takeover on `/dashboard`. Cannot bill.                       | P1  | `[ ]`  |
| TC-SUB-007 | L0    | Read-only mode — view past bills.                                          | Allowed.                                                                  | P2  | `[ ]`  |
| TC-SUB-008 | L1    | Renew (vendor marks paid in admin). Tenant reload.                          | Banner clears; access restored.                                          | P1  | `[ ]`  |
| TC-SUB-009 | L1    | Billing sub-tab.                                                              | Payment history with vendor invoices.                                    | P2  | `[ ]`  |
| TC-SUB-010 | L6    | Admin: Extend trial for tenant by 7 days.                                      | Tenant's trial extended.                                                 | P2  | `[ ]`  |
| TC-SUB-011 | L6    | Admin: Mark paid for tenant.                                                    | Tenant moves out of takeover state.                                      | P1  | `[ ]`  |
| TC-SUB-012 | L6    | Admin: Extend renewal by N months.                                                | Renewal date pushed.                                                     | P2  | `[ ]`  |
| TC-SUB-013 | L6    | Admin: Cancel subscription.                                                       | Tenant enters takeover state on next request.                            | P1  | `[ ]`  |

---

## 19. WhatsApp Cloud API (Send)

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-WA-001  | L1   | API mode disabled. Open POS sale → WhatsApp.                            | wa.me link opens.                                                       | P2  | `[ ]`  |
| TC-WA-002  | L1   | API mode enabled, valid creds. Send bill.                                | Meta returns messageId; appended to sale.whatsappSends.                 | P1  | `[ ]`  |
| TC-WA-003  | L1   | Send with broken token.                                                    | Toast with Meta error code + Fb trace id.                                | P2  | `[ ]`  |
| TC-WA-004  | L1   | Send outside 24-hr CS window, no template set.                              | Server rejects with reason "template required".                          | P2  | `[ ]`  |
| TC-WA-005  | L1   | Send with template + 4 body params.                                          | Template message delivered.                                              | P1  | `[ ]`  |
| TC-WA-006  | L1   | Phone less than 10 digits.                                                    | 400 INVALID_PHONE.                                                        | P2  | `[ ]`  |
| TC-WA-007  | L1   | Phone 10 digits — auto-prepend country code 91.                                | Server normalises before send.                                           | P2  | `[ ]`  |
| TC-WA-008  | L1   | Phone with +91 prefix.                                                          | Stripped + accepted.                                                     | P3  | `[ ]`  |
| TC-WA-009  | L1   | Test message POST `/store/whatsapp/test`.                                       | 200 with messageId.                                                       | P1  | `[ ]`  |
| TC-WA-010  | L1   | Test with overridden recipient.                                                  | Sent to override, not stored customer.                                   | P2  | `[ ]`  |
| TC-WA-011  | L1   | Webhook verification challenge from Meta.                                          | Server echoes hub.challenge for matching verifyToken.                    | P1  | `[ ]`  |
| TC-WA-012  | L1   | Webhook for incoming message.                                                       | Logged; status updates if delivery receipt.                              | P2  | `[ ]`  |
| TC-WA-013  | L1   | Re-send the same sale via WhatsApp twice.                                            | Two entries in whatsappSends; no duplicate suppression unless spec'd.    | P3  | `[ ]`  |

---

## 20. CA Portal

| ID        | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| --------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-CA-001 | L5   | Open `/ca-portal`.                                                       | Day Book page renders.                                                  | P1  | `[ ]`  |
| TC-CA-002 | L5   | Sidebar shows: Day Book, Trial Balance, P&L, Balance Sheet, Cash Flow, GSTR-1, GSTR-3B, Sales register, Purchase register. | All 9 links visible.       | P2  | `[ ]`  |
| TC-CA-003 | L5   | StoreSwitcher visible in sidebar.                                          | Branches user is granted appear.                                        | P2  | `[ ]`  |
| TC-CA-004 | L5   | Switch branch — POST /auth/switch-store.                                    | New JWT; page reloads; data scoped to new branch.                       | P1  | `[ ]`  |
| TC-CA-005 | L5   | Trial Balance loads.                                                         | Account-wise opening/Dr/Cr/closing.                                     | P1  | `[ ]`  |
| TC-CA-006 | L5   | P&L loads.                                                                     | Income − Expense = Net.                                                  | P1  | `[ ]`  |
| TC-CA-007 | L5   | Balance Sheet loads.                                                            | Assets = Liabilities + RE.                                               | P1  | `[ ]`  |
| TC-CA-008 | L5   | Cash Flow loads.                                                                  | Net inflow/outflow.                                                       | P2  | `[ ]`  |
| TC-CA-009 | L5   | GSTR-1 — happy path (after the page rewrite).                                       | Top totals + section breakdown render correctly per real API shape.      | P1  | `[ ]`  |
| TC-CA-010 | L5   | GSTR-3B — happy path.                                                                | Three-column summary + extras.                                            | P1  | `[ ]`  |
| TC-CA-011 | L5   | Sales register — search by date.                                                       | Sales list; customer phone/email/address redacted.                       | P1  | `[ ]`  |
| TC-CA-012 | L5   | Purchase register.                                                                       | Purchase list.                                                            | P2  | `[ ]`  |
| TC-CA-013 | L5   | Click anywhere — verify no Edit / Delete / Save buttons exist.                            | All write controls hidden.                                                | P1  | `[ ]`  |
| TC-CA-014 | L5   | Forge POST request directly to /api/products.                                              | 403 — blockWritesForReadOnlyRoles.                                       | P1  | `[ ]`  |
| TC-CA-015 | L5   | View a customer in sales register.                                                          | Name visible, phone/email/address replaced with `<redacted>`.            | P1  | `[ ]`  |
| TC-CA-016 | L5   | Visit any page — confirm audit log writes a `CA_VIEW` event.                                  | AuditLog row created for each CA page visit.                              | P2  | `[ ]`  |
| TC-CA-017 | L5   | CA logs out, returns to `/`. Re-login.                                                          | Lands again on `/ca-portal`.                                              | P2  | `[ ]`  |
| TC-CA-018 | L5   | Pick a branch with zero data.                                                                    | Empty states on every report page.                                       | P2  | `[ ]`  |

---

## 21. Super-admin (Vendor) Portal

### 21.1 Login & layout

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-ADM-001 | L0   | Open `/admin`. Login.                                                    | Stripe-style dashboard.                                                  | P1  | `[ ]`  |
| TC-ADM-002 | L6   | Sidebar groups: Growth, Revenue, Support, Platform.                       | All present.                                                              | P2  | `[ ]`  |
| TC-ADM-003 | L6   | Sidebar shows pending Support inbox count badge.                            | Matches DB unread.                                                        | P2  | `[ ]`  |
| TC-ADM-004 | L6   | Hover the avatar — sign-out link reveals.                                    | Clickable. Logout works.                                                  | P3  | `[ ]`  |

### 21.2 Tenants

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-ADM-050 | L6   | Open Tenants list.                                                       | All organisations with status badges.                                   | P1  | `[ ]`  |
| TC-ADM-051 | L6   | Create new tenant — name + admin email + plan.                            | 201; admin auto-credentialed.                                            | P1  | `[ ]`  |
| TC-ADM-052 | L6   | Edit a tenant's subscription.                                              | SubscriptionDialog opens, max-w-2xl, stat tiles + 4 ActionRows.          | P2  | `[ ]`  |
| TC-ADM-053 | L6   | Extend trial.                                                                | Trial end date pushed; verified on next /auth/me.                         | P2  | `[ ]`  |
| TC-ADM-054 | L6   | Mark paid.                                                                    | Status → active.                                                          | P1  | `[ ]`  |
| TC-ADM-055 | L6   | Extend renewal by 6 months.                                                     | RenewalAt += 6 months.                                                    | P2  | `[ ]`  |
| TC-ADM-056 | L6   | Cancel subscription.                                                              | Status → cancelled; tenant locked out.                                    | P1  | `[ ]`  |
| TC-ADM-057 | L6   | Block tenant.                                                                       | Auth fails for all tenant users.                                          | P1  | `[ ]`  |
| TC-ADM-058 | L6   | Unblock tenant.                                                                       | Auth restored.                                                            | P2  | `[ ]`  |

### 21.3 Plans

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-ADM-100 | L6   | Open Plans.                                                              | List of subscription plans.                                              | P2  | `[ ]`  |
| TC-ADM-101 | L6   | Create new plan.                                                           | 201.                                                                      | P2  | `[ ]`  |
| TC-ADM-102 | L6   | Edit plan price.                                                            | Saved.                                                                    | P2  | `[ ]`  |
| TC-ADM-103 | L6   | Delete a plan that is in use.                                                | Blocked: PLAN_IN_USE.                                                     | P1  | `[ ]`  |
| TC-ADM-104 | L6   | Set per-role limits (cashier max=10).                                         | Tenants on this plan respect limit.                                       | P1  | `[ ]`  |
| TC-ADM-105 | L6   | Customise limit for a specific tenant.                                          | additive customLimits stored; tenant sees adjusted ceiling.               | P2  | `[ ]`  |

### 21.4 Payments

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-ADM-150 | L6   | Payments list.                                                            | All payment intents + statuses.                                          | P2  | `[ ]`  |
| TC-ADM-151 | L6   | Filter by tenant + month.                                                  | Filtered list.                                                            | P3  | `[ ]`  |

### 21.5 Support requests

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-ADM-200 | L6   | Open Requests.                                                            | Inbox with unread badges.                                                | P2  | `[ ]`  |
| TC-ADM-201 | L6   | Open a thread — vendor view.                                                | Full thread with messages.                                                | P2  | `[ ]`  |
| TC-ADM-202 | L6   | Reply.                                                                       | Message appended; status promoted from open → in_progress.               | P1  | `[ ]`  |
| TC-ADM-203 | L6   | Change status to resolved.                                                     | Saved; tenant sees update on /help.                                       | P2  | `[ ]`  |
| TC-ADM-204 | L6   | Delete a request.                                                                | Deleted from DB.                                                          | P3  | `[ ]`  |

### 21.6 Platform users & settings

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-ADM-250 | L6   | Open Users (platform).                                                    | Super-admin list.                                                         | P2  | `[ ]`  |
| TC-ADM-251 | L6   | Create a second super-admin.                                                | 201.                                                                      | P2  | `[ ]`  |
| TC-ADM-252 | L6   | Open Settings (platform).                                                    | Vendor-wide config — payment gateway, brand, default user-addon price.    | P2  | `[ ]`  |
| TC-ADM-253 | L6   | Save platform settings.                                                       | Persisted; masked secrets retained.                                      | P1  | `[ ]`  |

### 21.7 Developer docs

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-ADM-300 | L6   | Open `/admin/dashboard/docs`.                                            | Developer docs (architecture, ledger map, GSP integration).             | P3  | `[ ]`  |
| TC-ADM-301 | L6   | TOC strip + sticky search.                                                 | All 17 sections.                                                          | P3  | `[ ]`  |

---

## 22. Public Bill Share

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-PUB-001 | L0   | Open `/bill/<valid-token>`.                                              | InvoicePreview renders.                                                  | P1  | `[ ]`  |
| TC-PUB-002 | L0   | Open `/bill/garbage`.                                                      | 404.                                                                      | P2  | `[ ]`  |
| TC-PUB-003 | L0   | Open `/bill/<voided-sale-token>`.                                           | Renders with "VOIDED" watermark or 404 per spec.                          | P3  | `[ ]`  |
| TC-PUB-004 | L0   | Switch 80mm / A4.                                                            | Same as cashier view.                                                     | P2  | `[ ]`  |
| TC-PUB-005 | L0   | Print.                                                                        | Browser print dialog.                                                     | P2  | `[ ]`  |
| TC-PUB-006 | L0   | Verify customer PII visible on the public page.                                | Customer name + masked phone? Spec — record.                              | P2  | `[ ]`  |
| TC-PUB-007 | L0   | Public page should NOT include createdBy or vendor PII.                          | Confirmed absent.                                                         | P1  | `[ ]`  |
| TC-PUB-008 | L0   | Public page outside `/dashboard/*` — no sidebar appears.                          | Standalone shell.                                                         | P3  | `[ ]`  |

---

## 23. Knowledge Base / Documentation

| ID        | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| --------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-KB-001 | L1   | Open Settings → Knowledge Base.                                          | Hero + sidebar + 17 sections.                                            | P2  | `[ ]`  |
| TC-KB-002 | L1   | Sidebar groups: Get Started, Daily Operations, Stock & Suppliers, Money & Compliance, Org Setup, Communication, Subscription, Tips & Help. | All 8 visible. | P3 | `[ ]` |
| TC-KB-003 | L1   | Scroll page; TOC pill + sidebar both highlight active section.            | Yes.                                                                      | P3  | `[ ]`  |
| TC-KB-004 | L1   | Click each sidebar item.                                                    | Scrolls to corresponding section.                                         | P2  | `[ ]`  |
| TC-KB-005 | L1   | All 17 sections render without console errors.                                | No JS errors.                                                             | P2  | `[ ]`  |
| TC-KB-006 | L1   | Code-blocks, KPI tiles, RoleMatrix all render.                                  | No layout breakage.                                                       | P3  | `[ ]`  |
| TC-KB-007 | L1   | Section IDs deep-linkable.                                                       | `?tab=documentation#kb-pos` scrolls there.                                | P3  | `[ ]`  |

---

## 24. Security & Multi-Tenancy

| ID         | Pre  | Steps                                                                   | Expected                                                                | Sev | Status |
| ---------- | ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-SEC-001 | L1   | Forge JWT with another org's organizationId, hit `/products`.            | 401 — signature mismatch.                                                | P1  | `[ ]`  |
| TC-SEC-002 | L1   | Use a valid token from Org A to hit `/sales/:id` of Org B sale.            | 403 NOT_FOUND or FORBIDDEN — never the data.                              | P1  | `[ ]`  |
| TC-SEC-003 | L1   | Sniff request — confirm Authorization header is TLS-encrypted.             | HTTPS only in prod; HSTS header present.                                 | P1  | `[ ]`  |
| TC-SEC-004 | L1   | POST `/sales` with `storeId` set to another store.                           | Middleware overwrites with JWT's storeId; data lands on correct store.   | P1  | `[ ]`  |
| TC-SEC-005 | L1   | Submit `<script>` in customer name.                                            | Stored as text; rendered escaped — no XSS.                                | P1  | `[ ]`  |
| TC-SEC-006 | L1   | Submit `{$gt:""}` in any query param.                                            | Mongoose strict schema rejects.                                          | P1  | `[ ]`  |
| TC-SEC-007 | L1   | Login attempts brute force — 20 attempts in 1 minute.                              | 429 + exponential backoff.                                                | P1  | `[ ]`  |
| TC-SEC-008 | L1   | Set password = "password".                                                          | Rejected (weak); minimum 8 chars enforced.                                | P1  | `[ ]`  |
| TC-SEC-009 | L1   | bcrypt — verify password hash is bcrypt with cost factor 12.                          | DB inspection confirms `$2b$12$...`.                                      | P1  | `[ ]`  |
| TC-SEC-010 | L1   | Browser DevTools — inspect localStorage.                                                 | Token stored; password never seen.                                       | P2  | `[ ]`  |
| TC-SEC-011 | L1   | Audit log entry for every void/discount/stock-adjust/user-create.                            | DB shows audit_logs row with before/after diff.                          | P1  | `[ ]`  |
| TC-SEC-012 | L1   | Audit log can be queried but never updated/deleted.                                            | DELETE / PUT against /api/audit/* — 405.                                  | P1  | `[ ]`  |
| TC-SEC-013 | L1   | Open a sale's customerSnapshot — confirm denormalised data.                                       | Data captured at sale time, immutable.                                   | P1  | `[ ]`  |
| TC-SEC-014 | L1   | Try to access `/api/platform/*` endpoints as tenant user.                                            | 403.                                                                      | P1  | `[ ]`  |
| TC-SEC-015 | L1   | requireSuperAdmin middleware blocks tenant on every platform route.                                     | Direct curl confirms.                                                     | P1  | `[ ]`  |
| TC-SEC-016 | L1   | Public bill URL token is unguessable (≥ 20 chars, base62).                                                | Brute force infeasible.                                                  | P2  | `[ ]`  |
| TC-SEC-017 | L1   | Refresh token rotation (if implemented) — same refresh used twice fails second time.                       | Spec — record.                                                            | P2  | `[ ]`  |
| TC-SEC-018 | L1   | Try CORS from a malicious origin.                                                                            | Server rejects unless origin is whitelisted.                              | P1  | `[ ]`  |

---

## 25. Atomicity & Concurrency

| ID          | Pre  | Steps                                                                    | Expected                                                                  | Sev | Status |
| ----------- | ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --- | ------ |
| TC-ATOM-001 | L1   | Sale save — kill MongoDB during the transaction.                          | Either fully committed or fully rolled back — no half state.              | P1  | `[ ]`  |
| TC-ATOM-002 | L1   | GRN save — kill server between stock-in and ledger.                        | Roll-back via Mongoose session.                                            | P1  | `[ ]`  |
| TC-ATOM-003 | L1   | Two concurrent sales of the last unit of a product.                          | Only one succeeds; the other returns INSUFFICIENT_STOCK.                  | P1  | `[ ]`  |
| TC-ATOM-004 | L1   | Two concurrent voucher creations — sequential voucher numbers.                | No duplicates; both committed sequentially.                                | P1  | `[ ]`  |
| TC-ATOM-005 | L1   | Concurrent invoice numbers from two cashiers.                                  | Sequence atomically allocated; no clash.                                    | P1  | `[ ]`  |
| TC-ATOM-006 | L1   | Sale with `eventBus.emit('sale.created')` consumer crashing.                       | Async side-effect failure does NOT roll back the sale.                     | P1  | `[ ]`  |
| TC-ATOM-007 | L1   | Same idempotency-key used on two concurrent POST /sales calls.                       | Second returns the first's response; no duplicate.                          | P2  | `[ ]`  |
| TC-ATOM-008 | L1   | Sale with 100 items, simulate timeout mid-transaction.                                 | Rollback; no partial sale.                                                  | P1  | `[ ]`  |

---

## 26. Performance

| ID          | Pre   | Steps                                                                  | Expected                                                                  | Sev | Status |
| ----------- | ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- | --- | ------ |
| TC-PERF-001 | L1,D1 | Barcode lookup — P95 latency.                                          | &lt; 50ms warm, &lt; 100ms cold.                                          | P1  | `[ ]`  |
| TC-PERF-002 | L1,D1 | Complete sale commit — P95.                                              | &lt; 500ms.                                                                | P1  | `[ ]`  |
| TC-PERF-003 | L1,D1 | Invoice PDF generation.                                                   | &lt; 1s.                                                                   | P2  | `[ ]`  |
| TC-PERF-004 | L1,D1 | Dashboard cached load.                                                     | &lt; 200ms.                                                                | P2  | `[ ]`  |
| TC-PERF-005 | L1,D1 | Monthly GST report.                                                          | &lt; 3s.                                                                   | P2  | `[ ]`  |
| TC-PERF-006 | L1,D1 | Stock report with 10K products.                                                | &lt; 2s.                                                                   | P2  | `[ ]`  |
| TC-PERF-007 | L1,D1 | 1000-line cart save.                                                            | &lt; 1s.                                                                   | P2  | `[ ]`  |
| TC-PERF-008 | L1,D1 | 50 concurrent sales (load test).                                                  | All complete; no timeout; lat &lt; 1s.                                     | P2  | `[ ]`  |
| TC-PERF-009 | L1,D1 | Redis flushed — first dashboard load.                                              | Fallback to Mongo aggregate; still &lt; 500ms.                              | P3  | `[ ]`  |

---

## 27. API Contract — Direct curl tests

(`$T` = JWT token, `$BASE` = `http://localhost:5000/api`)

### 27.1 Auth

| ID          | Curl                                                                                   | Expected                                | Sev | Status |
| ----------- | -------------------------------------------------------------------------------------- | --------------------------------------- | --- | ------ |
| TC-API-001  | `curl -XPOST $BASE/auth/login -d '{"email":"admin@example.com","password":"password123"}'` | 200, body has token + user             | P1  | `[ ]`  |
| TC-API-002  | `curl $BASE/auth/me -H "Authorization: Bearer $T"`                                       | 200, user with stores[]                | P1  | `[ ]`  |
| TC-API-003  | `curl -XPOST $BASE/auth/switch-store/$BAD_ID -H "Authorization: Bearer $T"`               | 403 STORE_NOT_GRANTED                  | P1  | `[ ]`  |
| TC-API-004  | `curl -XPOST $BASE/auth/super-admin/login -d '{"email":"radsting@pos.com","password":"Admin@123"}'` | 200 token                              | P1  | `[ ]`  |

### 27.2 Sales

| ID          | Curl                                                                                    | Expected                              | Sev | Status |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------- | --- | ------ |
| TC-API-050  | `curl $BASE/sales -H "Authorization: Bearer $T"`                                          | 200 + paginated list                  | P1  | `[ ]`  |
| TC-API-051  | `curl $BASE/sales/$ID -H "Authorization: Bearer $T"`                                      | 200 + full sale doc                   | P1  | `[ ]`  |
| TC-API-052  | `curl -XPOST $BASE/sales -d @sale.json -H ...`                                             | 201 with invoiceNumber                | P1  | `[ ]`  |
| TC-API-053  | `curl -XPUT $BASE/sales/$ID -d '{}' -H ...`                                                  | 405 METHOD_NOT_ALLOWED                | P1  | `[ ]`  |
| TC-API-054  | `curl -XPOST $BASE/sales/$ID/return -d @return.json -H ...`                                    | 201 reversal                          | P1  | `[ ]`  |
| TC-API-055  | `curl -XPOST $BASE/sales/$ID/void -d '{"reason":"test"}' -H ...` (admin)                          | 200                                   | P1  | `[ ]`  |
| TC-API-056  | `curl -XPOST $BASE/sales/$ID/whatsapp -H ...`                                                       | 200 with messageId                    | P1  | `[ ]`  |
| TC-API-057  | `curl $BASE/sales/warranties?phone=$PHONE -H ...`                                                     | 200 with warranty rows                | P2  | `[ ]`  |
| TC-API-058  | `curl $BASE/public/bill/$TOKEN` (no auth)                                                                | 200 + sale read-only                  | P1  | `[ ]`  |

### 27.3 Inventory & Products

| ID          | Curl                                                                                    | Expected                              | Sev | Status |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------- | --- | ------ |
| TC-API-100  | `curl $BASE/products -H ...`                                                              | 200 + list                            | P1  | `[ ]`  |
| TC-API-101  | `curl -XPOST $BASE/products -d @product.json -H ...`                                        | 201                                   | P1  | `[ ]`  |
| TC-API-102  | `curl -XPUT $BASE/products/$ID -d @update.json -H ...`                                       | 200                                   | P1  | `[ ]`  |
| TC-API-103  | `curl -XDELETE $BASE/products/$ID -H ...` (admin)                                              | 200 (soft delete)                     | P2  | `[ ]`  |
| TC-API-104  | `curl -XPOST $BASE/products/bulk-import -F file=@products.xlsx -H ...`                          | 200 + report                          | P2  | `[ ]`  |
| TC-API-105  | `curl $BASE/inventory -H ...`                                                                    | 200                                   | P2  | `[ ]`  |
| TC-API-106  | `curl -XPOST $BASE/inventory/adjust -d @adjust.json -H ...`                                         | 201                                   | P2  | `[ ]`  |
| TC-API-107  | `curl $BASE/inventory/movements/$PID -H ...`                                                          | 200                                   | P2  | `[ ]`  |
| TC-API-108  | `curl $BASE/inventory/low-stock -H ...`                                                                  | 200                                   | P2  | `[ ]`  |
| TC-API-109  | `curl -XPOST $BASE/inventory/transfer -d @xfer.json -H ...`                                                  | 201                                   | P2  | `[ ]`  |

### 27.4 Purchases

| ID          | Curl                                                                                    | Expected                              | Sev | Status |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------- | --- | ------ |
| TC-API-150  | `curl -XPOST $BASE/purchases -d @po.json -H ...`                                            | 201                                   | P1  | `[ ]`  |
| TC-API-151  | `curl -XPOST $BASE/purchases/$ID/submit -H ...`                                                 | 200                                   | P1  | `[ ]`  |
| TC-API-152  | `curl -XPOST $BASE/purchases/$ID/grn -d @grn.json -H ...`                                          | 201                                   | P1  | `[ ]`  |
| TC-API-153  | `curl -XPOST $BASE/purchases/$ID/pay -d @pay.json -H ...`                                            | 201                                   | P1  | `[ ]`  |
| TC-API-154  | `curl -XPOST $BASE/purchases/$ID/pre-close -H ...`                                                       | 200                                   | P2  | `[ ]`  |
| TC-API-155  | `curl -XPOST $BASE/purchases/$ID/cancel -H ...`                                                            | 200                                   | P2  | `[ ]`  |
| TC-API-156  | `curl $BASE/purchases/outstanding/by-supplier -H ...`                                                        | 200                                   | P2  | `[ ]`  |
| TC-API-157  | `curl $BASE/purchases/outstanding/by-item -H ...`                                                              | 200                                   | P2  | `[ ]`  |

### 27.5 Parties

| ID          | Curl                                                              | Expected         | Sev | Status |
| ----------- | ----------------------------------------------------------------- | ---------------- | --- | ------ |
| TC-API-200  | `curl $BASE/customers -H ...`                                       | 200              | P1  | `[ ]`  |
| TC-API-201  | `curl -XPOST $BASE/customers -d @c.json -H ...`                       | 201              | P1  | `[ ]`  |
| TC-API-202  | `curl $BASE/customers/$ID/ledger -H ...`                                | 200              | P1  | `[ ]`  |
| TC-API-203  | `curl $BASE/suppliers/$ID/ledger -H ...`                                 | 200              | P1  | `[ ]`  |

### 27.6 Accounting

| ID          | Curl                                                                | Expected         | Sev | Status |
| ----------- | ------------------------------------------------------------------- | ---------------- | --- | ------ |
| TC-API-250  | `curl $BASE/accounting/groups -H ...`                                 | 200              | P1  | `[ ]`  |
| TC-API-251  | `curl $BASE/accounting/accounts -H ...`                                | 200              | P1  | `[ ]`  |
| TC-API-252  | `curl -XPOST $BASE/accounting/vouchers -d @unbalanced.json -H ...`        | 400 VOUCHER_UNBALANCED | P1 | `[ ]` |
| TC-API-253  | `curl -XPOST $BASE/accounting/vouchers -d @balanced.json -H ...`            | 201              | P1  | `[ ]`  |
| TC-API-254  | `curl $BASE/accounting/trial-balance -H ...`                                  | 200              | P1  | `[ ]`  |
| TC-API-255  | `curl $BASE/accounting/profit-loss -H ...`                                      | 200              | P1  | `[ ]`  |
| TC-API-256  | `curl $BASE/accounting/balance-sheet -H ...`                                      | 200              | P1  | `[ ]`  |
| TC-API-257  | `curl $BASE/accounting/cash-flow -H ...`                                           | 200              | P2  | `[ ]`  |
| TC-API-258  | `curl $BASE/accounting/day-book -H ...`                                              | 200              | P2  | `[ ]`  |
| TC-API-259  | `curl -XPOST $BASE/accounting/bank-reconciliation -F file=@stmt.csv -H ...`              | 200              | P2  | `[ ]`  |

### 27.7 GST

| ID          | Curl                                                            | Expected      | Sev | Status |
| ----------- | --------------------------------------------------------------- | ------------- | --- | ------ |
| TC-API-300  | `curl $BASE/gst/summary/2026-05 -H ...`                            | 200           | P2  | `[ ]`  |
| TC-API-301  | `curl $BASE/gst/gstr1/2026-05 -H ...`                                | 200           | P1  | `[ ]`  |
| TC-API-302  | `curl $BASE/gst/gstr3b/2026-05 -H ...`                                | 200           | P1  | `[ ]`  |
| TC-API-303  | `curl $BASE/gst/hsn/2026-05 -H ...`                                     | 200           | P2  | `[ ]`  |
| TC-API-304  | `curl $BASE/gst/gstr9/2025-26 -H ...`                                     | 200           | P2  | `[ ]`  |
| TC-API-305  | `curl -XPOST $BASE/gst/reconcile/2a/2026-05 -d @2a.json -H ...`              | 200           | P2  | `[ ]`  |
| TC-API-306  | `curl $BASE/gst/export/gstr1/2026-05 -H ...`                                  | 200 + JSON    | P1  | `[ ]`  |
| TC-API-307  | `curl -XPOST $BASE/store/einvoice/test -H ...`                                  | 200           | P1  | `[ ]`  |
| TC-API-308  | `curl -XPOST $BASE/sales/$ID/einvoice -H ...`                                     | 200 IRN+QR    | P1  | `[ ]`  |

### 27.8 Reports

| ID          | Curl                                                            | Expected      | Sev | Status |
| ----------- | --------------------------------------------------------------- | ------------- | --- | ------ |
| TC-API-350  | `curl $BASE/reports/dashboard -H ...`                              | 200           | P1  | `[ ]`  |
| TC-API-351  | `curl $BASE/reports/sales -H ...`                                   | 200           | P1  | `[ ]`  |
| TC-API-352  | `curl $BASE/reports/profit -H ...`                                    | 200           | P2  | `[ ]`  |
| TC-API-353  | `curl $BASE/reports/stock-valuation -H ...`                              | 200           | P2  | `[ ]`  |

### 27.9 Store / Settings

| ID          | Curl                                                                | Expected            | Sev | Status |
| ----------- | ------------------------------------------------------------------- | ------------------- | --- | ------ |
| TC-API-400  | `curl $BASE/store/me -H ...`                                          | 200 with masked secrets | P1 | `[ ]` |
| TC-API-401  | `curl -XPUT $BASE/store/me -d @profile.json -H ...`                     | 200                 | P1  | `[ ]`  |
| TC-API-402  | `curl -XPOST $BASE/store/whatsapp/test -d '{"to":"+919..."}' -H ...`       | 200                 | P1  | `[ ]`  |
| TC-API-403  | `curl -XPUT $BASE/store/me -d '{"whatsapp":{"accessToken":"••••XXXX"}}' -H ...` | 200 — real token NOT overwritten | P1 | `[ ]` |

### 27.10 Users

| ID          | Curl                                                                | Expected            | Sev | Status |
| ----------- | ------------------------------------------------------------------- | ------------------- | --- | ------ |
| TC-API-450  | `curl $BASE/users -H ...`                                              | 200                | P1  | `[ ]`  |
| TC-API-451  | `curl -XPOST $BASE/users -d '{"role":"ca",...}' -H ...`                    | 201 (after CA-direct fix) | P1 | `[ ]` |
| TC-API-452  | `curl -XPOST $BASE/users/invite -d '{"role":"ca","email":"x"}' -H ...`         | 201                | P1  | `[ ]`  |
| TC-API-453  | `curl $BASE/users/invites -H ...`                                                | 200                | P2  | `[ ]`  |
| TC-API-454  | `curl -XPOST $BASE/invites/$TOKEN/accept -d '{"password":"strong"}'`              | 200 + token         | P1  | `[ ]`  |
| TC-API-455  | `curl -XPUT $BASE/users/$ID/role -d '{"role":"manager"}' -H ...`                     | 200                | P2  | `[ ]`  |
| TC-API-456  | `curl -XPUT $BASE/users/$ID -d '{"isActive":false}' -H ...`                              | 200                | P2  | `[ ]`  |

### 27.11 Platform (super-admin)

| ID          | Curl                                                            | Expected      | Sev | Status |
| ----------- | --------------------------------------------------------------- | ------------- | --- | ------ |
| TC-API-500  | `curl $BASE/platform/organizations -H "Authorization: Bearer $SUPER_T"` | 200     | P1  | `[ ]`  |
| TC-API-501  | `curl $BASE/platform/plans -H ...`                                | 200           | P1  | `[ ]`  |
| TC-API-502  | `curl $BASE/platform/payments -H ...`                              | 200           | P2  | `[ ]`  |
| TC-API-503  | `curl $BASE/platform/requests -H ...`                                | 200           | P1  | `[ ]`  |
| TC-API-504  | `curl $BASE/platform/settings -H ...`                                  | 200           | P2  | `[ ]`  |
| TC-API-505  | `curl $BASE/platform/* -H "Authorization: Bearer $TENANT_T"`             | 403           | P1  | `[ ]`  |

---

## 28. Cross-Cutting Edge Cases

| ID         | Pre   | Steps                                                                  | Expected                                                                | Sev | Status |
| ---------- | ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --- | ------ |
| TC-EDGE-001 | L1,D1 | Sale dated 31-Mar 23:59 — FY rollover.                                  | Lands in current FY; next sale at 00:00 lands in new FY.                | P1  | `[ ]`  |
| TC-EDGE-002 | L1    | Customer phone with leading zero `09876543210`.                          | Normalised correctly; not double-prefixed.                              | P3  | `[ ]`  |
| TC-EDGE-003 | L1    | Product SKU with unicode characters.                                       | Supported; persists; renders.                                            | P3  | `[ ]`  |
| TC-EDGE-004 | L1    | Sale during Daylight Saving toggle.                                          | createdAt UTC stored; display in local TZ.                                | P3  | `[ ]`  |
| TC-EDGE-005 | L1    | Disconnect Mongo mid-request.                                                  | 503 with retry banner; not 500 silent.                                   | P1  | `[ ]`  |
| TC-EDGE-006 | L1    | Server out of memory (simulate).                                                 | Graceful 503; PM2 / Fargate restarts.                                    | P1  | `[ ]`  |
| TC-EDGE-007 | L1    | Timezone — India server, customer with UTC system.                                  | Bills timestamped IST.                                                   | P2  | `[ ]`  |
| TC-EDGE-008 | L1    | Sale with item quantity 0.001 (decimal weight).                                       | Allowed for unit = kg/g/ltr.                                              | P3  | `[ ]`  |
| TC-EDGE-009 | L1    | Sale with negative grand total (returns).                                                | Stored as a separate return doc with positive amounts + reverse flag.    | P2  | `[ ]`  |
| TC-EDGE-010 | L1    | Subscription downgrade — user count > new limit.                                            | Warning shown; existing users keep access; new creates blocked.          | P2  | `[ ]`  |
| TC-EDGE-011 | L1    | Delete a customer with open credit.                                                           | Blocked or marked archived (per spec).                                   | P2  | `[ ]`  |
| TC-EDGE-012 | L1    | Sale where store and customer have the same GSTIN.                                                | Handled — no special tax case.                                            | P3  | `[ ]`  |
| TC-EDGE-013 | L1    | Stock movement created with future date via API.                                                    | Spec — record.                                                            | P3  | `[ ]`  |
| TC-EDGE-014 | L1    | Bill with grandTotal = 0.                                                                              | Allowed (free item / sample).                                             | P3  | `[ ]`  |
| TC-EDGE-015 | L1    | Voucher with totalAmount = 0.                                                                            | Blocked or allowed per spec.                                              | P3  | `[ ]`  |
| TC-EDGE-016 | L1    | Refresh between two save clicks — race condition.                                                          | Idempotency-key prevents double commit.                                  | P1  | `[ ]`  |
| TC-EDGE-017 | L1    | localStorage cleared mid-session.                                                                              | Next API call 401 → bounce to `/`.                                        | P2  | `[ ]`  |
| TC-EDGE-018 | L1    | Two tabs logged in as different users in the same browser.                                                       | localStorage shared — last-write-wins. Document the behaviour.            | P3  | `[ ]`  |
| TC-EDGE-019 | L1    | Open POS in Safari / Firefox / Chrome / Edge.                                                                       | All renders correctly.                                                    | P2  | `[ ]`  |
| TC-EDGE-020 | L1    | Open mobile Chrome on 360px width.                                                                                      | Sidebar collapses; POS usable.                                            | P3  | `[ ]`  |

---

## 29. Pre-launch Gate Checklist

Each item is a release blocker. All must be `[x]` before flipping the customer live.

- [ ] All P1 test cases pass.
- [ ] No P1 bugs open.
- [ ] GST invoices reviewed by ≥ 2 CAs — GSTIN format, HSN, CGST/SGST/IGST math validated against real bills.
- [ ] Atomic transaction kill-test (TC-ATOM-001 to TC-ATOM-008) — all rolled back cleanly.
- [ ] Ledger balance across 30 days of test data — Σ Dr == Σ Cr.
- [ ] 1000-item cart bills in &lt; 1s.
- [ ] 3 cashiers billing simultaneously — no stock conflicts, no invoice clashes.
- [ ] Backup → restore drill on a staging DB — full integrity verified.
- [ ] Security review — JWT bypass, NoSQL injection, XSS, CSRF, privilege escalation, cross-tenant access.
- [ ] Pen test report reviewed; any P1/P2 findings closed.
- [ ] CA portal — RBAC writes blocked + PII redacted, confirmed on every page.
- [ ] Super-admin portal — every action audit-logged.
- [ ] WhatsApp / E-invoice / Payment gateway integrations live-tested with real creds in staging.
- [ ] Pricing × user-addon math reviewed end-to-end.
- [ ] On-call rotation defined, runbook for top 10 incidents written.
- [ ] Customer onboarding guide + Knowledge Base proof-read.

---

## 30. Bug-tracking template

When a test fails, log:

```
Title:        [TC-XXX-###] Short bug summary
Severity:     P1 / P2 / P3 / P4
Pre-conditions: (copy from test case)
Steps:        (copy from test case)
Actual:       (what happened)
Expected:     (copy from test case)
Environment:  Local / Dev / QA / UAT / Prod
Browser/OS:   Chrome 130 / Win 11
Token user:   admin@example.com (admin)
Screenshot:   <path>
Logs:         <relevant server log lines>
Repro rate:   100% / intermittent / once
```

---

## 31. Test execution worksheet

Recommended run order for a full pass:

1. **Smoke** — TC-AUTH-001, TC-POS-001, TC-POS-200, TC-SALE-001, TC-INV-050, TC-PUR-001, TC-PUR-050, TC-BOOK-100 (15 minutes — fail-fast gate).
2. **RBAC sweep** — all of §2 (1 hour).
3. **Settings + onboarding** — §3, §4 (1 hour).
4. **POS happy path + variations** — §5 (2 hours).
5. **Sales, Inventory, Purchases, Parties** — §6, §7, §11, §12 (3 hours).
6. **Books + GST + Reports** — §13, §14, §15 (2 hours).
7. **Users, Branches, Subscription, WhatsApp** — §17, §16, §18, §19 (2 hours).
8. **CA portal end-to-end** — §20 (1 hour).
9. **Admin portal** — §21 (1 hour).
10. **Public bill share + KB** — §22, §23 (30 minutes).
11. **Security, Atomicity, Performance, Edge cases** — §24, §25, §26, §28 (3 hours).
12. **API contract** — §27 (1 hour, scripted via curl/Postman).
13. **Pre-launch gate** — §29.

Total exhaustive pass: ~17 hours of QA time.

---

> **End of test plan v1.0.** Update with a changelog entry each time a new feature lands. Every new test case starts at the next free ID in its module's sequence.

---

## 32. v1.1 Feature additions (May 2026)

Adds test cases for: GST-inclusive PO lines, GRN ancillary expense modes, advance payment on POs, draft PO Submit/Cancel buttons, inventory Reorder → draft PO, dedicated Suppliers page with per-supplier rollup, POS parked carts + live cart persistence, POS search "Focus" button, Twilio WhatsApp provider, cancelled-PO payable invariant.

### 32.1 PO GST-inclusive line — `priceIncludesGst` per line

| ID          | Pre   | Steps                                                                                                          | Expected                                                                                                                       | Sev | Status |
| ----------- | ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --- | ------ |
| TC-PUR-200  | L1,D1 | Open New PO. Add a product whose master has `priceIncludesGst=true`. Observe the "Incl. GST" checkbox.         | Checkbox auto-ticked. Line total = `qty × purchasePrice` (no GST added on top).                                                | P1  | `[ ]`  |
| TC-PUR-201  | L1    | Add a product with `priceIncludesGst=false`. Observe checkbox.                                                  | Checkbox unticked. Line total = `qty × purchasePrice × (1 + gstRate/100)`.                                                     | P1  | `[ ]`  |
| TC-PUR-202  | L1    | Tick the "Incl. GST" checkbox on a previously-exclusive line.                                                    | Line total drops — tax extracted from price instead of stacked. Dialog totals box updates instantly.                            | P1  | `[ ]`  |
| TC-PUR-203  | L1    | Mix one inclusive + one exclusive line on the same PO. Save as ordered.                                          | Saved PO grandTotal = sum of per-line totals. `grandTotal = subtotal − totalDiscount + totalTax` invariant holds.               | P1  | `[ ]`  |
| TC-PUR-204  | L1    | Inspect saved PO via `GET /api/purchases/:id`. Each item should have `priceIncludesGst` persisted.                | Field present and matches the form choice.                                                                                      | P2  | `[ ]`  |
| TC-PUR-205  | L1    | Inclusive line at 18% GST, qty 10 @ ₹118 each. Save PO and GRN full qty.                                          | Server stores taxable = ₹1000, totalTax = ₹180, grandTotal = ₹1180. Stock added at ₹118/unit. Input GST ledger debit = ₹180. | P1  | `[ ]`  |
| TC-PUR-206  | L1    | Same scenario as TC-PUR-205, but supplier is interstate.                                                          | IGST = ₹180; CGST/SGST = 0. Ledger posts to "Input IGST" only.                                                                  | P1  | `[ ]`  |
| TC-PUR-207  | L1    | GRN a partial qty on an inclusive PO line.                                                                         | GRN subtotal/tax/total recomputed on the received qty (not original). Inclusive treatment preserved.                            | P1  | `[ ]`  |
| TC-PUR-208  | L1    | Reorder Dialog (from Inventory low-stock). Product is inclusive.                                                    | Per-row subtitle reads "Incl. 18% GST". Row total uses extracted-tax math. Draft PO posted with `priceIncludesGst:true`.        | P2  | `[ ]`  |
| TC-PUR-209  | L1    | PO with one line @ rate 0% AND `priceIncludesGst=true`.                                                              | Engine returns `taxableAmount = gross`, `totalTax = 0`. No division-by-zero artefact.                                            | P2  | `[ ]`  |
| TC-PUR-210  | L1    | Submit PO via raw API without `priceIncludesGst` in the payload.                                                     | Backend falls back to product master flag (see `resolveItems`). Saved line carries the resolved boolean.                        | P2  | `[ ]`  |

### 32.2 GRN ancillary expenses (landed cost vs direct expense)

| ID          | Pre   | Steps                                                                                                       | Expected                                                                                                              | Sev | Status |
| ----------- | ----- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-PUR-260  | L1    | Open GRN dialog. Add ancillary "Freight ₹500, include in landed cost".                                       | Per-unit `purchasePrice` of each line is bumped pro-rata. Product master `purchasePrice` updated on commit.            | P2  | `[ ]`  |
| TC-PUR-261  | L1    | Add ancillary "Labour ₹300, NOT landed cost".                                                                  | Posts Dr "Direct Labour" ₹300, Cr "Cash" ₹300. Product cost unchanged. P&L shows ₹300 under Direct Expenses.            | P2  | `[ ]`  |
| TC-PUR-262  | L1    | Mix landed + direct rows in one GRN.                                                                            | Both effects co-exist; ledger balanced.                                                                                | P2  | `[ ]`  |
| TC-PUR-263  | L1    | Ancillary list saved on the GRN.                                                                                  | `receiptRefs[i].ancillaryExpenses[]` persisted with each line's type/amount/landed flag for audit.                       | P2  | `[ ]`  |
| TC-PUR-264  | L1    | Reports → P&L for current period. Verify "Direct Expenses" sub-accounts per ancillary type appear separately.       | Each type (Labour, Freight, Octroi, Packaging, …) is a distinct line on the P&L, not a single bucket.                 | P2  | `[ ]`  |
| TC-PUR-265  | L1    | Ancillary amount = 0 or negative.                                                                                  | Row filtered out before commit. No zero-rupee ledger entries.                                                          | P3  | `[ ]`  |
| TC-PUR-266  | L1    | Ancillary `paidVia=supplier` (added to supplier outstanding).                                                       | Supplier outstanding increased by ancillary amount; matching credit entry on Supplier A/c, not Cash.                    | P2  | `[ ]`  |
| TC-PUR-267  | L1    | Kill server mid-GRN with ancillary expenses queued.                                                                | Rollback — no half-applied ancillary ledger, no stock added, no landed-cost mutation on product master.                 | P1  | `[ ]`  |

### 32.3 Draft PO Submit / Cancel buttons + advance payment

| ID          | Pre   | Steps                                                                                                        | Expected                                                                                                                   | Sev | Status |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-PUR-240  | L1    | Open Purchases list. Draft PO row should show **Submit** and **Cancel** buttons in the row actions.            | Both buttons visible only for `status=draft`. "Submit" promotes to `ordered`. "Cancel" prompts for reason then sets cancelled. | P1  | `[ ]`  |
| TC-PUR-241  | L1    | Click Submit on a draft.                                                                                       | `POST /purchases/:id/submit` returns 200; row status pill updates to "Ordered"; list reloads.                              | P1  | `[ ]`  |
| TC-PUR-242  | L1    | Click Cancel on a draft. Provide reason.                                                                          | Status → cancelled. closedReason saved. No stock or ledger impact.                                                          | P1  | `[ ]`  |
| TC-PUR-243  | L1    | Click Cancel on a draft, click Cancel inside the prompt (no reason).                                              | No API call. Draft remains.                                                                                                  | P3  | `[ ]`  |
| TC-PUR-244  | L1    | Submit/Cancel buttons hidden when status ≠ draft.                                                                  | Verified on ordered / partial / received / closed rows.                                                                     | P3  | `[ ]`  |
| TC-PUR-220  | L1    | Open Pay dialog on a draft PO (no receipts yet). Outstanding = 0.                                                  | Dialog detects "advance" mode → amber banner: "This payment is being recorded as an advance against an unreceived PO."     | P2  | `[ ]`  |
| TC-PUR-221  | L1    | Pay ₹1000 advance against an ordered PO (no GRN yet).                                                              | Ledger: Dr "Sundry Creditors", Cr "Cash" ₹1000. Supplier outstanding decreases by ₹1000 (goes negative if no prior dues).   | P1  | `[ ]`  |
| TC-PUR-222  | L1    | After GRN of full PO, the advance auto-applies — `amountPaid` already > 0.                                          | Final paymentStatus computed correctly. No double-counting in supplier outstanding.                                          | P1  | `[ ]`  |
| TC-PUR-223  | L1    | Advance > grandTotal of PO eventually received (over-payment).                                                       | paymentStatus = paid; supplier outstanding goes negative (net credit). Suppliers page shows "Net credit" badge.              | P2  | `[ ]`  |
| TC-PUR-224  | L1    | Try to advance-pay a cancelled PO.                                                                                     | Pay button hidden for cancelled rows; backend rejects if forced.                                                              | P2  | `[ ]`  |

### 32.4 Cancelled-PO payable invariant

| ID          | Pre   | Steps                                                                                          | Expected                                                                                          | Sev | Status |
| ----------- | ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-PUR-250  | L1    | Create PO (₹10,000 grandTotal), cancel before any GRN.                                          | Purchases list "Payable" KPI does not include this PO. Reports → Purchase register hides it.       | P1  | `[ ]`  |
| TC-PUR-251  | L1    | Create PO, receive ₹4,000 worth of goods, pre-close.                                              | Payable = ₹4,000 − amountPaid (NOT grandTotal − amountPaid).                                       | P1  | `[ ]`  |
| TC-PUR-252  | L1    | Pre-close after partial GRN + partial payment.                                                     | Payable correctly = receivedValue − amountPaid (zero if fully paid against received qty).         | P1  | `[ ]`  |
| TC-PUR-253  | L1    | `poPayable()` helper unit test — pass cancelled PO → returns 0.                                     | Confirmed; helper is the single source of truth for both Purchases page and Reports.              | P2  | `[ ]`  |

### 32.5 Dedicated Suppliers page + per-supplier rollup

| ID           | Pre   | Steps                                                                                                            | Expected                                                                                                                              | Sev | Status |
| ------------ | ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-PARTY-100 | L1,D1 | Open `/dashboard/suppliers`. Top tiles: Purchased │ Paid │ Outstanding / Net credit │ With dues.                  | All four KPI tiles render. Sums equal aggregate across the suppliers table.                                                            | P2  | `[ ]`  |
| TC-PARTY-101 | L1    | Per-row 3-cell rollup: Purchased │ Paid │ Outstanding visible on desktop.                                          | Numbers match each supplier's actual aggregate of non-cancelled POs. Mobile fallback chip shown < md viewport.                          | P2  | `[ ]`  |
| TC-PARTY-102 | L1    | Click a supplier row.                                                                                                | Navigates to `/dashboard/suppliers/:id` with details + ledger statement.                                                                | P2  | `[ ]`  |
| TC-PARTY-103 | L1    | On supplier detail, see "PO count" + "Purchased value (received goods only)".                                          | Cancelled POs not counted in `purchasedValue`. Helper mirrors `lib/purchase-utils.poReceivedValue()`.                                   | P1  | `[ ]`  |
| TC-PARTY-104 | L1    | Outstanding < 0 (advance > received).                                                                                   | Tile shows "Net credit ₹X" in amber, not negative outstanding.                                                                          | P2  | `[ ]`  |
| TC-PARTY-105 | L1    | Edit supplier profile (state code) from detail page.                                                                       | Persists; affects subsequent PO IGST math.                                                                                                | P1  | `[ ]`  |
| TC-PARTY-106 | L1    | Backend `GET /api/suppliers` returns each row enriched with `poCount`, `purchasedValue`, `paidValue`.                       | Verified via curl. `purchasedValue` uses receiptRefs sum (NOT grandTotal). Cancelled POs excluded.                                       | P1  | `[ ]`  |
| TC-PARTY-107 | L1    | Backend rollup with no POs for a supplier.                                                                                    | Row returns `poCount:0, purchasedValue:0, paidValue:0`. No undefined fields.                                                              | P3  | `[ ]`  |

### 32.6 Inventory low-stock Reorder flow

| ID           | Pre   | Steps                                                                                                  | Expected                                                                                                                       | Sev | Status |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --- | ------ |
| TC-INV-100   | L1,D1 | Inventory page. A product with stock ≤ minStock should show a Truck icon button in row actions.        | Truck button visible only for low-stock rows.                                                                                    | P2  | `[ ]`  |
| TC-INV-101   | L1    | Click Truck. Reorder Dialog opens with the row pre-loaded as line 1, default qty = `reorderQty ?? minStock ?? 1`. | Dialog opens; line pre-populated; supplier dropdown empty.                                                                | P2  | `[ ]`  |
| TC-INV-102   | L1    | Pick a supplier, click "Create draft PO".                                                                   | `POST /purchases` with `status:'draft'` returns 201; toast shows new PO number; navigation goes to `/dashboard/purchases?po=<id>`. | P1  | `[ ]`  |
| TC-INV-103   | L1    | Use the "Search to add more low-stock items" box.                                                            | Only low-stock products NOT already in the draft are listed. Selecting one adds it as another line with its default qty.        | P2  | `[ ]`  |
| TC-INV-104   | L1    | Remove all but one line, try to remove the last one.                                                          | Remove icon hidden when only one line remains. Dialog forces ≥ 1 line.                                                          | P3  | `[ ]`  |
| TC-INV-105   | L1    | Submit without supplier selected.                                                                                | Toast: "Pick a supplier first". No POST.                                                                                          | P3  | `[ ]`  |
| TC-INV-106   | L1    | Submit with zero suppliers in the org.                                                                            | Inline message links to `/dashboard/suppliers`. Create button disabled.                                                            | P3  | `[ ]`  |
| TC-INV-107   | L1    | Inclusive-priced product reordered.                                                                                  | Subtitle reads "Incl. 18% GST"; line total = `qty × price` (tax extracted). Payload carries `priceIncludesGst:true`.              | P1  | `[ ]`  |
| TC-INV-108   | L1    | Reorder, land on PO list, open the draft, submit it.                                                                  | End-to-end: low-stock → draft → ordered → GRN ready in one workflow without leaving keyboard.                                    | P2  | `[ ]`  |

### 32.7 POS parked carts + live cart persistence

| ID          | Pre   | Steps                                                                                              | Expected                                                                                                                       | Sev | Status |
| ----------- | ----- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --- | ------ |
| TC-POS-300  | L1    | Add 3 items to POS cart, click "Park cart" / save draft.                                            | Draft persisted via `lib/pos-drafts.ts`. Toast confirms; cart cleared.                                                          | P2  | `[ ]`  |
| TC-POS-301  | L1    | Open Drafts drawer. Pick the saved draft.                                                            | Cart restored with same items, qty, discounts, customer if any.                                                                  | P2  | `[ ]`  |
| TC-POS-302  | L1    | Add items, hard-refresh browser without saving.                                                       | On reload, the live cart restored from local storage (no draft action needed). Customer + payment selections preserved.         | P2  | `[ ]`  |
| TC-POS-303  | L1    | Close 1 draft (×).                                                                                       | Removed from drawer. Live cart untouched.                                                                                          | P3  | `[ ]`  |
| TC-POS-304  | L1    | Save & Complete a sale.                                                                                   | Live cart cleared (NOT saved as a draft). Drafts drawer unchanged.                                                                  | P2  | `[ ]`  |
| TC-POS-305  | L1    | Park 6+ drafts.                                                                                              | Drawer scrolls; oldest at bottom; each draft labeled with timestamp + first item name.                                            | P3  | `[ ]`  |
| TC-POS-306  | L1    | Sync status badge (header).                                                                                    | Shows "Online" green pill when connected; "Offline" amber when navigator.onLine=false; "Pending N" if outbox > 0.               | P2  | `[ ]`  |

### 32.8 POS Search + Focus button

| ID          | Pre   | Steps                                                                                | Expected                                                                                                  | Sev | Status |
| ----------- | ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-POS-350  | L1    | Click the "Focus search" button in POS header.                                       | Cursor moves to the search input; input receives focus (verified via `document.activeElement`).            | P1  | `[ ]`  |
| TC-POS-351  | L1    | Type a non-matching term (e.g. "asdf").                                                | Visible empty-state row appears below the input ("No products match"). No silent failure.                  | P1  | `[ ]`  |
| TC-POS-352  | L1    | Throttle network / disconnect backend, then type a term.                               | Loading spinner during request, then visible error row ("Search failed — check connection"). Not silent.    | P1  | `[ ]`  |
| TC-POS-353  | L1    | Type a barcode-shaped string.                                                              | Server responds; matching product surfaces in dropdown. Add to cart works.                                  | P1  | `[ ]`  |
| TC-POS-354  | L1    | Refocus search after pressing F2 / hotkey.                                                  | Same as the button — input gains focus reliably (React 19 ref forwarding via `Input` component).             | P2  | `[ ]`  |

### 32.9 Twilio as second WhatsApp provider

| ID         | Pre   | Steps                                                                                                                    | Expected                                                                                                                            | Sev | Status |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-WA-050  | L1    | Settings → WhatsApp. Switch provider to "Twilio". Enter Account SID, Auth Token, From number, optional Content SID.       | Form rerenders Twilio-specific fields. Existing Meta fields hidden but not deleted from DB until save.                              | P2  | `[ ]`  |
| TC-WA-051  | L1    | Save settings.                                                                                                              | `PUT /api/store/me` accepts the new shape. `whatsapp.provider='twilio'`. Other Meta fields preserved.                                | P2  | `[ ]`  |
| TC-WA-052  | L1    | Reopen settings. Inspect Auth Token field.                                                                                    | Masked (e.g. `••••••••<last4>`). GET never returns the full secret.                                                                  | P1  | `[ ]`  |
| TC-WA-053  | L1    | Click "Test" — send a one-off message to a verified test number.                                                                | `POST /api/store/whatsapp/test` returns 200; Twilio `sid` echoed back; receiving phone gets the test message.                       | P2  | `[ ]`  |
| TC-WA-054  | L1    | After a Sale, click WhatsApp share. Provider routes to Twilio.                                                                    | `POST /api/sales/:id/whatsapp` succeeds; `sale.whatsappSends[].method = 'twilio'` audit row appended.                              | P2  | `[ ]`  |
| TC-WA-055  | L1    | Switch provider back to Meta — Twilio fields should not be required to remain valid.                                                | Save succeeds. `verifiedProfile` cleared because provider changed. Token mask still hides Twilio token.                              | P3  | `[ ]`  |
| TC-WA-056  | L1    | Mis-configured Twilio creds (bad SID).                                                                                                | Send fails with `WHATSAPP_API_ERROR`; Twilio's error body surfaced in `details.code` / `details.message`.                            | P2  | `[ ]`  |
| TC-WA-057  | L1    | Switching provider with non-empty `messageTemplate`.                                                                                    | Template fields validated against the chosen provider. UI hides Meta template language picker when on Twilio (uses Content SID).      | P3  | `[ ]`  |

### 32.10 GRN ancillary visibility when NOT rolled into product cost

| ID         | Pre   | Steps                                                                                                       | Expected                                                                                                                | Sev | Status |
| ---------- | ----- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-PUR-280 | L1    | View a saved GRN (Purchases → PO → expand receipt). Operating-expense rows ("Labour ₹300") visible.          | The receiptRef section shows ancillary list; each row labelled with type + amount + paid-via.                            | P2  | `[ ]`  |
| TC-PUR-281 | L1    | Reports → Day book for the GRN date.                                                                          | Direct expense postings (Dr "Direct Labour" Cr "Cash") visible chronologically alongside the Purchase posting.            | P2  | `[ ]`  |
| TC-PUR-282 | L1    | Reports → P&L for period.                                                                                       | "Direct Expenses" group shows breakdown by sub-account (Labour, Packaging, Loading, …).                                  | P2  | `[ ]`  |
| TC-PUR-283 | L1    | Books → Account "Direct Labour" → ledger statement.                                                                | All GRN-derived labour postings appear with narration `Direct Labour on GRN <num> (<PO num>)`.                             | P2  | `[ ]`  |
| TC-PUR-284 | L1    | Edit a GRN's ancillary line after commit.                                                                              | Blocked — GRN is immutable. To correct, post a Journal Voucher manually.                                                  | P2  | `[ ]`  |

### 32.11 API contract — recent endpoints

| ID           | Pre   | Curl                                                                                                                                                                                                                                              | Expected                                                                          | Sev | Status |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --- | ------ |
| TC-API-PUR-1 | L1    | `POST /api/purchases` with item carrying `priceIncludesGst:true, purchasePrice:118, gstRate:18, orderedQty:10`.                                                                                                                                    | Response item: `taxableAmount≈1000, totalTax≈180, totalAmount≈1180`.              | P1  | `[ ]`  |
| TC-API-PUR-2 | L1    | `POST /api/purchases/:id/submit` on a draft.                                                                                                                                                                                                            | Status → ordered.                                                                  | P1  | `[ ]`  |
| TC-API-PUR-3 | L1    | `POST /api/purchases/:id/cancel` on a draft with `{"reason":"supplier withdrew"}`.                                                                                                                                                                       | Status → cancelled; closedReason saved.                                            | P1  | `[ ]`  |
| TC-API-PUR-4 | L1    | `POST /api/purchases/:id/pay {"amount":1000, "mode":"bank"}` on an ordered PO with no GRN.                                                                                                                                                                | Advance accepted. Supplier outstanding −1000. Ledger Dr Creditors / Cr Bank.       | P1  | `[ ]`  |
| TC-API-PUR-5 | L1    | `POST /api/purchases/:id/grn` with `ancillaryExpenses:[{type:'labour', amount:300, includeInLandedCost:false, paidVia:'cash'}]`.                                                                                                                              | Stock added; ledger has Dr Direct Labour 300 / Cr Cash 300. Product cost unchanged. | P1  | `[ ]`  |
| TC-API-PUR-6 | L1    | `GET /api/suppliers` enriched response.                                                                                                                                                                                                                       | Each row includes `poCount`, `purchasedValue` (sum of receipt totals on non-cancelled POs), `paidValue`. | P1  | `[ ]`  |
| TC-API-WA-1  | L1    | `POST /api/store/whatsapp/test {"to":"+919999999999"}` with Twilio creds saved.                                                                                                                                                                                  | 200; response includes Twilio SID.                                                  | P2  | `[ ]`  |

### 32.12 Invariants — automated sanity checks

Run after every meaningful build. Recommended as `npm run qa:invariants`:

| ID           | Steps                                                                                                                                              | Expected                                                                                                | Sev | Status |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-INV-901   | For every Purchase doc, assert `grandTotal === sum(items[i].totalAmount)` within ₹0.01.                                                            | All POs balance, including mixed inclusive/exclusive lines.                                              | P1  | `[ ]`  |
| TC-INV-902   | For every Purchase, assert `subtotal − totalDiscount + totalTax === grandTotal` within ₹0.01.                                                       | Aggregate invariant holds.                                                                                | P1  | `[ ]`  |
| TC-INV-903   | For every non-cancelled Purchase, assert `poPayable(p) === max(0, poReceivedValue(p) − amountPaid)`.                                                  | Cancelled POs return 0; pre-closed POs only count received value.                                          | P1  | `[ ]`  |
| TC-INV-904   | For every supplier, assert `outstandingBalance === sum(GRN totals) − sum(payment amounts)` (within ₹0.01).                                              | If breakage detected, suggest replaying ledger to repair the master.                                       | P1  | `[ ]`  |
| TC-INV-905   | LedgerEntry: per voucher / per sale / per GRN, `sum(debit) === sum(credit)`.                                                                              | Holds; any drift indicates a non-atomic write or a service bypass.                                          | P1  | `[ ]`  |
| TC-INV-906   | StockMovement.newStock − previousStock === ±quantity for every row.                                                                                          | Holds; otherwise stock master drift.                                                                          | P1  | `[ ]`  |
| TC-INV-907   | Sale doc: per item, when `priceIncludesGst`, assert `totalAmount = basePrice − discountAmount` (within ₹0.01).                                                       | Inclusive math sanity: customer pays exactly the listed gross.                                                  | P1  | `[ ]`  |

---

## 33. v1.2 Feature additions (June 2026)

Adds test cases for: GST-inclusive pricing in POS (cart-total parity, intra/inter-state split, inclusive+discount, inventory-form toggle persistence regression, store `defaultGSTMode`), RBAC role × endpoint enforcement matrix, sale idempotency keys, concurrent invoice-number allocation, sale-return refund on inclusive items, ledger debit=credit invariants, e-invoice IRN generate/cancel/eligibility/secret masking, scan-bill OCR/PDF extraction, and operational resilience (health/ready/rate-limit/graceful shutdown).

> New fixtures: `INCL-250` — a product with `priceIncludesGst=true`, `sellingPrice=250`, `gstRate=12`, valid HSN. `EXCL-200` — `priceIncludesGst=false`, `sellingPrice=200`, `gstRate=18`. Idempotency field is `idempotencyKey` (partial-unique index on `sales`, `$type:'string'`). E-invoice routes: `POST /api/sales/:id/einvoice/generate` and `/cancel`. Health: `GET /api/health` (liveness, no DB), `GET /api/ready` (readiness, 503 when DB disconnected).

### 33.1 GST-inclusive pricing — POS cart math

| ID         | Pre   | Steps                                                                                                                              | Expected                                                                                                                                                   | Sev | Status |
| ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-POS-400 | L2,D1 | Add `INCL-250` (incl. 12%, sell ₹250) qty 1, walk-in same-state customer. Read the cart grand total.                              | `finalAmount = ₹250` — exactly the listed gross, NOT ₹280. Tax is extracted, not stacked.                                                                  | P1  | `[ ]`  |
| TC-POS-401 | L2,D1 | Same line — inspect the per-item breakdown.                                                                                        | `taxableAmount ≈ 223.21` (250 ÷ 1.12), `totalTax ≈ 26.79`, `totalAmount = 250.00` within ₹0.01.                                                            | P1  | `[ ]`  |
| TC-POS-402 | L2,D1 | `INCL-250`, customer **same state** (store 27, cust 27).                                                                            | `cgst ≈ 13.39`, `sgst ≈ 13.39`, `igst = 0`; cgst+sgst ≈ totalTax; grand total still ₹250.                                                                   | P1  | `[ ]`  |
| TC-POS-403 | L2,D1 | `INCL-250`, customer **inter-state** (store 27, cust 07).                                                                           | `igst ≈ 26.79`, `cgst = sgst = 0`; grand total still ₹250.                                                                                                  | P1  | `[ ]`  |
| TC-POS-404 | L2,D1 | `INCL-250` qty 1 + line discount 10%.                                                                                               | Discount applies to gross first: grossAfterDiscount = ₹225; tax extracted from ₹225 → `totalAmount = 225.00`.                                              | P1  | `[ ]`  |
| TC-POS-405 | L2,D1 | `INCL-250` qty 1 + flat discount ₹50.                                                                                              | grossAfterDiscount = ₹200; `totalAmount = 200.00`; taxable ≈ 178.57, tax ≈ 21.43.                                                                          | P1  | `[ ]`  |
| TC-POS-406 | L2,D1 | Mixed cart: `INCL-250` + `EXCL-200`.                                                                                                | Inclusive line totals ₹250; exclusive line totals ₹236 (200 + 18%). Grand total = ₹486. `subtotal − discount + tax = grandTotal`.                          | P1  | `[ ]`  |
| TC-POS-407 | L2,D1 | Inclusive product at 0% GST (`priceIncludesGst=true`, gstRate 0), sell ₹100.                                                        | `taxableAmount = 100`, `totalTax = 0`, `totalAmount = 100`. No divide-by-zero / NaN.                                                                        | P2  | `[ ]`  |
| TC-POS-408 | L2,D1 | `INCL-250` qty 3.                                                                                                                   | grand total = ₹750 exactly; no rounding drift > ₹0.01.                                                                                                      | P2  | `[ ]`  |
| TC-POS-409 | L2,D1 | Save the inclusive sale, open persisted doc; assert TC-INV-907 invariant.                                                          | `totalAmount == basePrice − discountAmount` within ₹0.01 for the inclusive line.                                                                           | P1  | `[ ]`  |

### 33.2 GST-inclusive — inventory form toggle persistence (regression)

| ID         | Pre  | Steps                                                                                                                          | Expected                                                                                                                  | Sev | Status |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-INV-150 | L1   | Add a new product, tick **"Price includes GST"**, save. Reopen in the edit form.                                              | Toggle still **ON** after reload. (Regression: the edit form used to silently drop the flag on save.)                     | P1  | `[ ]`  |
| TC-INV-151 | L1   | Edit an existing inclusive product, change name only (leave toggle ON), save, reopen.                                          | Toggle still ON; `priceIncludesGst:true` preserved — not reset by an unrelated edit.                                     | P1  | `[ ]`  |
| TC-INV-152 | L1   | Edit an inclusive product, turn toggle **OFF**, save, reopen.                                                                  | Toggle OFF; `GET /api/products/:id` returns `priceIncludesGst:false`.                                                     | P2  | `[ ]`  |
| TC-INV-153 | L1   | Create product via `POST /api/products` WITHOUT the field. Reopen in UI.                                                       | Defaults to OFF (`false`); no `undefined`.                                                                                | P2  | `[ ]`  |
| TC-INV-154 | L1   | `curl -XPUT $BASE/products/$ID -d '{"priceIncludesGst":true}'` then `GET /products/:id`.                                        | 200; persisted flag = true. (Confirms the server UPDATE path persists the toggle — the fixed bug.)                        | P1  | `[ ]`  |

### 33.3 Store-level default GST mode

| ID         | Pre  | Steps                                                                                                                       | Expected                                                                                                                   | Sev | Status |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-SET-300 | L1   | Settings → set `defaultGSTMode = inclusive`, save. Add a product with no explicit `priceIncludesGst`.                       | New product / cart line inherits inclusive treatment per store default.                                                   | P2  | `[ ]`  |
| TC-SET-301 | L1   | Set `defaultGSTMode = exclusive`. Same product.                                                                            | Line computed exclusive (tax stacked).                                                                                    | P2  | `[ ]`  |
| TC-SET-302 | L1   | Product-level `priceIncludesGst` set explicitly, store default opposite.                                                   | Product-level flag WINS over store default.                                                                               | P2  | `[ ]`  |

### 33.4 RBAC — role × endpoint enforcement matrix

Hit each endpoint directly (curl) so the gate is tested at the API layer, not just hidden in the UI. Expected = HTTP status.

| ID          | Role       | Endpoint                                  | Pre  | Expected                                          | Sev | Status |
| ----------- | ---------- | ----------------------------------------- | ---- | ------------------------------------------------- | --- | ------ |
| TC-RBAC-100 | cashier    | `POST /accounting/vouchers`               | L2   | 403 FORBIDDEN                                     | P1  | `[ ]`  |
| TC-RBAC-101 | cashier    | `POST /payroll/run`                        | L2   | 403 FORBIDDEN                                     | P1  | `[ ]`  |
| TC-RBAC-102 | cashier    | `POST /purchases/:id/pay`                  | L2   | 403 FORBIDDEN                                     | P1  | `[ ]`  |
| TC-RBAC-103 | cashier    | `DELETE /products/:id`                     | L2   | 403 FORBIDDEN                                     | P1  | `[ ]`  |
| TC-RBAC-104 | cashier    | `PUT /store/me`                            | L2   | 403 FORBIDDEN                                     | P1  | `[ ]`  |
| TC-RBAC-105 | cashier    | `POST /sales/:id/return`                   | L2   | 403 — return requires `sales:void`                | P1  | `[ ]`  |
| TC-RBAC-106 | cashier    | `POST /sales`                              | L2   | 200/201 ALLOWED                                   | P1  | `[ ]`  |
| TC-RBAC-107 | cashier    | `POST /products`                           | L2   | 201 ALLOWED                                       | P1  | `[ ]`  |
| TC-RBAC-108 | cashier    | `POST /purchases` (create PO)              | L2   | 201 ALLOWED                                       | P2  | `[ ]`  |
| TC-RBAC-109 | cashier    | `POST /pos/calculate`                      | L2   | 200 ALLOWED                                       | P1  | `[ ]`  |
| TC-RBAC-110 | manager    | `POST /purchases/:id/grn` (receive)        | L3   | 200 ALLOWED                                       | P2  | `[ ]`  |
| TC-RBAC-111 | manager    | `POST /sales/:id/return`                   | L3   | 200 ALLOWED                                       | P1  | `[ ]`  |
| TC-RBAC-112 | accountant | `POST /accounting/vouchers` (balanced)     | L4   | 201 ALLOWED                                       | P1  | `[ ]`  |
| TC-RBAC-113 | accountant | `POST /sales` (create sale)                | L4   | 403 FORBIDDEN — accountant cannot ring sales      | P1  | `[ ]`  |
| TC-RBAC-114 | ca/manager | `POST /gst/reconcile/2a/:period`           | L3   | 200 ALLOWED — read-style POST, not blocked        | P1  | `[ ]`  |
| TC-RBAC-115 | manager    | `POST /accounting/bank-reconciliation`     | L3   | 200 ALLOWED — read-style POST                     | P2  | `[ ]`  |
| TC-RBAC-116 | accountant | `POST /payroll/preview/:emp/:period`       | L4   | 200 ALLOWED — read-style POST                     | P2  | `[ ]`  |
| TC-RBAC-117 | manager    | `POST /accounting/vouchers`                | L3   | 403 — manager is view-only on accounting          | P2  | `[ ]`  |
| TC-RBAC-118 | cashier    | `GET /payroll/employees`                   | L2   | 403 FORBIDDEN                                     | P2  | `[ ]`  |

> Rows 106–109/114–116 are the "must-not-over-restrict" half — a cashier blocked from billing, or a CA blocked from reconciliation, is as much a bug as a cashier allowed to run payroll. (114–116 specifically guard the regression where read-style POSTs were wrongly gated as `create`.)

### 33.5 Sale idempotency

| ID          | Pre  | Steps                                                                                                                                                       | Expected                                                                                                                              | Sev | Status |
| ----------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-ATOM-050 | L2   | `POST /sales` twice **sequentially** with identical body carrying `"idempotencyKey":"k-abc-001"`.                                                           | First → 201 new sale. Second → SAME sale (same `_id`+`invoiceNumber`); no second document.                                            | P1  | `[ ]`  |
| TC-ATOM-051 | L2   | Two **concurrent** `POST /sales` with the same `idempotencyKey` (parallel).                                                                                  | Exactly ONE sale persists; loser returns the winner's doc or a clean dup-key error — never a second sale, never 500.                  | P1  | `[ ]`  |
| TC-ATOM-052 | L2   | Two `POST /sales` with **no** `idempotencyKey`, same cart.                                                                                                    | BOTH succeed — two distinct sales. (Regression: keyless sales must not collide on a null-key unique index.)                           | P1  | `[ ]`  |
| TC-ATOM-053 | L2   | DB check: `sales` index on `idempotencyKey`.                                                                                                                  | Unique with `partialFilterExpression: { idempotencyKey: { $type: 'string' } }` — nulls/absent excluded.                              | P2  | `[ ]`  |

### 33.6 Invoice numbering under concurrency (range allocator)

| ID          | Pre  | Steps                                                                                                                | Expected                                                                                                                  | Sev | Status |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-ATOM-060 | L2   | Fire N=20 concurrent `POST /sales` (no key) at one store.                                                            | All 20 commit; 20 UNIQUE `invoiceNumber`s. No duplicate ever.                                                             | P1  | `[ ]`  |
| TC-ATOM-061 | L2   | Inspect sequence numbers.                                                                                            | Increasing per store prefix; gaps ACCEPTABLE (rolled-back/abandoned block tail); duplicates NOT.                          | P1  | `[ ]`  |
| TC-ATOM-062 | L1,L2| Two branches (different `invoicePrefix`) bill concurrently.                                                          | Each advances its OWN counter; no cross-branch clash.                                                                     | P1  | `[ ]`  |
| TC-ATOM-063 | L2   | Migration: a store with legacy `invoiceCounter=N`, first sale after upgrade.                                        | New number = N+1 (seeded from legacy counter); no collision with already-issued INV-…-N.                                  | P1  | `[ ]`  |
| TC-ATOM-064 | L2   | After burst, Sales History count vs distinct invoice numbers.                                                       | Equal — no two rows share a number.                                                                                       | P1  | `[ ]`  |

### 33.7 Sale return on inclusive-priced item

| ID          | Pre   | Steps                                                                                                                                  | Expected                                                                                                                            | Sev | Status |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-SALE-100 | L3,D1 | Sell `INCL-250` qty 1 (paid ₹250). `POST /sales/:id/return` that line.                                                                 | Refund = **₹250** — exactly what the customer paid. NOT ₹280. (Regression fixed: no GST re-added on inclusive.)                     | P1  | `[ ]`  |
| TC-SALE-101 | L3,D1 | Inspect return ledger postings.                                                                                                        | Revenue reversed by ex-tax ≈₹223.21; Output GST reversed ≈₹26.79; Cash/Receivable credited ₹250. Σ Dr = Σ Cr.                       | P1  | `[ ]`  |
| TC-SALE-102 | L3,D1 | Sell `INCL-250` qty 1, 10% discount (paid ₹225). Return.                                                                               | Refund = ₹225. Tax reversed = extracted portion of ₹225.                                                                            | P1  | `[ ]`  |
| TC-SALE-103 | L3,D1 | Return one inclusive line from a mixed sale.                                                                                            | Only that line's gross refunded; exclusive line untouched; stock restored.                                                          | P2  | `[ ]`  |

### 33.8 Ledger debit = credit invariants

| ID          | Pre   | Steps                                                                                                                      | Expected                                                                                                        | Sev | Status |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-BOOK-150 | L1,D1 | After a POS sale, query ledger entries for that sale's `referenceId`.                                                      | `Σ debits == Σ credits` within ₹0.01.                                                                          | P1  | `[ ]`  |
| TC-BOOK-151 | L1    | After a GRN, query that purchase's entries.                                                                                | Dr Purchase + Dr Input GST == Cr Sundry Creditors; payable derived = subtotal+tax. Σ Dr == Σ Cr.               | P1  | `[ ]`  |
| TC-BOOK-152 | L3    | After a sale return, query reversal postings.                                                                             | Σ Dr == Σ Cr; net of original + reversal = 0 on affected accounts.                                              | P1  | `[ ]`  |
| TC-BOOK-153 | L1    | `POST /accounting/vouchers` balanced multi-leg (Dr 3 legs, Cr 2 legs, equal sums).                                        | 201; balances.                                                                                                  | P1  | `[ ]`  |
| TC-BOOK-154 | L1    | `POST /accounting/vouchers` with Σ Dr ≠ Σ Cr (Dr 100, Cr 90).                                                              | 400 `VOUCHER_UNBALANCED`; no partial entries.                                                                   | P1  | `[ ]`  |
| TC-BOOK-155 | L1    | Voucher with a single leg, or a negative/zero amount.                                                                      | Blocked `VOUCHER_INVALID` — ≥2 entries, all amounts > 0.                                                        | P2  | `[ ]`  |
| TC-BOOK-156 | L1,D1 | Run `node server/scripts/integrity-scan.js` against the dataset.                                                          | Exit 0; ledger balanced, per-voucher balanced, no orphaned sales/purchases. Any drift → non-zero exit + report. | P1  | `[ ]`  |

### 33.9 E-Invoice (IRN) — generate / cancel / eligibility / masking

Provider = `mock` unless stated. Routes: `POST /api/sales/:id/einvoice/generate` and `/cancel`.

| ID         | Pre   | Steps                                                                                                                                       | Expected                                                                                                                          | Sev | Status |
| ---------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-GST-250 | L1,D1 | E-invoice on (mock). Ring a **B2B** sale (buyer GSTIN). Generate.                                                                            | 200/201; IRN + signed QR persisted on the sale. Printed invoice shows IRN + QR.                                                   | P1  | `[ ]`  |
| TC-GST-251 | L1    | Cancel within **24 h** with `{reason:'3',remarks:'order cancelled'}`.                                                                         | 200; IRN-cancelled, timestamp + reason stored; reprint shows no active IRN.                                                       | P1  | `[ ]`  |
| TC-GST-252 | L1    | Cancel after 24 h (fixture).                                                                                                                 | Rejected `EINV_CANCEL_WINDOW_EXPIRED`; IRN stays active.                                                                          | P2  | `[ ]`  |
| TC-GST-253 | L1    | Generate IRN for a **B2C** sale (no buyer GSTIN).                                                                                            | 400 `EINV_INELIGIBLE` — B2B only; no IRN.                                                                                         | P1  | `[ ]`  |
| TC-GST-254 | L1    | Generate IRN for a **voided/returned** sale.                                                                                                 | Rejected `EINV_INELIGIBLE`; no IRN.                                                                                               | P1  | `[ ]`  |
| TC-GST-255 | L1    | Generate IRN twice on the same sale.                                                                                                         | Second returns existing IRN / `EINV_ALREADY_EXISTS`; never a second distinct IRN.                                                | P2  | `[ ]`  |
| TC-GST-256 | L1    | Save GSP `clientSecret` + `password`. Re-fetch `GET /store/me`.                                                                              | Returned MASKED (`••••••••<last4>`); full value never leaves the server.                                                          | P1  | `[ ]`  |
| TC-GST-257 | L1    | Save E-Invoice settings again sending the masked value back.                                                                                 | Real secret preserved — incoming `•`-prefixed value ignored, not written over.                                                   | P1  | `[ ]`  |
| TC-GST-258 | L2    | Cashier calls generate.                                                                                                                       | 403 — generate is `sales:update` (cashier is create-only).                                                                        | P2  | `[ ]`  |

### 33.10 Scan-bill / OCR purchase extraction

Browser flow at `/dashboard/scan-bill`; `lib/bill-scan.ts`, `lib/pdf-extract.ts`, `lib/invoice-extractor.ts`, `lib/ocr.ts`.

| ID         | Pre   | Steps                                                                                                                            | Expected                                                                                                                         | Sev | Status |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-OCR-001 | L1,D1 | Upload a **digital (text-layer) PDF** invoice.                                                                                  | Text read directly from PDF layer (no OCR). Supplier/invoice/date + line items parsed into the draft.                            | P1  | `[ ]`  |
| TC-OCR-002 | L1    | Upload a **scanned image** (JPG/PNG).                                                                                            | OCR runs with progress; recognised text feeds the extractor; line items surface.                                                 | P1  | `[ ]`  |
| TC-OCR-003 | L1    | Inspect parsed line items: description, qty, rate, amount, GST%.                                                                | Columns mapped; numerics parsed; HSN read from the right column (not from a number inside the name).                             | P1  | `[ ]`  |
| TC-OCR-004 | L1    | A parsed line matches an existing product (name/HSN).                                                                           | Auto-matched + pre-linked to the PO line; unmatched rows flagged with Find/Create.                                              | P1  | `[ ]`  |
| TC-OCR-005 | L1    | Upload unsupported file (`.docx`).                                                                                              | Rejected with a clear message; no extraction.                                                                                    | P2  | `[ ]`  |
| TC-OCR-006 | L1    | Upload a corrupt PDF (rejected), then a valid PDF.                                                                             | First shows a graceful error (no crash/hang); the valid one parses — prior failure doesn't poison state.                         | P1  | `[ ]`  |
| TC-OCR-007 | L1    | Edit a mis-read qty/rate, then "Create draft PO".                                                                              | Edits respected; `POST /purchases` `status:'draft'` created from corrected data.                                                | P2  | `[ ]`  |

### 33.11 Resilience — health, readiness, rate limit, graceful shutdown

| ID          | Pre  | Steps                                                                                                                       | Expected                                                                                                                  | Sev | Status |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TC-EDGE-050 | L0   | `curl $BASE/health`.                                                                                                        | 200 `{status:'OK', timestamp}`. Never touches the DB.                                                                     | P1  | `[ ]`  |
| TC-EDGE-051 | L0   | `curl $BASE/ready` with DB connected.                                                                                       | 200 `{status:'READY', db:'connected'}`.                                                                                   | P1  | `[ ]`  |
| TC-EDGE-052 | L0   | Stop MongoDB, `curl -i $BASE/ready`.                                                                                        | **503** `NOT_READY`. LB pulls the instance from rotation.                                                                 | P1  | `[ ]`  |
| TC-EDGE-053 | L0   | With DB down, `curl $BASE/health`.                                                                                          | Still **200** — liveness independent of DB; orchestrator doesn't kill a busy-but-alive process.                          | P1  | `[ ]`  |
| TC-EDGE-054 | L0   | POST `/auth/login` wrong password >10×/15min.                                                                              | After threshold → **429** with `Retry-After`; legit login works after the window.                                        | P1  | `[ ]`  |
| TC-EDGE-055 | L0   | With `MAX_INFLIGHT_REQUESTS` set and saturated, hit `/health` + `/ready`.                                                  | Probes still answer (exempt from the overload throttle); normal routes return 503 `OVERLOADED`.                          | P2  | `[ ]`  |
| TC-EDGE-056 | L1   | `SIGTERM` the API while a sale is in flight.                                                                               | In-flight request completes (or fails cleanly); server drains then exits; no half-write.                                 | P1  | `[ ]`  |

---

### Changelog

- **v1.2 (2026-06-16)** — Added §33: GST-inclusive POS cart math (₹250-not-₹280, intra/inter-state extraction, inclusive+discount, qty scaling), inventory-form toggle persistence regression + store `defaultGSTMode`, RBAC role × endpoint matrix (incl. the read-style-POST allow cases 114–116), sale idempotency (keyed dedupe + keyless coexistence), concurrent invoice-number uniqueness via the range allocator + legacy-seed migration, sale-return refund parity on inclusive items, ledger Σ Dr = Σ Cr invariants + integrity-scan, e-invoice IRN generate/cancel/eligibility/secret masking, scan-bill OCR + digital-PDF + auto-match + reject-then-accept, and resilience (/health, /ready 503-on-DB-down, login rate-limit 429, graceful shutdown).
- **v1.1 (2026-05-22)** — Added §32 covering: GST-inclusive PO lines, GRN ancillary modes (landed cost vs direct expense), draft-PO Submit/Cancel + advance payment, cancelled-PO payable invariant, dedicated Suppliers page, inventory Reorder → draft PO, POS parked carts + live cart persistence, POS Focus search button, Twilio WhatsApp provider, end-to-end financial invariants.
- **v1.0 (2026-05-18)** — Initial test plan, sections §0–§31.
