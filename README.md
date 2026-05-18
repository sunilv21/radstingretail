# Radsting POS + ERP

A multi-tenant cloud-first retail POS + ERP SaaS for Indian SMBs — built as a modern alternative to Tally / Marg. Combines transactional accounting accuracy with consumer-POS speed.

> **Phase 1 — Wide MVP.** Production-ish for tenant POS; admin portal is live; e-invoice GSP integration is wired (NIC direct scaffolded only).

---

## Architecture at a glance

**One Next.js app serves both audiences (route-based split). One Express backend. One MongoDB Atlas database. RBAC keeps the surfaces safely partitioned.**

```
                ┌─────────────────────────────────┐
                │   Next.js  :3000  (one project) │
                │                                 │
                │   /              ← tenant login │
                │   /dashboard/*   ← tenant POS, inventory, sales, …
                │   /admin         ← admin login  │
                │   /admin/dashboard/*   ← plans, tenants, payments, …
                └────────────────┬────────────────┘
                                 │
                       ┌─────────▼──────────┐
                       │  Express  :5000    │
                       │  server/           │
                       │                    │
                       │  /api/auth/*       │
                       │  /api/platform/*   ← super_admin only
                       │  /api/sales|…/*    ← tenant scoped by storeId
                       └─────────┬──────────┘
                                 │
                       ┌─────────▼──────────┐
                       │  MongoDB Atlas     │
                       │  (one cluster)     │
                       └────────────────────┘
```

Detailed architecture, modules, flows, and missing pieces are in [project summery.md](project%20summery.md). Frontend-only logic (state, validators, formatters, offline queue, RBAC gates) is in [front end logic.md](front%20end%20logic.md). The deep build guide is in [CLAUDE.md](CLAUDE.md).

---

## Run locally — single command

```sh
npm install                      # first time only
npm run dev                      # starts BOTH backend + frontend
```

That's it. Under the hood, `concurrently` runs:
- `node --watch server/index.js` → backend on **:5000**
- `next dev -p 3000` → frontend on **:3000** (serves both tenant + admin routes)

Then open:
- **http://localhost:3000** — tenant POS (shop owners, cashiers, accountants)
- **http://localhost:3000/admin** — admin portal (vendor staff)

Both surfaces share localStorage-side-by-side without collision: tenant uses `token` / `user`, admin uses `admin-token` / `admin-user`.

### First-time setup

```sh
# Create a super-admin (vendor login)
node server/scripts/create-super-admin.js owner@yourcompany.com 'StrongPass123' "Vendor Admin"

# Seed the plan catalogue (free / starter / pro / enterprise)
node server/scripts/seed-plans.js

# Optional — seed demo data for admin@example.com tenant
node server/scripts/seed-demo-data.js admin@example.com
node server/scripts/seed-accounting.js admin@example.com

# Optional — populate a warehouse for the dashboard / insights to look real
node server/scripts/seed-warehouse-data.js admin@example.com LOL
```

---

## Tech stack

- **Backend**: Node.js 20 (ESM) · Express 5 · Mongoose 8 · JWT auth · bcrypt
- **Database**: MongoDB Atlas (single cluster, shared by both frontends)
- **Frontend**: Next.js 16 (App Router) · React 18 · TypeScript · Tailwind CSS · Radix UI · sonner · lucide-react
- **Print**: HTML-in-iframe + `qrcode.react` for signed-QR rendering
- **Payments**: Razorpay · PhonePe · UPI deep-link
- **WhatsApp**: Meta Cloud API (v21.0)
- **E-invoice**: GSP adapter (OAuth2 + Bearer); NIC direct scaffolded
- **OCR**: Tesseract.js (browser-side) for supplier bill scan

---

## Environment

Copy `.env.local.example` to `.env.local` and set:

| Var | Where | Purpose |
|---|---|---|
| `MONGODB_URI` | backend | Atlas connection string |
| `JWT_SECRET` | backend | Must match across backend + (legacy) admin env files |
| `CORS_ORIGIN` | backend | Comma-separated allowed origins (prod). Dev auto-allows localhost |
| `NEXT_PUBLIC_API_URL` | tenant frontend | Default `http://localhost:5000/api` |
| `NEXT_PUBLIC_API_BASE_URL` | admin frontend | Default `http://localhost:5000/api` |
| `NEXT_PUBLIC_APP_URL` | tenant frontend | Self-URL for share links (e.g. `https://shop.radsting.com`) |
| `NEXT_PUBLIC_VENDOR_*` | tenant frontend | WhatsApp / phone / email / website / pay-URL for the support tab + lock screens |

See [project summery.md](project%20summery.md#appendix-a--repository-quick-reference) for the full env-var table.

---

## Repo layout

```
POS system/                       ← single project (no nested admin folder)
├── app/                          ← Next.js App Router (tenant + admin)
│   ├── page.tsx                  ← Tenant login splash
│   ├── dashboard/                ← Tenant dashboard (POS, sales, inventory, …)
│   ├── bill/[token]/             ← PUBLIC bill share page
│   ├── invite/[token]/           ← Public staff invite acceptance
│   ├── pay/upi/[reference]/      ← UPI checkout intermediary
│   ├── ca-portal/                ← CA read-only audit portal
│   └── admin/                    ← Admin (vendor) surfaces
│       ├── page.tsx              ← Admin login (gated to super_admin)
│       └── dashboard/            ← Plans, tenants, payments, requests, users, settings
├── components/                   ← Shared React UI
│   ├── pos/, ui/                 ← Tenant + shadcn primitives
│   └── admin/Sidebar.tsx         ← Admin-only nav
├── lib/                          ← Frontend libs
│   ├── api.ts                    ← Tenant API client (token / user keys)
│   ├── admin-api.ts              ← Admin API client (admin-token / admin-user keys)
│   ├── admin-types.ts            ← Admin-only types
│   ├── types.ts, rbac.ts, print-invoice.ts, share-invoice.ts, …
│   └── plan-limits.ts            ← Shared, with additive customLimits handling
├── hooks/                        ← barcode-scanner, online-status, …
├── server/                       ← SINGLE backend (Express)
│   ├── app.js, index.js
│   ├── config/, middleware/, utils/, data/
│   ├── routes/                   ← /api/auth, /api/sales, /api/platform (super_admin only), …
│   ├── services/                 ← Business logic + atomic transactions
│   ├── engines/                  ← Billing · Inventory · Ledger · GST
│   ├── models/                   ← 29 Mongoose schemas
│   └── scripts/                  ← bootstrap, seeders, migrations
├── api/[[...slug]].js            ← Vercel serverless wrapper for the backend
├── CLAUDE.md                     ← Original build guide (5 non-negotiables, module pattern)
├── project summery.md            ← Full project summary (modules, APIs, flows, gaps)
├── front end logic.md            ← Frontend-only logic catalogue
└── README.md                     ← This file
```

---

## Key features (Phase 1 shipped)

- **POS** — barcode scan, cart, multi-mode payment, change calculation, warranty customer-info gating
- **Inventory** — products with HSN audit, low-stock filter, label printing, barcode generator
- **Purchase + GRN** — POs with partial receipts, ancillary expenses (freight, labour, etc.) split into landed cost vs operating expense
- **GST** — per-line tax (CGST/SGST/IGST), GSTR-1 / GSTR-3B, HSN summary, bill-of-supply for unregistered branches
- **E-invoice** — IRN generation via GSP (OAuth2 + Bearer); NIC direct scaffolded; e-way bill via same path
- **Print** — thermal 80mm + A4 templates, grouped CGST/SGST headers, HSN summary, IRN + signed QR, configurable T&C
- **Warehouse mode** — separate dashboard, insights (dead stock, slow movers, supplier lead time), locked outbound transfers
- **Accounting** — full double-entry (Σ Dr == Σ Cr), Tally-style chart, vouchers, trial balance, P&L, balance sheet, party settlement
- **Expenses** — friendly entry page that writes payment vouchers underneath
- **Stock transfers** — request → dispatch → receive flow, atomic on both legs
- **Subscription** — trial / active / expired / blocked lifecycle, plan-cap badges, per-role user addons, multiple payment gateways
- **WhatsApp** — Cloud API (auto-send) + wa.me fallback for invoice sharing
- **Multi-tenant** — strict storeId scoping at middleware level; super_admin cross-tenant access via `/api/platform/*`

---

## Useful scripts

```sh
node server/scripts/create-super-admin.js <email> <password> <name>
node server/scripts/seed-plans.js
node server/scripts/seed-demo-data.js <tenantEmail>
node server/scripts/seed-warehouse-data.js <tenantEmail> [warehouseNameFragment]
node server/scripts/seed-accounting.js <tenantEmail>
node server/scripts/seed-party-settlement.js <tenantEmail>
node server/scripts/backfill-credit-sale-ledger.js
node server/scripts/backfill-main-store.js [--dry-run]
node server/scripts/fix-document-number-indexes.js
node server/scripts/drop-plan.js <planCode>
```

---

## Docs

| File | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | The five non-negotiables, module pattern, schema, API conventions |
| [project summery.md](project%20summery.md) | Full module inventory, route catalogue, flows, missing pieces |
| [front end logic.md](front%20end%20logic.md) | Every piece of business / state / utility logic on the frontend |
| [POS system-admin/README.md](POS%20system-admin/README.md) | Admin frontend run notes |

---

## Status

Phase 1 ships POS, inventory, purchases, GST, e-invoice (GSP), warehouse mode, expenses, subscription gating, WhatsApp, admin consolidation.

Open items are tracked in `project summery.md` §24 — most are scope for Phase 2 (real GSP testing, Electron offline app, Tally export, batch / expiry tracking, queue-backed reports).

---

*Last refresh: 2026-05-12*
#   r a d s t i n g r e t a i l  
 #   r a d s t i n g r e t a i l  
 