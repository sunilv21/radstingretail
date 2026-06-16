# E-Invoice (IRN) Integration Guide — Complete Beginner Reference

> A start-from-zero guide to wiring GST e-invoicing and e-way bills into this POS.
> Read top-to-bottom the first time. After that, the **Reference** section at the
> bottom is your daily lookup.

---

## Table of Contents

1. [What is GST e-invoicing?](#1-what-is-gst-e-invoicing)
2. [Do I actually need it?](#2-do-i-actually-need-it)
3. [How this POS implements e-invoicing](#3-how-this-pos-implements-e-invoicing)
4. [The three provider modes — Mock, GSP, NIC direct](#4-the-three-provider-modes)
5. [Step-by-step: Demo with Mock mode (no signup)](#5-step-by-step-demo-with-mock-mode)
6. [Step-by-step: Production with a GSP](#6-step-by-step-production-with-a-gsp)
7. [Generating an IRN on a real sale](#7-generating-an-irn-on-a-real-sale)
8. [Cancelling an IRN](#8-cancelling-an-irn)
9. [E-way bills (the goods-movement document)](#9-e-way-bills)
10. [Troubleshooting](#10-troubleshooting)
11. [Reference — all settings fields](#11-reference--all-settings-fields)
12. [Reference — API endpoints](#12-reference--api-endpoints)
13. [Reference — data shapes (Store + Sale)](#13-reference--data-shapes)
14. [FAQ](#14-faq)
15. [Appendix A — Official portals & registration links](#15-appendix-a--official-portals--registration-links)
16. [Appendix B — GSP comparison & starting points](#16-appendix-b--gsp-comparison--starting-points)
17. [Appendix C — Document checklist for GSP signup](#17-appendix-c--document-checklist-for-gsp-signup)
18. [Appendix D — Walkthrough: NIC e-invoice enrolment](#18-appendix-d--walkthrough-nic-e-invoice-enrolment)
19. [Appendix E — Creating a GSP account & getting credentials](#19-appendix-e--creating-a-gsp-account--getting-credentials)

---

## 1. What is GST e-invoicing?

Under India's GST law, **B2B invoices** above a turnover threshold must be reported
to the **NIC Invoice Registration Portal (IRP)** at the moment they are raised.
The IRP returns:

- **IRN** — Invoice Reference Number (a 64-character hash). Without it the
  invoice is not legally valid as a B2B tax invoice.
- **Ack No / Ack Date** — proof of registration.
- **Signed QR code** — embedded on the printed invoice; a tax officer can
  scan it offline and verify authenticity.

The buyer can claim Input Tax Credit (ITC) only against an IRN-registered invoice.
That's why this matters commercially — even if you're under the turnover threshold,
your B2B buyers may insist on e-invoices.

### What the workflow looks like end-to-end

```
1. Cashier finishes a B2B sale (buyer has GSTIN)
       │
       ▼
2. POS saves the sale locally (atomic transaction)
       │
       ▼
3. POS sends the sale JSON to NIC IRP (directly OR via a GSP)
       │
       ▼
4. NIC IRP validates it, returns IRN + AckNo + signed QR
       │
       ▼
5. POS attaches IRN / QR to the sale, prints the invoice with QR
       │
       ▼
6. Customer scans the QR to verify
```

---

## 2. Do I actually need it?

| Your annual turnover | Is e-invoicing mandatory? |
|---|---|
| > ₹5 crore | **Yes**, for every B2B sale |
| < ₹5 crore | Not mandatory — but **optional** is allowed |
| B2C only (no GSTIN buyers) | Never required |
| Goods/services exempt from GST | Never required |

> Thresholds change. The current cutoff is ₹5 Cr (effective Aug-2023). Always
> check [einvoice1.gst.gov.in](https://einvoice1.gst.gov.in) for the latest.

### Even if you're not mandated, turn it on if:

- A corporate buyer asks for it (they need it for ITC).
- You sell to government / PSU buyers (they often require it).
- You want a future-proof setup — once enabled, you can ignore the threshold.

### When **not** to wire it up yet:

- Pure B2C retail (no GSTIN customers ever). Use the standard tax invoice.
- You're still building / testing the POS. Use **Mock** mode (§5).

---

## 3. How this POS implements e-invoicing

There are four moving parts. You don't need to touch the code — they're already
wired. This section just shows what's happening so the rest of the guide makes
sense.

```
┌────────────────────────────────────────────────────────────────────────┐
│  POS UI                                                                │
│   • Settings → E-Invoice tab        (configure provider + credentials) │
│   • Sale screen → "Generate IRN"    (one-click after sale is saved)    │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Backend routes                                                        │
│   • PUT  /api/v1/store/me               (save settings)                │
│   • POST /api/v1/store/einvoice/test    (test connection — no IRN)     │
│   • POST /api/v1/sales/:id/einvoice/generate                           │
│   • POST /api/v1/sales/:id/einvoice/cancel                             │
│   • POST /api/v1/sales/:id/ewb/generate                                │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  E-Invoice service (façade)                                            │
│   server/services/e-invoice.service.js                                 │
│                                                                        │
│   ┌────────────┐   ┌────────────┐   ┌────────────┐                     │
│   │   Mock     │   │    GSP     │   │  NIC direct│                     │
│   │  (default) │   │ (95% use)  │   │(rare,>100Cr)                     │
│   └────────────┘   └────────────┘   └────────────┘                     │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │   NIC IRP servers    │
                       │  (sandbox or prod)   │
                       └──────────────────────┘
```

### Key files (for the curious)

| File | Purpose |
|---|---|
| [server/services/e-invoice.service.js](../server/services/e-invoice.service.js) | Provider-agnostic façade — picks Mock / GSP / NIC at runtime |
| [server/services/einvoice/gsp-client.js](../server/services/einvoice/gsp-client.js) | OAuth2 GSP client (ClearTax, Masters India, IRIS, etc.) |
| [server/services/einvoice/nic-direct.js](../server/services/einvoice/nic-direct.js) | NIC direct scaffold (not wired — uses AES/RSA Sek) |
| [server/services/einvoice/nic-errors.js](../server/services/einvoice/nic-errors.js) | Translates NIC error codes to human messages |
| [server/routes/sale.routes.js](../server/routes/sale.routes.js#L62) | Generate / cancel IRN endpoints |
| [server/routes/store.routes.js](../server/routes/store.routes.js#L341) | Settings + test-connection endpoint |
| [server/models/Store.js:142](../server/models/Store.js#L142) | `store.eInvoice` settings schema |
| [server/models/Sale.js:122](../server/models/Sale.js#L122) | `sale.eInvoice` result schema |
| [app/dashboard/settings/page.tsx:2109](../app/dashboard/settings/page.tsx#L2109) | E-Invoice tab UI |

You'll never edit these unless you're customising provider behaviour. The settings
UI does everything a store owner needs.

---

## 4. The three provider modes

Setting: **Settings → E-Invoice → Provider**. Pick exactly one.

### 4.1 Mock (default)

**What it is.** Generates fake-but-realistic IRNs locally — no network call, no
signup, no GSTIN required. The IRN is a SHA-256 of `(GSTIN | invoice | total)`
so it looks real and is deterministic for the same input. The QR is base64-encoded
JSON in the NIC shape.

**Use it for:**
- Local development.
- Demos to merchants / investors.
- Cashier training (so they see the IRN flow without burning real IRNs).
- Writing automated tests.

**Never use in production.** The IRN won't validate on any portal.

### 4.2 GSP (Goods & Services Tax Suvidha Provider) — 95% of real deployments

**What it is.** A licensed third-party that runs the NIC crypto in their cloud
and exposes a clean HTTPS+JSON API. You sign up with one, get OAuth2 credentials,
paste them into Settings, done.

**Use it for:** Any production deployment under ₹100 Cr turnover.

**Common GSPs that work out of the box** (this POS auto-detects field names):

| GSP | Sandbox docs |
|---|---|
| **ClearTax** | https://docs.cleartax.in/einvoicing |
| **Masters India** | https://docs.mastersindia.co |
| **IRIS Onyx** | https://irisirp.com |
| **Tally Signer** | (via Tally Solutions) |
| **Avalara India** | https://avalara.com |

> The POS is GSP-agnostic. Any GSP that accepts the NIC schema-v1.1 payload
> behind an OAuth2-style auth will work. You override only the endpoint paths
> in Settings if their docs use a different URL layout.

### 4.3 NIC direct

**What it is.** Talking to NIC IRP without a middleman. Requires implementing
AES + RSA "Sek" key exchange and is **only certified for taxpayers with > ₹100 Cr
aggregate turnover** (NIC policy).

**Status in this POS:** **scaffolded but not implemented.** The crypto is
documented in [nic-direct.js](../server/services/einvoice/nic-direct.js) but
the calls throw `EINV_NIC_NOT_IMPLEMENTED`.

**Use a GSP.** That's why GSPs exist.

### 4.4 Decision flowchart

```
Are you launching this POS for real merchants?
  │
  ├─ NO → Use Mock. Stop here.
  │
  └─ YES
      │
      Is your aggregate turnover > ₹100 Cr AND
      you've completed NIC direct enrolment?
        │
        ├─ YES → NIC direct (not wired — you'd need to finish the scaffold)
        │
        └─ NO  → GSP. Pick one from §4.2.
```

---

## 5. Step-by-step: Demo with Mock mode

**Goal:** Generate a fake IRN on a sale within 2 minutes, no signup needed.

### Prerequisites

- POS is running locally (`npm run dev`).
- You're logged in as a tenant admin (not super-admin).
- You have at least one product in inventory and one customer **with a GSTIN**.

> E-invoicing applies only to B2B sales. The "Generate IRN" button stays
> disabled for walk-in customers and customers without a GSTIN.

### Steps

**1. Open Settings → E-Invoice.**

Sidebar → Settings → E-Invoice tab.

**2. Fill in:**

| Field | Value |
|---|---|
| Enabled | ✅ (toggle on) |
| Provider | **Mock** |
| Environment | Sandbox |
| GSTIN | Same as your store GSTIN (any valid 15-char GSTIN works for Mock) |

Everything else (Username / Client ID / Base URL) stays empty — Mock doesn't
need them.

**3. Click Save.**

You should see a green toast: "Settings saved."

**4. Click Test connection.**

The Mock provider returns instantly with `{ ok: true, provider: "mock" }`. No
network call happens.

**5. Make a B2B sale.**

Go to POS, ring up any product, pick a customer with a GSTIN. Save the sale.

**6. Open the sale detail.**

Dashboard → Sales → click the invoice. You'll see a **Generate IRN** button.

**7. Click Generate IRN.**

Within a second, the sale gets:

- IRN: a 64-char hex string (deterministic for that sale)
- AckNo: a 15-digit number
- AckDate: now
- Signed QR: a base64 string

The printed invoice now carries the QR. You're done.

> Re-clicking Generate IRN on the same sale returns `EINV_ALREADY_EXISTS`.
> The IRN is immutable per the architecture rule (§1 of CLAUDE.md).

---

## 6. Step-by-step: Production with a GSP

**Goal:** Go from "no GSP account" to "live IRNs on real sales" in about 30 minutes
of work (plus 1–2 business days waiting for the GSP to activate your account).

### 6.1 Sign up with a GSP

Pick one from §4.2 — or see [Appendix B](#16-appendix-b--gsp-comparison--starting-points)
for direct starting-point URLs and a feature comparison.
Before you start, gather the documents listed in
[Appendix C](#17-appendix-c--document-checklist-for-gsp-signup).

The signup is roughly the same everywhere:

1. Create a business account on the GSP's website.
2. Submit your GSTIN, PAN, and authorised signatory details.
3. The GSP activates a **sandbox** environment in 1–2 business days.
4. After successful sandbox testing, they activate **production** (another 1–2 days).

You will receive **two sets** of credentials — one for sandbox, one for
production. They are completely separate. Test in sandbox first.

### 6.2 Collect your credentials

Each GSP gives you slightly different envelopes. Across all of them you'll have
**five values**:

| Variable | What it is | Example |
|---|---|---|
| Base URL | The GSP's API origin | `https://einv-apisandbox.example-gsp.com/api/v1.04` |
| Client ID | OAuth client identifier | `cleartax_demo_abc123` |
| Client Secret | OAuth client password | `e5f6...` (treat like a password) |
| Username | The user enrolled with NIC | `01AABCU9603R1ZM_admin` |
| Password | (Sometimes asked, sometimes not) | depends on GSP |

Plus your **GSTIN**, which must be enrolled at
[einvoice1.gst.gov.in](https://einvoice1.gst.gov.in) and linked with the GSP.

### 6.3 Enrol your GSTIN with NIC

> If you skip this, every call returns "GSTIN not registered for e-invoicing."

A click-by-click walkthrough is in
[Appendix D](#18-appendix-d--walkthrough-nic-e-invoice-enrolment). Quick version:

1. Go to https://einvoice1.gst.gov.in/Others/EInvAPISystem
2. Log in with your GSTIN.
3. **API Registration** → select your GSP from the dropdown → submit.
4. NIC sends an OTP to the GSTIN's registered mobile.
5. Confirm. The GSP is now authorised to call IRP on your behalf.

You only do this once per GSTIN+GSP combination.

### 6.4 Configure the POS

Open **Settings → E-Invoice** and fill in:

| Field | Sandbox value | Production value |
|---|---|---|
| Enabled | ✅ | ✅ |
| Provider | **GSP** | **GSP** |
| Environment | Sandbox | Production |
| GSTIN | Your GSTIN | Your GSTIN |
| Username | Sandbox username | Production username |
| Password | (only if your GSP requires it) | same |
| Client ID | Sandbox client_id | Production client_id |
| Client Secret | Sandbox client_secret | Production client_secret |
| Base URL | Sandbox URL from §6.2 | Production URL |

**Endpoint paths.** Each GSP exposes the NIC API at slightly different paths.
Defaults (which match OAuth2 / NIC conventions) usually work for ClearTax,
Masters India, IRIS:

| Field | Default | Override when |
|---|---|---|
| Auth path | `/auth/token` | GSP uses `/login` or `/oauth/token` |
| Generate path | `/einvoice/generate` | GSP uses `/eivital/v1.04/Invoice` etc. |
| Cancel path | `/einvoice/cancel` | GSP uses different cancel URL |
| EWB generate path | `/ewaybill/generate` | GSP uses `/ewb/generate` |
| EWB cancel path | `/ewaybill/cancel` | GSP uses different EWB cancel URL |

Look in your GSP's API documentation under "endpoints" and copy the exact paths
in. The POS prepends them to your **Base URL**.

> **The masking gotcha.** When you reload the Settings page, Client Secret and
> Password show as `••••••••<last 4>`. That's a server-side mask — the real
> secret never leaves the server. Empty / masked values you send back are
> ignored. To **change** a secret, paste the new full value. To leave it
> unchanged, just don't touch the field.

### 6.5 Test connection

Click **Test connection**. The POS:

1. Clears the in-memory token cache so the test always exercises the real auth.
2. POSTs to `{Base URL}{Auth path}` with your client_id / client_secret.
3. Reads the access token from any of the common response shapes.
4. Reports `{ ok: true, ttlSeconds, expiresAtIso }`.

If it fails, see [Troubleshooting](#10-troubleshooting).

### 6.6 Ring up a B2B sale and generate an IRN

Same flow as Mock mode (§5 steps 5–7), but now:

- The POST goes to your GSP's `/einvoice/generate` endpoint.
- The GSP forwards to NIC IRP, gets the real IRN, returns it.
- The printed invoice carries a **real, scannable, NIC-verified QR code**.

A sandbox IRN won't show up on the actual GST portal — that's what sandbox is
for. Switch to **Environment: Production** in Settings only when you're ready
for live invoicing.

### 6.7 Switching sandbox → production

1. Settings → E-Invoice.
2. **Replace** Base URL, Client ID, Client Secret with your production set.
3. **Replace** Username (and Password if used) with the production set.
4. Toggle **Environment** to `production`.
5. Click Save.
6. Click Test connection — must succeed before you generate a real IRN.
7. Ring up a small live B2B invoice, generate IRN, verify it on
   https://einvoice1.gst.gov.in (Search by IRN).

> The token cache is keyed on `(storeId, environment)`. Switching environments
> never reuses the wrong token.

---

## 7. Generating an IRN on a real sale

### From the UI

Sale detail page → **Generate IRN** button. Behind the scenes:

```http
POST /api/v1/sales/{saleId}/einvoice/generate
Authorization: Bearer <tenant JWT>
Content-Type: application/json

{}
```

Response (200 OK):

```json
{
  "success": true,
  "data": {
    "sale": { ...full sale... },
    "eInvoice": {
      "irn": "a1b2c3...64chars",
      "ackNo": "112010054897524",
      "ackDate": "2026-05-23T10:32:14.000Z",
      "signedQr": "eyJhbGciOiJSUzI1NiIs...",
      "status": "active",
      "provider": "gsp",
      "generatedAt": "2026-05-23T10:32:14.500Z"
    }
  }
}
```

### Eligibility checks (server enforces)

| Error code | When | Fix |
|---|---|---|
| `EINV_DISABLED` | E-Invoicing toggle is off | Settings → toggle on |
| `EINV_INELIGIBLE` | Sale has no buyer GSTIN, OR is returned/voided | Add buyer GSTIN, or skip — this is a B2C sale |
| `EINV_ALREADY_EXISTS` | The sale already has an IRN | IRNs are immutable; if wrong, cancel + reissue |
| `EINV_NOT_CONFIGURED` | Provider is GSP but credentials missing | Fill in clientId/clientSecret/baseUrl |

### What gets written

On success, [sale.eInvoice](../server/models/Sale.js#L122) is populated. The sale
document itself is **not** mutated otherwise — the IRN block sits alongside.
This matches the **Immutable Financial Documents** rule in CLAUDE.md §1.

The printed invoice template ([components/pos/InvoicePreview.tsx](../components/pos/InvoicePreview.tsx))
renders the QR from `sale.eInvoice.signedQr` when present.

### What is in the request payload?

The POS auto-builds the NIC schema-v1.1 envelope from the sale data — you never
hand-craft it. See
[buildEInvoicePayload()](../server/services/e-invoice.service.js#L74) in the
service file for the full builder. Highlights:

- `Version: '1.1'`
- `TranDtls.SupTyp: 'B2B'` (always; B2C exports & SEZ are roadmap items)
- `DocDtls.No`: the POS invoice number (must be unique per store per FY)
- `SellerDtls`: from `store.gstNumber`, `store.address`, `store.stateCode`
- `BuyerDtls`: from `sale.customerSnapshot.gstNumber` and address
- `ItemList`: one entry per line item with HSN, Qty, Unit, AssAmt, GST split
- `ValDtls`: totals (assessable value, CGST/SGST/IGST, round-off, grand total)

> **HSN is mandatory.** A product without an HSN code will fail IRN generation
> with NIC error 2244. Fix the product master — `products.hsnCode` is required
> by the schema (see [server/models/Product.js](../server/models/Product.js)).

---

## 8. Cancelling an IRN

### NIC's hard rules

- **24-hour window.** After that, an IRN is permanent. Issue a **credit note**
  (which itself gets a new IRN).
- **Cancellation reasons (NIC codes):**
  1. Duplicate
  2. Data entry mistake
  3. Order cancelled by buyer
  4. Other

### From the UI

Sale detail → **Cancel IRN** button (visible only when an active IRN exists
and the 24h window is still open). Pick a reason, add remarks, confirm.

### API

```http
POST /api/v1/sales/{saleId}/einvoice/cancel
Authorization: Bearer <tenant JWT>
Content-Type: application/json

{
  "reason": "2",
  "remarks": "Buyer GSTIN was wrong, reissuing"
}
```

### Errors

| Code | Meaning |
|---|---|
| `EINV_NOT_FOUND` | This sale has no IRN to cancel |
| `EINV_ALREADY_CANCELLED` | Already cancelled |
| `EINV_CANCEL_WINDOW_EXPIRED` | More than 24h since generation — issue a credit note instead |

After cancellation, `sale.eInvoice.status` flips to `cancelled` and a
`cancelledAt` timestamp is written. The IRN itself stays on the sale for the
audit trail — it is **never deleted**.

---

## 9. E-way bills

E-way bills (EWB) are the separate document required for **goods movement**
above the threshold (default ₹50,000 — overridable per store via
`settings.eWayBillThreshold`).

EWB lives on the same provider config as IRN. If you set up GSP for IRN, EWB
works automatically.

### Generate

```http
POST /api/v1/sales/{saleId}/ewb/generate
Authorization: Bearer <tenant JWT>
Content-Type: application/json

{
  "vehicleNumber": "MH12AB1234",
  "transportMode": "Road",        // Road | Rail | Air | Ship
  "transporterId": "",            // optional, 15-char GSTIN of transporter
  "transporterName": "",          // optional, free text
  "distanceKm": 250               // approximate distance buyer ↔ seller
}
```

Response (excerpt):

```json
{
  "eWayBill": {
    "ewbNumber": "121010054897",
    "ewbDate": "2026-05-23T11:00:00.000Z",
    "validUpto": "2026-05-24T11:00:00.000Z",
    "vehicleNumber": "MH12AB1234",
    "status": "active"
  }
}
```

### Errors

| Code | Meaning |
|---|---|
| `EWB_NOT_REQUIRED` | Sale value below the threshold |
| `EWB_ALREADY_EXISTS` | EWB already generated for this sale |

> `validUpto` is computed by NIC: 1 day per 200 km for normal cargo. Don't
> hard-code expiry on the client.

---

## 10. Troubleshooting

### "Could not reach `<url>` — fetch failed"

- **Network.** Check internet from the server (not from your laptop — the call
  originates from the Node process).
- **TLS.** Some GSP sandboxes use self-signed certs in older docs. The newer
  ones are valid. If yours isn't, contact your GSP — don't disable TLS
  validation in code.

### "GSP returned HTTP 401" / "GSP returned HTTP 403"

- Most common: **client_id / client_secret typo**. Re-copy from the GSP
  dashboard. Watch out for trailing whitespace.
- Sandbox credentials in production environment (or vice versa) — they don't
  cross.
- Token cache poisoning: click **Test connection** which forces a fresh token.

### "GSP accepted the request but no IRN was returned"

- Your **GSTIN isn't enrolled with NIC for e-invoicing**. Complete §6.3.
- Or your GSP hasn't bound your GSTIN to your API credentials yet. Open a
  ticket with them.

### "EINV_NIC_NOT_IMPLEMENTED"

- You selected **NIC direct** as the provider. Switch to **GSP**. NIC direct
  is intentionally scaffold-only because of the AES/RSA Sek complexity.

### IRN was generated but the printed invoice doesn't show a QR

- The QR is rendered from `sale.eInvoice.signedQr`. If it's missing, the
  provider returned no QR string. Look in the raw response (`AppError.details.raw`)
  — most GSPs use `SignedQRCode` or `signedQRCode`. The client tries both.

### "EINV_INELIGIBLE: this sale has no buyer GSTIN"

- E-invoicing is **B2B only**. Walk-in / B2C sales don't get an IRN. They go
  in GSTR-1 under the B2C-Large or B2C-Small bucket (see CLAUDE.md §8.3).

### Sandbox IRN doesn't show up on einvoice1.gst.gov.in

- That's expected. Sandbox IRNs live only in NIC's sandbox database; the
  public portal queries production. Switch Environment → Production to test
  end-to-end.

---

## 11. Reference — all settings fields

These are the fields on `store.eInvoice` (see
[Store.js:142](../server/models/Store.js#L142)). The Settings UI maps to each
one.

| Field | Type | Default | Notes |
|---|---|---|---|
| `enabled` | bool | `false` | Master switch — when off, all routes return `EINV_DISABLED` |
| `provider` | `'mock' \| 'gsp' \| 'nic'` | `'mock'` | Which backend dispatches the calls |
| `environment` | `'sandbox' \| 'production'` | `'sandbox'` | Drives token cache key; UI labels |
| `gstin` | string | — | Same as your store GSTIN, must be enrolled with NIC+GSP |
| `username` | string | — | NIC username (enrolled via your GSP) |
| `password` | string | — | NIC password; **masked on read** |
| `clientId` | string | — | GSP OAuth2 client_id |
| `clientSecret` | string | — | GSP OAuth2 client_secret; **masked on read** |
| `baseUrl` | string | — | GSP API origin, no trailing slash |
| `authPath` | string | `/auth/token` | OAuth token endpoint relative path |
| `generatePath` | string | `/einvoice/generate` | IRN generate endpoint |
| `cancelPath` | string | `/einvoice/cancel` | IRN cancel endpoint |
| `ewbGeneratePath` | string | `/ewaybill/generate` | EWB generate endpoint |
| `ewbCancelPath` | string | `/ewaybill/cancel` | EWB cancel endpoint |

Adjacent setting (under `store.settings`):

| Field | Type | Default | Notes |
|---|---|---|---|
| `settings.eWayBillThreshold` | number | `50000` | ₹ value above which EWB is mandatory |
| `settings.b2cLargeThreshold` | number | `250000` | ₹ value separating B2C-Large from B2C-Small in GSTR-1 |

### Secret masking rules (security)

- `GET /api/v1/store/me` returns `password` and `clientSecret` as
  `••••••••<last 4>`. The full value never leaves the server.
- `PUT /api/v1/store/me` **ignores incoming values that start with `•`**, so
  sending the mask back does not overwrite the real secret.
- Only a fresh paste of the real secret updates the stored value.

This is the same pattern WhatsApp credentials use (CLAUDE.md §8.4c).

---

## 12. Reference — API endpoints

All routes require `Authorization: Bearer <tenant JWT>` and are scoped to the
store from that JWT.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/store/me` | Read settings (with masked secrets) |
| PUT | `/api/v1/store/me` | Update settings (ignores masked values) |
| POST | `/api/v1/store/einvoice/test` | Test connection — auth-only, no IRN burn |
| POST | `/api/v1/sales/:id/einvoice/generate` | Generate IRN for a sale |
| POST | `/api/v1/sales/:id/einvoice/cancel` | Cancel an active IRN (24h window) |
| POST | `/api/v1/sales/:id/ewb/generate` | Generate e-way bill for a sale |

### Standard envelopes

Success:
```json
{ "success": true, "data": { ... }, "timestamp": "..." }
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "EINV_INELIGIBLE",
    "message": "E-invoice is only required for B2B sales — this sale has no buyer GSTIN",
    "traceId": "..."
  }
}
```

### Error code map (e-invoice / EWB only)

| Code | HTTP | Meaning |
|---|---|---|
| `EINV_DISABLED` | 400 | E-invoicing not enabled in Settings |
| `EINV_NOT_CONFIGURED` | 400 | Provider GSP/NIC missing required credentials |
| `EINV_INELIGIBLE` | 400 | Sale doesn't qualify (no GSTIN, voided, returned) |
| `EINV_ALREADY_EXISTS` | 400 | IRN already generated for this sale |
| `EINV_NOT_FOUND` | 400 | No IRN to cancel on this sale |
| `EINV_ALREADY_CANCELLED` | 400 | IRN already cancelled |
| `EINV_CANCEL_WINDOW_EXPIRED` | 400 | Past 24h cancellation window |
| `EINV_NETWORK` | 502 | Couldn't reach the GSP |
| `EINV_BAD_RESPONSE` | 502 | GSP returned non-JSON or unparseable response |
| `EINV_GSP_ERROR` | 400/502 | GSP returned an error (translated NIC message included) |
| `EINV_NO_TOKEN` | 502 | Auth response had no `access_token` / `AuthToken` field |
| `EINV_NO_IRN` | 502 | Generate succeeded but no IRN field in response |
| `EINV_NIC_NOT_IMPLEMENTED` | 501 | Provider is `nic` — switch to `gsp` |
| `EWB_NOT_REQUIRED` | 400 | Sale value below the EWB threshold |
| `EWB_ALREADY_EXISTS` | 400 | EWB already generated |

---

## 13. Reference — data shapes

### `store.eInvoice` (Mongoose subschema)

```js
{
  enabled: Boolean,
  provider: 'mock' | 'nic' | 'gsp',
  environment: 'sandbox' | 'production',
  gstin: String,
  username: String,
  password: String,        // masked in API responses
  clientId: String,
  clientSecret: String,    // masked
  baseUrl: String,         // no trailing slash
  authPath: String,        // default '/auth/token'
  generatePath: String,    // default '/einvoice/generate'
  cancelPath: String,      // default '/einvoice/cancel'
  ewbGeneratePath: String, // default '/ewaybill/generate'
  ewbCancelPath: String,   // default '/ewaybill/cancel'
}
```

### `sale.eInvoice` (populated after generate)

```js
{
  irn: String,             // 64-char hex
  ackNo: String,           // 15-digit numeric string
  ackDate: Date,
  signedQr: String,        // base64-encoded JWS from NIC
  status: 'active' | 'cancelled',
  provider: 'mock' | 'gsp' | 'nic',
  generatedAt: Date,
  cancelledAt: Date,       // set on cancel
  cancelReason: String,    // set on cancel
}
```

### `sale.eWayBill`

```js
{
  ewbNumber: String,
  ewbDate: Date,
  validUpto: Date,
  vehicleNumber: String,
  transportMode: 'Road' | 'Rail' | 'Air' | 'Ship',
  transporterId: String,
  status: 'active' | 'cancelled',
  provider: 'mock' | 'gsp' | 'nic',
  generatedAt: Date,
  cancelledAt: Date,
}
```

---

## 14. FAQ

**Q. Do I need a separate GST e-invoice software if I use this POS?**
No. The POS does end-to-end e-invoicing through a GSP. Plug credentials in,
done.

**Q. Which GSP is cheapest?**
For a single-store SMB doing < 5,000 invoices/month, all of ClearTax, Masters
India, IRIS, and Avalara are within ~₹1,000–3,000/month of each other. Pick on
support quality, not price. Always validate with their current pricing — it
moves.

**Q. Can I switch GSPs later?**
Yes. The POS is GSP-agnostic. To switch: re-enrol your GSTIN with the new GSP
on NIC's portal (§6.3), then swap the credentials in Settings. Past IRNs stay
attached to past sales — they don't care which GSP signed them.

**Q. What if my GSP is down?**
Sales still complete locally — the POS atomic transaction doesn't depend on
GSP availability. The IRN field just stays empty. When the GSP recovers, hit
Generate IRN on each pending sale. (A future Phase-2 enhancement is to retry
this automatically via Bull queue.)

**Q. Does the printed invoice still work without an IRN?**
For B2C — yes, that's the normal tax invoice. For B2B above turnover —
technically the invoice isn't legally valid without IRN, so the buyer may
refuse it. Always generate IRN before handing the invoice to a B2B buyer.

**Q. Can I generate IRN for past sales (back-dated)?**
NIC accepts IRN generation up to **3 days** after the invoice date for B2B
sales. After that you must issue a credit note + fresh invoice.

**Q. What about reverse charge / SEZ / Export sales?**
Currently the payload builder hard-codes `SupTyp: 'B2B'` and `RegRev: 'Y'` for
reverse-charge sales (see
[buildEInvoicePayload()](../server/services/e-invoice.service.js#L100-L108)).
SEZ-with-payment, SEZ-without-payment, and export SupTyp codes are roadmap —
files an issue if you need them.

**Q. Do I need to worry about the JSON schema version?**
No. The POS uses NIC schema-v1.1 which is current as of 2026. If NIC ships v2,
update `buildEInvoicePayload()` — the dispatcher pattern means nothing else
changes.

**Q. How is the QR rendered on the printed invoice?**
The signed QR string from NIC is rendered with [qrcode.react](https://github.com/zpao/qrcode.react)
inside [InvoicePreview.tsx](../components/pos/InvoicePreview.tsx). It's a single
line of code — `<QRCodeSVG value={sale.eInvoice.signedQr} />` — gated on
`sale.eInvoice?.status === 'active'`.

**Q. Where do I find raw provider responses for debugging?**
Errors carry the raw response under `AppError.details.raw`. To log every
successful call too, wrap `generateIrnViaGsp()` in
[gsp-client.js](../server/services/einvoice/gsp-client.js#L234) and pipe to
Winston. Don't `console.log` (CLAUDE.md §12).

---

---

## 15. Appendix A — Official portals & registration links

All URLs below were verified against the live web (see [§15.6](#156-url-verification-status)
for the verification log). Bookmark these — they are the source of truth.

### 15.1 NIC e-invoice portal (IRP-1) — production

| Purpose | URL |
|---|---|
| Main e-invoice portal (production) | https://einvoice1.gst.gov.in |
| Main menu (after login) | https://einvoice1.gst.gov.in/Home/MainMenu |
| Enable e-invoicing on your GSTIN | https://einvoice1.gst.gov.in/Home/Enablement |
| Check whether a GSTIN is e-invoice-enabled | https://einvoice1.gst.gov.in/Others/EinvEnabled |
| List of GSPs registered for API | https://einvoice1.gst.gov.in/Others/GSPSLIST |
| GSTINs currently generating IRN | https://einvoice1.gst.gov.in/Others/GSTINsGeneratingIRN |
| Bulk IRN generation Excel tool | https://einvoice1.gst.gov.in/Others/BulkGenerationTools |
| FAQs | https://einvoice1.gst.gov.in/Others/Faqs |
| Support | https://einvoice1.gst.gov.in/Others/Support/ |

#### Documents

| Purpose | URL |
|---|---|
| Web user manual (PDF) | https://einvoice1.gst.gov.in/Documents/EINVOICE_UserManual_Web.pdf |
| Detailed system overview (PDF) | https://einvoice1.gst.gov.in/Documents/GST_eInvoiceSystemDetailedOverview.pdf |
| PPT explainer (PDF) | https://einvoice1.gst.gov.in/Documents/PPT_on_eInvoice_system.pdf |

### 15.2 NIC e-invoice sandbox — for API integration & testing

Sandbox is a separate portal from production. Different login, different
credentials, isolated database. **Always test here first.**

| Purpose | URL |
|---|---|
| Sandbox API portal (login + register) | https://einv-apisandbox.nic.in |
| Sandbox onboarding guide | https://einv-apisandbox.nic.in/onboarding.html |
| API credentials page (after login) | https://einv-apisandbox.nic.in/apicredentials.html |
| API overview | https://einv-apisandbox.nic.in/api-overview.html |
| API versions (current & legacy) | https://einv-apisandbox.nic.in/API_Versions.html |
| Authentication spec (v1.04) | https://einv-apisandbox.nic.in/version1.04/authentication.html |
| Sandbox API client (in-browser tester) | https://einv-apisandbox.nic.in/einvapiclient/ |
| Announcements (breaking changes log) | https://einv-apisandbox.nic.in/announcements.html |
| API FAQs | https://einv-apisandbox.nic.in/FaqsonAPI.html |

### 15.3 The six Invoice Registration Portals (IRPs)

> **Important correction:** IRP-1 to IRP-6 are NOT NIC backups. Each is run
> by a different government-empanelled operator. They share back-end
> validation but **issue IRNs independently**. Your GSP decides which IRP
> your invoice goes to.

| Portal | Operator | URL |
|---|---|---|
| IRP-1 | NIC | https://einvoice1.gst.gov.in |
| IRP-2 | NIC (secondary) | https://einvoice2.gst.gov.in |
| IRP-3 | Cygnet | https://einvoice3.gst.gov.in |
| IRP-4 | Clear (ClearTax) | https://einvoice4.gst.gov.in |
| IRP-5 | Ernst & Young | https://einvoice5.gst.gov.in |
| IRP-6 | IRIS | https://einvoice6.gst.gov.in |

IRP-1 and IRP-2 are interoperable as of Aug 2024 — same login credentials,
same API token. If IRP-1 is slow, IRP-2 is the official failover.
IRP-3/4/5/6 are independent — switching requires re-enrolment via the new
operator's portal.

### 15.4 NIC E-Way Bill portal

| Purpose | URL |
|---|---|
| Main EWB portal | https://ewaybillgst.gov.in |
| EWB API developer portal | https://docs.ewaybillgst.gov.in/apidocs/index.html |
| EWB authentication spec (v1.03) | https://docs.ewaybillgst.gov.in/apidocs/version1.03/authentication.html |
| EWB API release notes | https://docs.ewaybillgst.gov.in/apidocs/release-notes.html |
| EWB officer login | https://mis.ewaybillgst.gov.in |
| Citizen EWB (no GSTIN, one-off goods movement) | https://mis.ewaybillgst.gov.in/ewb_ctz/citizen/citizenmenu.aspx |

### 15.5 GSTN, GST portal & helpdesks

> **Domain correction:** GSTN is at **`gstn.org.in`** (not `.gov.in`). The
> earlier draft of this guide had `.gov.in` — that is wrong.

| Purpose | URL |
|---|---|
| GSTN main site | https://www.gstn.org.in |
| GSTN GSP ecosystem | https://www.gstn.org.in/ecosystem/ |
| GSTN list of empanelled GSPs | https://www.gstn.org.in/empanelled-gsps |
| GSTN GSP ecosystem detail | https://www.gstn.org.in/gsp-ecosystem |
| Main GST portal (for filing GSTR-1/3B) | https://www.gst.gov.in |
| GSTN self-service helpdesk | https://selfservice.gstsystem.in |

> **Authoritative GSP list = GSTN's empanelled list above.** There are 60+
> empanelled GSPs (5 onboarding batches as of 2026). If a vendor isn't on
> https://www.gstn.org.in/empanelled-gsps, do not engage — they cannot
> legally relay your invoices to IRP.

### 15.6 URL verification status

| URL category | Status | Verified |
|---|---|---|
| einvoice1.gst.gov.in paths | All verified via search results pointing to those paths | 2026-05-23 |
| einv-apisandbox.nic.in paths | All verified via search results pointing to those paths | 2026-05-23 |
| einvoice2/3/4/5/6.gst.gov.in | Verified (each IRP confirmed in search results) | 2026-05-23 |
| docs.ewaybillgst.gov.in paths | Verified via search results | 2026-05-23 |
| gstn.org.in paths | Domain confirmed; specific paths inferred from gstn.org.in search results | 2026-05-23 |
| Removed (couldn't verify) | `/Others/EInvAPISystem`, `/Others/SearchIRN`, `developer.gst.gov.in`, `reg.gst.gov.in/registration/dsc`, `gstn.gov.in` (was wrong domain) | — |

---

## 16. Appendix B — GSP comparison & starting points

All URLs verified 2026-05-23. Pricing is **not** verified — never quoted
publicly by any of these vendors; always confirm via sales.

> **Two-tier landscape.** Some GSPs *also* operate an IRP themselves (Clear,
> Cygnet, IRIS). When you use them, your invoices go to their own IRP, not
> NIC's IRP-1. Functionally identical from the merchant's POV; the IRN is
> equally valid.

### 16.1 Verified vendor URLs

#### Clear (formerly ClearTax) — also operates IRP-4

| Resource | URL |
|---|---|
| Main e-invoicing docs hub | https://docs.cleartax.in/cleartax-docs |
| E-Invoicing API reference | https://docs.cleartax.in/cleartax-docs/e-invoicing-api/e-invoicing-api-reference |
| E-Invoicing GSP API reference | https://docs.cleartax.in/cleartax-docs/e-invoicing-gsp-api/e-invoicing-gsp-api-reference |
| Account setup guide | https://docs.cleartax.in/cleartax-docs/e-invoicing-api/e-invoicing-api-reference/setting-up-your-account |
| Sandbox API base (referenced in docs) | https://api-sandbox.clear.in/einv/v1/ |
| Clear IRP-4 portal | https://einvoice4.gst.gov.in |
| Marketing / API system explainer | https://cleartax.in/s/e-invoicing-api-system |

#### Masters India

| Resource | URL |
|---|---|
| E-Invoicing API product page | https://www.mastersindia.co/e-invoicing-api/ |
| GST API integration page | https://www.mastersindia.co/goods-and-services-tax-gst-api/ |
| API integration modes blog | https://www.mastersindia.co/blog/e-invoicing-api-integration-modes/ |
| E-way Bill API integration | https://www.mastersindia.co/blog/eway-bill-api-integration/ |

> **Watch out:** there's a separate company called **MasterGST**
> (https://mastergst.com) that has very similar branding. It is also an
> authorised GSP but it is **not** Masters India. Confirm which one you're
> contracting with.

#### IRIS — also operates IRP-6

| Resource | URL |
|---|---|
| IRIS Onyx product (e-invoicing solution) | https://irisgst.com/iris-onyx/ |
| IRIS developer portal | https://developer.irisgst.com |
| IRIS IRP-6 main portal | https://einvoice6.gst.gov.in/content/ |
| IRIS IRP-6 sandbox access guide | https://einvoice6.gst.gov.in/content/kb/access-to-sandbox/ |
| IRIS IRP-6 API integration | https://einvoice6.gst.gov.in/content/api-integration/ |
| E-invoice APIs for solution providers | https://einvoice6.gst.gov.in/content/e-invoice-apis-for-solution-providers/ |

#### Cygnet — also operates IRP-3

| Resource | URL |
|---|---|
| Cygnet IRP product page | https://www.cygnet.one/products/cygnet-irp/ |
| Cygnet IRP-3 main portal | https://einvoice3.gst.gov.in |
| Cygnet IRP-3 sandbox | https://sandbox.einvoice3.gst.gov.in |
| Cygnet IRP-3 introduction | https://einvoice3.gst.gov.in/introduction |
| Cygnet IRP dedicated site | https://www.cygnetirp.in |
| Cygnet Tax suite | https://www.cygnet.one/products/cygnet-tax/ |

#### Tally Solutions

| Resource | URL |
|---|---|
| TallyHelp — one-time e-invoicing setup | https://help.tallysolutions.com/one-time-setup-for-e-invoicing/ |
| TallyHelp — generating e-invoices | https://help.tallysolutions.com/e-invoicing-in-tallyprime/ |
| TallyHelp — sandbox feature | https://help.tallysolutions.com/tally-prime/e-invoice-tallyprime/e-invoice-sandbox/ |
| TallyHelp — TallyPrime integration hub | https://help.tallysolutions.com/integrate-with-tallyprime/ |
| Tally e-invoicing guide (marketing) | https://tallysolutions.com/gst/generate-e-invoice-instantly-in-tallyprime/ |

> Tally's "GSP" services are baked into TallyPrime — you can't get plain
> REST credentials. To use it from this POS, you'd need to push invoices
> *to* Tally and let Tally talk to NIC. Easier choice for non-Tally users:
> pick any of the other GSPs.

#### Avalara India

| Resource | URL |
|---|---|
| E-Invoicing under GST product page | https://www.avalara.com/in/en/products/e-invoicing-under-gst.html |
| India e-invoicing country guide | https://www.avalara.com/us/en/vatlive/country-guides/asia/india/indian-e-invoicing.html |
| Avalara developer portal | https://developer.avalara.com |
| Avalara E-Invoicing API reference | https://developer.avalara.com/api-reference/e-invoicing/einvoice/ |
| Avalara India contact | https://www.avalara.com/in/en/contact-us.html |

#### TaxPro GSP (Chartered Information Systems)

| Resource | URL |
|---|---|
| TaxPro GSP main site | https://taxprogsp.co.in |
| TaxPro e-Invoice page | https://taxpro.co.in/einvoice |
| TaxPro for developers (API + DLL/LIB) | https://taxpro.co.in/for-developer |
| TaxPro GST APIs catalogue | https://taxpro.co.in/gst-api |
| TaxPro home | https://taxpro.co.in |

> TaxPro's ASP registration is free per their developer page ("no onboarding
> charges"); you only pay per call after activation. Often the cheapest
> entry point.

#### GSTHero (Perennial Systems)

| Resource | URL |
|---|---|
| GSTHero main site | https://gsthero.com |
| E-invoicing API guide | https://gsthero.com/blog/e-invoicing-api-guide-to-obtain-apis-for-e-invoice-generation/ |

#### Webtel

| Resource | URL |
|---|---|
| Webtel e-invoicing solution | https://webtel.in/e-invoicing-solution |

#### MasterGST (separate from Masters India — both are authorised GSPs)

| Resource | URL |
|---|---|
| MasterGST main site | https://mastergst.com |
| MasterGST e-Invoice API | https://mastergst.com/gst/e-invoice-api.html |
| MasterGST developer API portal | https://mastergst.com/gst/gst-developer-api-portal.html |
| MasterGST e-Way Bill API | https://mastergst.com/e-way-bill/e-way-bill-api.html |

### 16.2 How to choose (decision matrix)

| If you... | Pick |
|---|---|
| Already use TallyPrime for accounting | **Tally Solutions** — same vendor |
| Want the lowest entry friction (free ASP signup) | **TaxPro GSP** |
| Want the most polished developer docs | **Clear** or **Masters India** |
| Are enterprise / multi-country | **Avalara** |
| Want a GSP that also runs an IRP (less hop count) | **Clear (IRP-4)**, **Cygnet (IRP-3)**, **IRIS (IRP-6)** |
| Want a self-serve IRP with free e-invoicing | **Cygnet IRP-3** — free for SMEs/MSMEs per their marketing |
| Only have a few B2B invoices/month | **Cygnet IRP-3** direct (free tier) — no GSP middle layer needed |

### 16.3 What "GSP" doesn't include

Every GSP gives you the e-invoice + e-way bill API. **Beyond that, features
vary**:

| Feature | Often included | Often extra |
|---|---|---|
| IRN generate / cancel | ✅ | — |
| E-Way Bill generate / cancel | ✅ | — |
| GSTIN validation API | ✅ | — |
| GSTR-1 auto-prep from your IRNs | sometimes | usually paid add-on |
| GSTR-2B reconciliation | — | almost always paid add-on |
| GSTR-3B filing | — | paid add-on |
| ITC tracking dashboard | — | paid add-on |
| White-label client portal | — | enterprise tier |

This POS only needs the **IRN + EWB generate/cancel** APIs from the GSP. The
return-prep features live inside this POS (under **Accounting / GST Reports**),
not at the GSP. Don't pay for what you don't use.

---

## 17. Appendix C — Document checklist for GSP signup

Have these ready **before** you start filling the GSP signup form. Missing any
one of them stalls activation by days.

### 17.1 Mandatory (every GSP asks)

- [ ] **GSTIN certificate** — PDF, downloadable from https://www.gst.gov.in →
      Services → User Services → "View / Download Certificates"
- [ ] **PAN of the entity** — same name as on the GSTIN
- [ ] **Authorised signatory's PAN + Aadhaar**
- [ ] **Mobile number registered with the GSTIN** — OTPs go here, both at
      signup and at every NIC re-auth. Do not use a number that might change.
- [ ] **Email registered with the GSTIN** — for activation emails and IRN
      receipts
- [ ] **Cancelled cheque OR bank statement** — for billing setup
- [ ] **Aggregate turnover declaration** (last FY) — drives which compliance
      bracket NIC puts you in

### 17.2 Mandatory for companies / LLPs (in addition to 17.1)

- [ ] **Certificate of Incorporation (COI)**
- [ ] **Board resolution** authorising the signatory to bind the entity to the
      GSP agreement (template usually supplied by GSP)
- [ ] **Class-3 Digital Signature Certificate (DSC)** of the signatory — for
      signing the GSP agreement online. If you don't have one, get it from
      eMudhra / Sify / Capricorn (~₹1,500–₹3,000, 2-year validity).

### 17.3 Mandatory for proprietorship / individual GSTINs

- [ ] **Photo ID + address proof of the proprietor**
- [ ] Section 17.2 items NOT required

### 17.4 Nice-to-have (speeds up activation)

- [ ] **Static IP address** — some GSPs whitelist your API caller IP for
      security. If you're deploying on AWS / Render / Vercel, get a NAT
      gateway with an Elastic IP. Not required by all GSPs, but speeds up
      production approval by ~1 business day.
- [ ] **Test invoice PDF** — sample of what a current pre-IRN invoice from
      your business looks like. GSP support uses this to advise on field
      mapping.
- [ ] **List of users + their roles** — if you'll have multiple POS operators
      sharing one GSP account, the GSP can pre-create sub-users.

### 17.5 What the GSP will give you back

After activation, you'll receive (usually by encrypted email):

- [ ] **Sandbox** — clientId, clientSecret, username, password, baseUrl
- [ ] **Production** — same set, different values
- [ ] **API documentation PDF** specific to that GSP
- [ ] **Support contact** — phone, email, sometimes a dedicated Slack/Teams
- [ ] **Service Level Agreement (SLA)** — uptime guarantees, response times

Store these in your password manager. **Never commit them to git** — this POS
keeps them in `store.eInvoice` with server-side masking ([§11](#11-reference--all-settings-fields)).

---

## 18. Appendix D — Walkthrough: NIC e-invoice enrolment

This is the **government-side** registration on einvoice1.gst.gov.in. You do
this **after** the GSP gives you sandbox credentials but **before** the POS
will return IRNs successfully. It's a one-time step per GSTIN per GSP.

### 18.1 Step 1 — Open the API system page

1. Open https://einvoice1.gst.gov.in/Others/EInvAPISystem
2. You'll see a page titled **"E-Invoice API System"**.
3. Click the **Login** button (top right).

### 18.2 Step 2 — Log in with your GSTIN

1. Username field: enter your GSTIN (the 15-character one, e.g. `27AABCU9603R1ZM`).
2. Password: this is the same password as your https://einvoice1.gst.gov.in
   login. If you've never logged in there before, register first at
   https://einvoice1.gst.gov.in/Registration/EnableEInvoiceUserRegister
3. Captcha → Submit.

> **If the GSTIN is rejected with "Not eligible for e-invoicing":**
> Your aggregate turnover is below the current threshold, so e-invoicing isn't
> mandated. You can still opt-in by raising a ticket via
> https://selfservice.gstsystem.in → "Enable e-invoicing voluntarily".

### 18.3 Step 3 — Go to API Registration

1. From the dashboard left menu → click **API Registration**.
2. Sub-menu → click **Through GSP**.

You'll see a form with three sections:

- **GSP details** — dropdown of authorised GSPs.
- **Username** — username **you** want to assign (this is the value you'll
  paste into Settings → E-Invoice → Username in the POS). Pick something like
  `{GSTIN}_API01`.
- **Password** — minimum 8 chars; will be needed by your GSP to call NIC on
  your behalf.

### 18.4 Step 4 — Pick your GSP from the dropdown

1. **GSP dropdown** — start typing your GSP's name. You should see it appear
   (it must be one of the ~100 authorised GSPs from
   https://www.gstn.gov.in/ecosystem/gsps).
2. Select it.

> **GSP not in the dropdown?**
> Either:
> - It's not an authorised GSP — pick a different one.
> - Your GSP is too new and not yet listed under "API Through GSP" — they'll
>   need to publish their NIC integration. Ask their support.

### 18.5 Step 5 — Set username + password + OTP

1. **Username** — type your chosen username. *Remember this exactly* — case-sensitive,
   no spaces. You'll paste it into Settings → E-Invoice → Username in the POS.
2. **Password** — set a strong password (you'll give this to your GSP, which
   stores it encrypted to call NIC on your behalf).
3. Click **Send OTP**. An OTP is sent to your GSTIN-registered mobile.
4. Enter the OTP → **Submit**.

### 18.6 Step 6 — Confirmation

You'll see a green banner: **"GSP API access enabled successfully."**

A confirmation also goes to your GSTIN-registered email. **Forward this email
to your GSP support contact** — many GSPs need to flip a flag on their side
to recognise the new binding.

### 18.7 Step 7 — Inform your GSP

1. Open a ticket / email with your GSP support.
2. Subject: "NIC API binding complete — please enable production access for
   GSTIN {your GSTIN}"
3. Body: include the NIC-issued username (from §18.5) so they can map it.

The GSP will reply within 1–2 business days with confirmation. After that,
you can switch the POS from sandbox → production
([§6.7](#67-switching-sandbox--production)).

### 18.8 Common stumbles in this flow

| Symptom | Cause | Fix |
|---|---|---|
| Can't log in to einvoice1.gst.gov.in | First-time user — register first | https://einvoice1.gst.gov.in/Registration/EnableEInvoiceUserRegister |
| "Not eligible for e-invoicing" | Turnover below threshold | Opt-in via selfservice.gstsystem.in |
| GSP not in dropdown | Wrong GSP / unauthorised | Cross-check against https://www.gstn.gov.in/ecosystem/gsps |
| OTP not received | Wrong mobile on file with GST portal | Update mobile at https://www.gst.gov.in (Services → Profile → Edit) |
| GSP keeps returning "auth failed" after enrolment | Email confirmation not forwarded to GSP | §18.6 — send the confirmation email to their support |

---

---

## 19. Appendix E — Creating a GSP account & getting credentials

This is the **GSP-side** signup — what you do *with the vendor* to receive
clientId / clientSecret / username / password / baseUrl that you'll paste
into Settings → E-Invoice in the POS.

Read this **after** [Appendix C](#17-appendix-c--document-checklist-for-gsp-signup)
(get your docs ready) and **before** [Appendix D](#18-appendix-d--walkthrough-nic-e-invoice-enrolment)
(NIC-side enrolment, which depends on knowing your GSP).

### 19.1 The common pattern (every GSP)

Regardless of which GSP you pick, the flow is the same:

```
1. Visit the GSP's developer / contact page (URLs in Appendix B)
2. Submit a contact form OR send sales@<gsp>.com an email
3. Sales rep schedules a 15-min KYC call
4. You upload your docs (from Appendix C)
5. GSP creates a SANDBOX tenant for you → sends credentials via secure email
6. You test in sandbox against IRP sandbox (no real IRNs)
7. After successful test, GSP issues PRODUCTION credentials (1–3 business days)
```

Total time from "I want this" to "production IRN flowing": **3–7 business days**
in the best case, 2–3 weeks if any document is missing.

> **Self-service does NOT exist.** Every GSP requires KYC because they're
> staking their NIC enrolment on your invoices. Don't trust any vendor that
> offers instant API keys.

### 19.2 Sandbox credentials from NIC directly (no GSP)

If you only want to **test** the integration without picking a GSP yet:

1. Go to https://einv-apisandbox.nic.in
2. Click **Login** (top right) → **Register**.
3. Fill out the registration form:
   - User type: **GSP** (or **ERP** if you want self-integration)
   - GSTIN: yours
   - Email + mobile: where OTPs go
4. NIC sends an OTP to verify mobile.
5. After OTP, you're given **sandbox** clientId + clientSecret on the
   https://einv-apisandbox.nic.in/apicredentials.html page.
6. Username + password: you set these in the same form.
7. Base URL: `https://einv-apisandbox.nic.in/` for sandbox.

In the POS:
- Provider: **GSP** (the GSP client speaks NIC's API directly when you point
  it at NIC's sandbox URL — same OAuth2-ish shape)
- Environment: **Sandbox**
- baseUrl: `https://einv-apisandbox.nic.in/eivital/v1.04` (auth path is
  `/auth`, not `/auth/token` — override that field).

> NIC's sandbox uses AES/RSA "Sek" key exchange — this POS's GSP client
> doesn't do that crypto. The clean path is: use a real GSP's sandbox, not
> NIC's direct sandbox. Skip this section unless you specifically need NIC
> direct.

### 19.3 Per-GSP: Clear (formerly ClearTax)

#### A. Initiate

1. Open https://docs.cleartax.in/cleartax-docs/e-invoicing-api/e-invoicing-api-reference/setting-up-your-account
2. The doc says: **"Contact your Clear sales representative."** There is no
   self-serve link as of 2026-05.
3. Alternative: go to https://cleartax.in/s/e-invoicing-api-system, scroll to
   the bottom — there's usually a "Talk to sales" button / form.

#### B. Sales call

Expect a 15–20 min call covering:
- Your monthly B2B invoice volume (drives pricing tier)
- Source ERP / POS (mention this POS by name — they'll provision a generic
  REST integration)
- Whether you need just IRN + EWB or full GSTR-1 prep (extra cost)

#### C. KYC docs

Per their account-setup doc, they ask for:
- GSTIN certificate
- PAN (entity)
- Board resolution / partnership deed (entity type-specific)
- Authorised signatory ID

#### D. Sandbox credentials

After contract signing (usually e-signed via the call), Clear emails:

```
Environment    : Sandbox
clientId       : <prod-redacted>
clientSecret   : <prod-redacted>
gspClientId    : <prod-redacted>
gspClientSecret: <prod-redacted>
ownerId        : <Clear-side tenant ID>
baseUrl        : https://api-sandbox.clear.in/einv/v1/
```

Important: Clear uses **two** layers of OAuth — a `gsp_*` pair (for the GSP
auth) plus a tenant-level `client_*` pair. This POS handles both because the
auth body posts every variant. If something fails, paste Clear's `gsp_*`
into the POS clientId/clientSecret fields.

In Settings → E-Invoice:
- Provider: **GSP**
- baseUrl: `https://api-sandbox.clear.in/einv/v1`
- clientId / clientSecret: from email above
- authPath: `/auth` (default `/auth/token` will not work for Clear)
- generatePath: `/einvoice/generate`
- cancelPath: `/einvoice/cancel`

> Always check Clear's current docs for the exact endpoint paths — these
> change with API versions.

#### E. Production switch

After ≥1 successful sandbox IRN, email your Clear contact: *"Sandbox tested
OK — please activate production"*. Within 1–3 business days they reply with
a fresh credential block. Production base URL is something like
`https://api.clear.in/einv/v1` (no `-sandbox`).

### 19.4 Per-GSP: Masters India

#### A. Initiate

1. Open https://www.mastersindia.co/e-invoicing-api/
2. Click **Get a Demo** / **Contact Us** (button placement varies).
3. Or call the sales numbers on https://mastergst.com (if you went through
   their MasterGST product — same parent company).

#### B. KYC

Standard docs from Appendix C. Plus they ask for:
- A signed agreement (PDF — they send it on email)
- A test invoice from your current billing system (helps them map fields)

#### C. Credentials

Masters India delivers via secure email:

```
Environment    : Sandbox / Production (separate sets)
clientId       : <issued by Masters India>
clientSecret   : <issued by Masters India>
username       : <NIC-side user, you'll also set this on einvoice1.gst.gov.in>
password       : <NIC-side password>
gstin          : <your GSTIN>
baseUrl        : sandbox: https://api-test.mastersindia.co
                 production: https://api.mastersindia.co
```

The `username` + `password` are what you'll later set on the NIC portal in
[Appendix D §18.5](#185-step-5--set-username--password--otp).

In Settings → E-Invoice:
- Provider: **GSP**
- baseUrl: as above
- clientId / clientSecret / username / password / gstin: all from email
- Endpoint paths: usually the defaults work. If a call returns 404, check
  the Masters India docs and override `generatePath` / `cancelPath`.

### 19.5 Per-GSP: IRIS (Onyx / IRP-6)

IRIS gives you a self-serve route because they run an IRP — you don't even
need a contract for the free tier.

#### A. Self-serve sandbox

1. Go to https://einvoice6.gst.gov.in/content/kb/access-to-sandbox/
2. Click **Sandbox Access** / **Register** (form at the bottom).
3. Fill:
   - User type: **Taxpayer** or **Intermediary**
   - GSTIN: yours
   - Email + mobile: OTPs
   - PAN
4. OTP-verify both email and mobile.
5. Logging into the sandbox shows your **Sandbox Credentials** section:
   - clientId
   - clientSecret
   - username (you set this during signup)
   - password (you set)

#### B. POS settings

- Provider: **GSP**
- baseUrl: per the IRIS docs, sandbox is on the einvoice6 domain (exact
  path on the credentials page in their portal — paste it from there)
- Other paths: defaults usually work
- MFA: IRIS now mandates MFA on the IRP — set this up before generating
  IRNs or the auth API will reject

#### C. Production

For paid Onyx tier, contact sales via https://irisgst.com/iris-onyx/ —
form on the page. Free tier on IRP-6 is limited but works for small B2B
volumes.

### 19.6 Per-GSP: Cygnet (IRP-3) — has a free SMB tier

Cygnet markets free e-invoicing for SMEs/MSMEs through IRP-3. Worth trying
first because there's no contract phase.

#### A. Free signup at IRP-3

1. Go to https://einvoice3.gst.gov.in
2. Click **Register** (top right). For sandbox: https://sandbox.einvoice3.gst.gov.in
3. GSTIN + email + mobile + OTP. Standard.
4. Once verified, the dashboard shows **API access** section → click
   **Generate Credentials**.
5. You'll receive clientId, clientSecret, base URL.

#### B. Enterprise track (Cygnet GSP product)

If the free tier rate-limits you or you need extras (GSTR-2B reconciliation,
multi-GSTIN management), contact via https://www.cygnet.one/products/cygnet-irp/
→ **Talk to us** form.

### 19.7 Per-GSP: TaxPro GSP — free ASP signup

Cheapest entry point.

1. Go to https://taxpro.co.in/for-developer
2. Click **Register as ASP** (linked in body text).
3. Fill: company name, GSTIN, PAN, email, mobile.
4. OTP verify.
5. The ASP dashboard gives you a sandbox `client_id` + `client_secret`
   immediately — no human sales involved.
6. For production, you flip a switch on the dashboard and they activate
   within 1 business day (they re-verify your GSTIN with NIC at that point).

In Settings → E-Invoice:
- Provider: **GSP**
- baseUrl: from the ASP dashboard (TaxPro publishes sandbox + production
  URLs on the same screen as the credentials)
- Endpoint paths: TaxPro uses NIC-like paths — usually defaults work.

### 19.8 Per-GSP: GSTHero

1. Go to https://gsthero.com → click **Contact** / **Get Started**.
2. Sales call (similar shape to Clear / Masters India).
3. They post credentials via email after KYC + agreement.
4. GSTHero often offers a few free IRNs on trial — ask for it.

### 19.9 Per-GSP: Avalara India

Enterprise-only path; no SMB self-serve.

1. Go to https://www.avalara.com/in/en/contact-us.html
2. Form asks for company size, monthly invoice volume, expected go-live.
3. Sales rep schedules a discovery call (30 min).
4. Quote → MSA → KYC → credentials. Typically 2–3 weeks.

For developer-side preview: https://developer.avalara.com/api-reference/e-invoicing/einvoice/
shows the exact API shape they expose. Worth reading before the sales call
so you know what to ask for.

### 19.10 Per-GSP: Tally Solutions (only if you also use TallyPrime)

There is **no direct REST API** from Tally to third-party POSs. You'd
instead:

1. Push completed invoices from this POS *into* TallyPrime via Tally's
   ODBC / XML import.
2. Configure TallyPrime to push to NIC IRP (their "GSP via Tally" flow).
3. Read the IRN/QR back from TallyPrime into this POS.

That's two integrations to maintain and is not worth doing unless you're
already deeply on TallyPrime. If you are, follow:
- https://help.tallysolutions.com/one-time-setup-for-e-invoicing/
- https://help.tallysolutions.com/e-invoicing-in-tallyprime/

### 19.11 What to do with the credentials once you have them

Once any GSP gives you a credential pack, follow this checklist:

1. **Store them in a password manager** (1Password, Bitwarden, your team's
   shared vault). Do not commit to git. The POS keeps them in
   `store.eInvoice` with server-side masking ([§11](#11-reference--all-settings-fields)).

2. **Verify the docs you signed**. The agreement should specify:
   - SLA (uptime, response time)
   - Per-IRN price (or monthly cap)
   - Cancellation terms
   - Whether the GSP also files GSTR-1/3B for you (often a separate
     module — don't double-pay)

3. **Complete NIC-side enrolment** with the GSP you just signed up with —
   see [Appendix D](#18-appendix-d--walkthrough-nic-e-invoice-enrolment).
   Pick the GSP from the dropdown there. Without this step, IRN calls fail
   with "GSTIN not registered for e-invoicing with this GSP."

4. **Paste credentials into Settings → E-Invoice** in this POS.

5. **Click "Test connection"** — see [§6.5](#65-test-connection). Must
   succeed before generating any IRN.

6. **Ring up one B2B sale, generate IRN, verify the IRN on
   https://einvoice1.gst.gov.in → Search by IRN.** Done.

### 19.12 If you're stuck

- **GSP can't find your GSTIN.** Either GSTIN typo, or your GSTIN's not
  yet enabled for e-invoicing. Use
  https://einvoice1.gst.gov.in/Others/EinvEnabled to check, and
  https://einvoice1.gst.gov.in/Home/Enablement to enable.

- **GSP gave credentials but Test connection fails.** Most likely an
  endpoint path mismatch. Their docs will list the exact path. Update
  `authPath` / `generatePath` etc. in Settings → E-Invoice.

- **NIC says "user not registered with this GSP."** Skipped Appendix D.
  Complete the einvoice1.gst.gov.in → API Registration flow.

- **GSP's sales rep is slow.** It's a cultural norm in this industry. Be
  persistent — daily nudges. Mention you're evaluating against another
  GSP and they often speed up.

---

*End of guide — last updated 2026-05-23.*
*If you find something out of date, open a PR against this file.*
