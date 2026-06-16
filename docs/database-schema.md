# Database Schema — Retail POS + ERP

**Database:** MongoDB (Atlas) · **ODM:** Mongoose 8 · **DB name:** `pos_erp`
**Generated from** `server/models/*.js` on 2026-06-16. This is the authoritative shape of every collection.

## Conventions
- Every document has Mongoose's `_id` (ObjectId). `{ timestamps: true }` adds `createdAt` + `updatedAt`; immutable collections use `{ createdAt: true, updatedAt: false }`.
- **Tenancy:** tenant data is scoped by `storeId` (a branch); branches roll up to an `organizationId` (the tenant). Platform/vendor collections are cross-tenant (no `storeId`).
- **Money** is stored as JS `Number` (rupees, 2-dp rounded by the engines).
- **Immutable** = never updated after creation; corrections are new reversal documents.
- `ref` shows the related model; `[ ]` denotes an array; `{ _id: false }` sub-objects are embedded (no own id).

## Collection map

| Collection | Model | Scope | Purpose | Mutability |
|---|---|---|---|---|
| `organizations` | Organization | tenant root | Tenant + subscription | mutable |
| `stores` | Store | org | Branch / warehouse + settings | mutable |
| `superadmins` | SuperAdmin | platform | Vendor login | mutable |
| `tenantadmins` | TenantAdmin | org | Org owner login | mutable |
| `users` | User | org/store | Staff login (manager/cashier/accountant/ca) | mutable |
| `invitetokens` | InviteToken | org | Single-use staff invites | mutable |
| `products` | Product | store | Catalogue master | mutable |
| `productunits` | ProductUnit | store | Serial-tracked units | mutable |
| `categories` | Category | store | Product categories | mutable |
| `customers` | Customer | store | Customer master | mutable |
| `suppliers` | Supplier | store | Supplier master | mutable |
| `sales` | Sale | store | POS invoices | **immutable** |
| `purchases` | Purchase | store | POs + GRNs | header mutated by GRN/status |
| `stockmovements` | StockMovement | store | Stock ledger | **immutable** |
| `ledgerentries` | LedgerEntry | store | Double-entry ledger | **immutable** |
| `accountgroups` | AccountGroup | store | Chart-of-accounts groups | mutable |
| `accounts` | Account | store | Ledger accounts | mutable |
| `vouchers` | Voucher | store | Manual journals | **immutable** |
| `bankaccounts` | BankAccount | store | Cash/bank accounts | mutable |
| `payments` | Payment | store | Sale/purchase payments (see note) | mutable |
| `gstreports` | GSTReport | store | Cached GST aggregates | mutable |
| `employees` | Employee | store | Payroll master | mutable |
| `payslips` | Payslip | store | Generated payslips | mutable |
| `storetransfers` | StoreTransfer | org | Inter-branch stock transfer | mutable |
| `counters` | Counter | store | Sequence allocator | mutable |
| `auditlogs` | AuditLog | org/store | Sensitive-action trail | **append-only** |
| `subscriptionplans` | SubscriptionPlan | platform | SaaS plans (read-only here) | vendor-owned |
| `platformpayments` | PlatformPayment | platform | SaaS billing ledger | shared |
| `platformsettings` | PlatformSettings | platform | Vendor config singleton | vendor-owned |
| `supportrequests` | SupportRequest | org/platform | Support tickets | shared |

---

# Tenancy & identity

### `organizations`
```js
{
  _id, name,
  ownerUserId: ObjectId→User (req),
  plan: 'free'|'starter'|'pro'|'enterprise' = 'free',
  centralGstin: '', pan: '',
  hsnDigitsRequired: 4|6|8 = 4,          // CBIC HSN-digit rule, enforced on product save
  isActive: true,                         // vendor hard-block (false ≡ blocked)
  // Subscription lifecycle
  trialEndsAt, subscriptionStartedAt, subscriptionEndsAt: Date|null,
  monthlyAmount: 0, vendorNote: '',
  customLimits: {                         // enterprise-plan-only caps
    stores: null, warehouses: null,
    users: { admin, manager, cashier, accountant, ca }  // each Number|null
  },
  reminderTemplate: { trial: '', expiringSoon: '' },
  userAddons: [{                          // time-bound paid user-slot grants
    role: 'admin'|'manager'|'cashier'|'accountant'|'ca' (req),
    quantity (min 1), cycleMonths (min 1),
    startsAt, expiresAt(indexed), amountPaid: 0, currency: 'INR',
    paymentReference: '', addedBy: ''
  }],
  createdAt, updatedAt
}
```

### `stores`
```js
{
  _id, organizationId: ObjectId→Organization (indexed),
  name (req),
  type: 'store'|'warehouse' = 'store' (indexed),
  code,                                   // unique sparse (global)
  address: { line1, line2, city, state, pincode },   // _id:false
  gstNumber, gstRegistered: true, stateCode: '07',
  phone, email, logoUrl,
  invoicePrefix: 'INV', invoiceCounter: 0,            // legacy counter (seeds the allocator)
  upiId: '',
  poCounter: 0, grnCounter: 0, creditNoteCounter: 0, debitNoteCounter: 0,
  voucherCounters: Map<string, Number>,
  settings: {
    allowNegativeStock: false,
    defaultGSTMode: 'inclusive'|'exclusive' = 'exclusive',
    printCopies: 1, enableLoyalty: false, loyaltyRate: 0,
    invoiceFooter: '',
    defaultLowStockThreshold: 5, defaultWarrantyMonths: 0,
    agingBuckets: [30,60,90],
    eWayBillThreshold: 50000, b2cLargeThreshold: 250000
  },
  whatsapp: {                             // _id:false — see WhatsApp sub-schema
    enabled: false, provider: 'meta'|'twilio' = 'meta',
    phoneNumberId, businessAccountId, accessToken (masked), apiVersion: 'v21.0',
    twilioAccountSid, twilioAuthToken, twilioFromNumber, twilioContentSid,
    defaultCountryCode: '91', messageTemplate: '', templateLanguage: 'en',
    appSecret (masked), verifyToken,
    webhookStatus: { lastEventAt, lastEventType, eventsReceived: 0, lastError },
    verifiedProfile: { verifiedName, displayPhoneNumber, qualityRating,
                       codeVerificationStatus, platformType, nameStatus, verifiedAt },
    testLog: [{ to, status, messageId, whatsappPhone, error, errorCode, sentAt, sentBy }]
  },
  eInvoice: {                             // GSP/NIC/mock provider config
    enabled: false, provider: 'mock'|'nic'|'gsp' = 'mock',
    environment: 'sandbox'|'production' = 'sandbox',
    gstin, username, password (masked), clientId, clientSecret (masked), baseUrl,
    authPath: '/auth/token', generatePath: '/einvoice/generate',
    cancelPath: '/einvoice/cancel', ewbGeneratePath: '/ewaybill/generate',
    ewbCancelPath: '/ewaybill/cancel'
  },
  isActive: true,
  createdAt, updatedAt
}
// Indexes: { code: 1 } unique sparse
```

### `superadmins`  (vendor) · `tenantadmins` (org owner) · `users` (staff)
All three share the bcrypt password hook (`_passwordHook.js`, work factor **12**, hashed on save when dirty; `comparePassword()` helper).

```js
// superadmins  (collection: 'superadmins')
{ _id, name (req), email (req, unique, lowercase), phone,
  password (req, bcrypt), isActive: true, lastLogin, createdAt, updatedAt }

// tenantadmins  (collection: 'tenantadmins')
{ _id, name (req), email (req, unique, lowercase), phone,
  password (req, bcrypt),
  organizationId: ObjectId→Organization (indexed),
  storeIds: [ObjectId→Store],            // empty = all stores in org
  primaryStoreId: ObjectId→Store,
  isActive: true, lastLogin, createdAt, updatedAt }

// users  (staff only — 'admin'/'super_admin' rejected by enum)
{ _id, name (req), email (req, unique, lowercase), phone,
  password (req, bcrypt),
  role: 'manager'|'cashier'|'accountant'|'ca' (+legacy 'Manager'/'Cashier'/'Accountant') = 'cashier',
  organizationId: ObjectId→Organization (indexed),
  storeId: ObjectId→Store,               // legacy single-store
  storeIds: [ObjectId→Store], primaryStoreId: ObjectId→Store,
  permissions: { canDiscount: true, maxDiscountPct: 10, canVoidSale: false,
                 canViewReports: false, canManageInventory: false },
  isActive: true, lastLogin, createdAt, updatedAt }
// Indexes: users { storeIds:1, role:1 }; email unique on each collection
```

> **Multi-tenant note:** `email` is unique *within* each collection, not across them. Login resolves `{ tenantadmins, users }` only — never `superadmins`.

### `invitetokens`
```js
{
  _id, token (req, unique, indexed),
  organizationId: ObjectId→Organization (req, indexed),
  email (req, lowercase, indexed), name: '',
  role: 'admin'|'manager'|'cashier'|'accountant'|'ca' (req),
  storeIds: [ObjectId→Store],
  invitedBy: ObjectId→User (req),
  expiresAt: Date (req), usedAt: null, revokedAt: null,
  createdAt, updatedAt
}
```

---

# Catalogue & inventory

### `products`
```js
{
  _id, storeId: ObjectId→Store (req, indexed),
  name (req), sku (req), barcode (indexed), qrCode: '',
  isSerialised: false,
  category: 'General' (free-text string), brand, unit: 'pcs',
  purchasePrice: 0, sellingPrice (req), mrp: 0,
  gstRate: 0|5|12|18|28 = 18,
  priceIncludesGst: false,               // true → tax extracted from price, not added
  hsnCode (req), sacCode,
  taxType: 'GST'|'IGST'|'Exempt' = 'GST',
  stock: 0, minStock: 0, maxStock: 0, reorderQty: 0,
  warrantyMonths: 0,                      // >0 → customer identity mandatory at sale
  batchTracking: false, expiryTracking: false,
  imageUrl, isActive: true, createdBy: ObjectId→User,
  createdAt, updatedAt
}
// Indexes: {storeId,sku} unique · {storeId,barcode} · {storeId,stock}
```

### `productunits` (serial-tracked stock)
```js
{
  _id, storeId (req, indexed), productId: ObjectId→Product (req, indexed),
  serialNo (req),
  status: 'in_stock'|'sold'|'returned'|'damaged' = 'in_stock' (indexed),
  saleId: ObjectId→Sale|null, purchaseId: ObjectId→Purchase|null,
  soldAt, warrantyStartsAt, warrantyExpiresAt,
  addedAt: now, addedBy: ObjectId→User, createdAt, updatedAt
}
// Indexes: {storeId,serialNo} unique · {storeId,productId,status}
```

### `categories`
```js
{ _id, storeId (req, indexed), name (req), parentId: ObjectId→Category|null,
  createdAt, updatedAt }   // Indexes: {storeId,name}
```

### `stockmovements`  *(immutable)*
```js
{
  _id, storeId (req, indexed), productId (req, indexed),
  type: 'in'|'out'|'adjustment'|'transfer' (req),
  quantity (req), previousStock, newStock,
  referenceType: 'sale'|'purchase'|'return'|'manual'|'transfer',
  referenceId: ObjectId,
  batchNumber, expiryDate, reason, createdBy: ObjectId→User,
  createdAt           // updatedAt disabled
}
// Indexes: {storeId,productId,createdAt:-1}
```

---

# Parties

### `customers`
```js
{ _id, storeId (req, indexed), name (req), phone (indexed),
  email (lowercase), gstNumber, stateCode: '', address,
  creditLimit: 0, outstandingBalance: 0, loyaltyPoints: 0,
  isActive: true, createdAt, updatedAt }
// Indexes: {storeId,phone}   (NOTE: not unique — see audit)
```

### `suppliers`
```js
{ _id, storeId (req, indexed), name (req), phone, email (lowercase),
  gstNumber, stateCode: '', address, outstandingBalance: 0,
  isActive: true, createdAt, updatedAt }
// Indexes: {storeId,name}
```

---

# Sales (POS invoices — immutable)

### `sales`
```js
{
  _id, invoiceNumber (req),               // per-store sequential
  shareToken: String (unique, sparse),    // public bill URL token
  storeId (req, indexed), customerId: ObjectId→Customer,
  customerSnapshot: { name, phone, email, gstNumber, stateCode, address },
  placeOfSupply: '',                      // 2-digit state code, drives inter/intra tax
  invoiceType: 'regular'|'sez_with_payment'|'sez_without_payment'|
               'export_with_payment'|'export_without_payment'|'deemed_export'|
               'nil_rated'|'exempt'|'non_gst' = 'regular',
  exportDetails: { shippingBillNo, shippingBillDate, portCode },
  items: [{                               // _id:false
    productId (req), productSnapshot: { name, sku, barcode, hsnCode },
    quantity (req), unit, sellingPrice, basePrice,
    discount: 0, discountType: 'flat'|'percent' = 'flat', discountAmount: 0,
    taxableAmount, gstRate, cgst: 0, sgst: 0, igst: 0, totalTax: 0, totalAmount,
    unitId: ObjectId→ProductUnit, serialNo, warrantyMonths, warrantyExpiresAt
  }],
  subtotal, totalDiscount, totalTax, roundOff, grandTotal,
  payments: [{ mode: 'cash'|'upi'|'card'|'credit'|'loyalty' (req), amount (req), reference }],
  amountPaid, change,
  paymentStatus: 'paid'|'partial'|'credit' = 'paid',
  saleType: 'pos'|'order'|'credit' = 'pos',
  status: 'completed'|'returned'|'voided' = 'completed',
  hasWarranty: false,
  warranties: [{ productId, productName, sku, quantity, warrantyMonths, startsAt, expiresAt }],
  whatsappSends: [{ to, messageId, sentAt, sentBy, method, templateName,
                    deliveryStatus, deliveryStatusAt, deliveryError }],
  returnRef: ObjectId→Sale,               // credit note → original
  eInvoice: { irn, ackNo, ackDate, signedQr, status: 'active'|'cancelled',
              provider, generatedAt, cancelledAt, cancelReason },
  eWayBill: { ewbNumber, ewbDate, validUpto, vehicleNumber, transportMode,
              transporterId, status: 'active'|'cancelled', provider, generatedAt, cancelledAt },
  notes, idempotencyKey: String,          // offline-replay dedupe (no default)
  offlineMeta: {                          // present only for sales created offline & synced later
    createdOfflineAt: Date,               // wall-clock time of the sale during the outage
    deviceId, offlineSessionId, userRef   // provenance / outbox ownership
  },
  createdBy: ObjectId→User, createdAt, updatedAt
}
// Indexes:
//   {storeId,invoiceNumber} unique
//   {storeId,createdAt:-1} · {customerId} · {'customerSnapshot.phone',hasWarranty}
//   {idempotencyKey} unique PARTIAL (idempotencyKey $type string)
```

---

# Purchases (PO + GRN)

### `purchases`
```js
{
  _id, poNumber (req),                    // per-store sequential
  storeId (req, indexed), supplierId: ObjectId→Supplier (req),
  supplierSnapshot: { name, phone, gstNumber, stateCode, address },
  status: 'draft'|'ordered'|'partial'|'received'|'closed'|'cancelled'|'returned' = 'draft',
  returnRef: ObjectId→Purchase,
  items: [{                               // _id:false (purchaseItemSchema)
    productId (req), productSnapshot: { name, sku, hsnCode },
    orderedQty (req), receivedQty: 0, purchasePrice, gstRate,
    priceIncludesGst: false, cgst: 0, sgst: 0, igst: 0,
    batchNumber, expiryDate, taxableAmount, totalTax, totalAmount
  }],
  subtotal, totalDiscount: 0, totalTax, grandTotal,
  paymentStatus: 'unpaid'|'partial'|'paid' = 'unpaid', amountPaid: 0,
  reverseCharge: false,
  invoiceType: 'regular'|'sez_with_payment'|'sez_without_payment'|
               'import_of_goods'|'import_of_services'|'deemed_export' = 'regular',
  receiptRefs: [{                         // one per GRN (receiptRefSchema)
    grnNumber,
    items: [{ productId, quantity, purchasePrice, gstRate, priceIncludesGst,
              batchNumber, expiryDate }],
    total, ancillaryTotal: 0,
    ancillaryExpenses: [{                  // freight/labour/etc.
      type: 'labour'|'packaging'|'freight'|'octroi'|'loading'|'unloading'|
            'transport'|'insurance'|'customs'|'other' (req),
      description, amount (req, min 0),
      includeInLandedCost: false,          // true → distributed into stock cost
      paidVia: 'cash'|'bank'|'upi'|'card'|'cheque'|'supplier' = 'cash', paidTo
    }],
    receivedAt, receivedBy: ObjectId→User
  }],
  closedReason, closedAt, dueDate, expectedDate, notes,
  createdBy: ObjectId→User, createdAt, updatedAt
}
// Indexes: {storeId,poNumber} unique · {storeId,status} · {supplierId,status}
```

---

# Accounting (double-entry)

### `accountgroups`
```js
{ _id, storeId (req, indexed), name (req), parentId: ObjectId→AccountGroup|null,
  nature: 'asset'|'liability'|'income'|'expense' (req), createdAt, updatedAt }
// Indexes: {storeId,name}
```

### `accounts`
```js
{ _id, storeId (req, indexed), name (req), groupId: ObjectId→AccountGroup (req),
  openingBalance: 0, createdAt, updatedAt }
// Indexes: {storeId,groupId} · {storeId,name}
```

### `ledgerentries`  *(immutable — `Σ debit === Σ credit`)*
```js
{
  _id, storeId (req, indexed),
  entryType: 'debit'|'credit' (req),
  accountType: 'cash'|'bank'|'receivable'|'payable'|'revenue'|'expense'|'gst'|'journal' (req),
  accountId: ObjectId,                    // Account | Customer | Supplier (per-party)
  amount (req), balance,                  // amount always positive
  referenceType: 'sale'|'purchase'|'payment'|'adjustment'|'journal'|'voucher'|'return'|'manual',
  referenceId: ObjectId,
  narration, isAutoGenerated: true, createdBy: ObjectId→User,
  createdAt           // updatedAt disabled
}
// Indexes: {storeId,accountType,createdAt:-1} · {referenceId,referenceType}
//          {storeId,accountId,createdAt:1}
```

### `vouchers`  *(immutable manual journals)*
```js
{
  _id, storeId (req, indexed),
  type: 'payment'|'receipt'|'journal'|'contra' (req),
  voucherNumber (req),                    // per-store sequential
  date: now, narration,
  entries: [{ accountId: ObjectId→Account (req), accountName,
              entryType: 'debit'|'credit' (req), amount (req) }],
  totalAmount,                            // Σ debits === Σ credits (engine-enforced)
  createdBy: ObjectId→User, createdAt, updatedAt
}
// Indexes: {storeId,voucherNumber} unique · {storeId,type,date:-1}
```

### `bankaccounts`
```js
{ _id, storeId (req, indexed), name (req), type: 'cash'|'bank' = 'cash',
  accountNumber, ifsc, openingBalance: 0, currentBalance: 0, createdAt, updatedAt }
```

### `payments`
```js
{ _id, paymentNumber (req, unique),
  reference: 'Sale'|'Purchase'|'Customer'|'Supplier' (req),
  referenceId: ObjectId (req), party: ObjectId (req),
  amount (req, min 0),
  paymentMode: 'Cash'|'Card'|'Check'|'Bank Transfer'|'Online' (req),
  transactionId, checkNumber, bankAccount,
  status: 'Pending'|'Completed'|'Failed'|'Cancelled' = 'Pending',
  notes, createdBy: ObjectId→User, createdAt, updatedAt }
```
> ⚠️ `Payment` has **no `storeId`** and is currently unused by services (the ledger tracks payments via `ledgerentries`). Flagged in the audit — add `storeId` or remove before wiring it up.

---

# GST

### `gstreports`  (cached aggregate; on-demand recompute is authoritative)
```js
{ _id, storeId (req, indexed), period (req, 'YYYY-MM'),
  reportType: 'GSTR1'|'GSTR3B' (req),
  b2bSales: [], b2cSales: [], purchaseITC: [],
  summary: { totalOutputGST, totalInputITC, netGSTPayable },
  status: 'draft'|'filed' = 'draft', generatedAt, createdAt, updatedAt }
// Indexes: {storeId,period,reportType} unique
```

---

# Payroll

### `employees`
```js
{
  _id, storeId (req, indexed), employeeCode (req), name (req),
  email (lowercase), phone, address, pan (uppercase), aadhaar, bankAccount,
  bankIfsc (uppercase), pfUan, esiNumber, designation, department,
  joinDate: now, exitDate,
  salary: {                               // _id:false
    basic: 0, hra: 0, conveyance: 0, medicalAllowance: 0, otherAllowances: 0,
    pfApplicable: true, esiApplicable: true, professionalTax: 200, tds: 0
  },
  isActive: true, createdBy: ObjectId→User, createdAt, updatedAt
}
// Indexes: {storeId,employeeCode} unique · {storeId,isActive}
```

### `payslips`
```js
{
  _id, storeId (req, indexed), payslipNumber (req),
  employeeId: ObjectId→Employee (req, indexed),
  employeeSnapshot: { employeeCode, name, designation, department, pan,
                      pfUan, esiNumber, bankAccount, bankIfsc },
  period (req, 'YYYY-MM'), workDaysInMonth: 30, paidDays: 30, lopDays: 0,
  earnings: { basic, hra, conveyance, medicalAllowance, otherAllowances,
              overtime, bonus, gross },           // each Number, default 0
  deductions: { pfEmployee, esiEmployee, professionalTax, tds,
                loanRecovery, other, total },
  employerContribution: { pfEmployer, esiEmployer, total },
  netSalary: 0,
  status: 'draft'|'finalized'|'paid' = 'finalized',
  paidAt, paymentMode: 'bank'|'cash'|'cheque' = 'bank', paymentReference, notes,
  createdBy: ObjectId→User, createdAt, updatedAt
}
// Indexes: {storeId,employeeId,period} unique · {storeId,period}
```

---

# Multi-store & sequencing

### `storetransfers`
```js
{
  _id, organizationId (req, indexed),
  fromStoreId (req, indexed), toStoreId (req, indexed),
  transferNumber (req, unique),
  items: [{ productId (req), productSnapshot: { name, sku, barcode, hsnCode },
            requestedQty (req, min 0), dispatchedQty: 0, receivedQty: 0, costPrice: 0 }],
  status: 'requested'|'in_transit'|'received'|'cancelled' = 'requested',
  notes: '',
  requestedBy, dispatchedBy, dispatchedAt, receivedBy, receivedAt,
  cancelledBy, cancelledAt, cancelReason,
  createdAt, updatedAt
}
// Indexes: {organizationId,status,createdAt:-1}
```

### `counters`  (high-throughput sequence allocator)
```js
{ _id, storeId: ObjectId→Store (req), docType: String (req),  // 'invoice'|'po'|'grn'|…
  seq: Number (req, default 0), createdAt, updatedAt }
// Indexes: {storeId,docType} unique
```

---

# Audit & platform (vendor/SaaS)

### `auditlogs`  *(append-only; super-admin viewer)*
```js
{ _id, organizationId (indexed), storeId (indexed), userId: ObjectId→User,
  userEmail, userRole, method, path, resource, action, statusCode,
  summary, payload: Mixed (PII redacted), ip, userAgent, durationMs,
  createdAt           // updatedAt disabled }
// Indexes: {organizationId,createdAt:-1} · {userId,createdAt:-1} · {resource,createdAt:-1}
```

### `subscriptionplans`  (vendor-owned; tenant reads)
```js
{ _id, code (req, unique, lowercase), name (req), description: '',
  tier: 'free'|'starter'|'pro'|'enterprise'|'custom' = 'custom',
  price: 0, currency: 'INR',
  billingCycle: 'monthly'|'quarterly'|'half_yearly'|'yearly'|'2year'|'lifetime' = 'monthly',
  effectiveMonthlyAmount: 0, trialDays: null,
  limits: { stores, warehouses, users:{ admin,manager,cashier,accountant,ca } },  // Number|null
  features: [String], paymentUrl: '', savingsLabel: '',
  paymentMethods: { upi:true, card:false, netbanking:false, bankTransfer:true, manual:true },
  isActive: true, isFeatured: false, displayOrder: 0, createdAt, updatedAt }
```

### `platformpayments`  (SaaS billing ledger — vendor↔tenant; shared collection)
```js
{ _id, organizationId (req, indexed), organizationName: '',
  reference (req, unique, indexed),
  type: 'subscription'|'user_addon'|'manual'|'other' (req),
  planCode, planName, cycleMonths: 1,
  addonRole: 'admin'|'manager'|'cashier'|'accountant'|'ca'|null, addonQuantity: 0,
  amount (req, min 0), currency: 'INR',
  status: 'pending'|'awaiting_confirmation'|'completed'|'rejected'|'cancelled' = 'pending' (indexed),
  gatewayProvider: 'razorpay'|'stripe'|'cashfree'|'paytm'|'phonepe'|'upi'|'custom'|'manual' = 'custom',
  gatewayUrl, gatewayReference, tenantNote, vendorNote,
  initiatedByUserId, initiatedByName, initiatedByEmail,
  confirmedByUserId, confirmedByName, confirmedAt, paidAt, createdAt, updatedAt }
// Indexes: {organizationId,createdAt:-1} · {status,createdAt:-1}
```

### `platformsettings`  (vendor config singleton; tenant reads via /public)
```js
{ _id,
  paymentGateway: {
    url, provider, currency: 'INR', mode: 'live'|'test',
    phonepe: { merchantId, saltKey, saltIndex(1–10), environment:'sandbox'|'production' },
    upi: { vpa, payeeName },
    razorpay: { keyId, keySecret, webhookSecret, mode:'test'|'live' }
  },
  vendorContact: { whatsapp, phone, email, website },
  brand: { vendorName, supportHours },
  userAddon: { pricePerUser: 199, currency: 'INR', description },
  createdAt, updatedAt }
```

### `supportrequests`  (tickets; shared with vendor portal)
```js
{ _id, organizationId (req, indexed), organizationName,
  raisedByUserId, raisedByName, raisedByEmail, raisedByRole,
  type: 'support'|'billing'|'feature'|'bug'|'upgrade'|'general' = 'support',
  priority: 'low'|'normal'|'high'|'urgent' = 'normal',
  subject (req, ≤200), body (req),
  status: 'open'|'in_progress'|'resolved'|'closed' = 'open' (indexed),
  unreadByVendor: true,
  messages: [{ _id, from:'tenant'|'vendor' (req), authorId, authorName,
               authorEmail, body (req), createdAt }],
  lastActivityAt: now (indexed), createdAt, updatedAt }
```

---

# Relationship overview

```
Organization 1─┬─* Store ─┬─* Product ──* ProductUnit
               │          ├─* Customer / Supplier / Category
               │          ├─* Sale (items→Product, customer snapshot)
               │          ├─* Purchase (items→Product, supplier snapshot, GRNs)
               │          ├─* StockMovement (ref→Sale|Purchase|…)
               │          ├─* AccountGroup ──* Account ──* LedgerEntry / Voucher
               │          ├─* BankAccount / GSTReport / Counter
               │          └─* Employee ──* Payslip
               ├─ TenantAdmin (owner)  ├─* User (staff)  ├─* InviteToken
               ├─* StoreTransfer (fromStore→toStore)
               ├─* AuditLog
               └─* PlatformPayment / SupportRequest        (shared w/ vendor)

SuperAdmin · SubscriptionPlan · PlatformSettings   = platform-level (cross-tenant)
```

## Immutability & integrity rules
- **Immutable:** `sales`, `ledgerentries`, `stockmovements`, `vouchers` — corrections are new reversal docs (credit/debit notes), never edits.
- **Double-entry invariant:** `Σ debit === Σ credit` per reference group (engine-enforced; `vouchers` rejected if unbalanced).
- **Per-store sequential numbers:** `invoiceNumber`, `poNumber`, `voucherNumber` are unique per `(storeId, …)`; the `counters` collection backs high-throughput invoice allocation.
- **Snapshots:** sales/purchases/payslips embed `*Snapshot` data so master-data changes never alter historical documents.
- **Secrets** (`store.whatsapp.accessToken/appSecret`, `store.eInvoice.password/clientSecret`, platform Razorpay/PhonePe keys) are masked on read and never overwritten by masked values on write.

*Companion docs: [algorithms-and-logic.md](algorithms-and-logic.md) · [code-audit-report.md](code-audit-report.md) · [CLAUDE.md §6](../CLAUDE.md). Last updated 2026-06-16.*
