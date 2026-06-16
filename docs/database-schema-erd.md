# Database Schema — Visual ER Diagrams (complete)

**Companion to** [database-schema.md](database-schema.md) (prose + every index + nested-object internals).
These are **Mermaid** diagrams — they render in GitHub/GitLab and the VS Code Markdown preview (`Ctrl/Cmd+Shift+V`). **Every collection and every top-level field is shown.** Nested sub-objects appear as a single `object`/`array` attribute (their internal fields are expanded in the companion doc, and the heavily-embedded ones — sale items, purchase items, voucher entries — are drawn as their own *(embedded)* entities below).

**Legend:** `||--o{` one→many · `||--o|` one→zero/one · `}o--||` many→one · `}o--o{` many→many · `PK` primary key · `FK` foreign key · `UK` unique.
**Coverage (all 30 collections):** §2 Organization, Store, SuperAdmin, TenantAdmin, User, InviteToken · §3 Product, ProductUnit, Category, StockMovement · §4 Customer, Sale (+items/payments/warranties) · §5 Supplier, Purchase (+items/GRN) · §6 AccountGroup, Account, LedgerEntry, Voucher (+entries), BankAccount, Payment · §7 GSTReport, Employee, Payslip, StoreTransfer, Counter · §8 AuditLog, SubscriptionPlan, PlatformPayment, PlatformSettings, SupportRequest.

---

## 1. High-level map (tenant data plane)

```mermaid
erDiagram
  ORGANIZATION ||--o{ STORE : "owns"
  ORGANIZATION ||--o| TENANTADMIN : "owner"
  ORGANIZATION ||--o{ USER : "employs"
  ORGANIZATION ||--o{ INVITETOKEN : "issues"
  ORGANIZATION ||--o{ STORETRANSFER : "scopes"
  ORGANIZATION ||--o{ AUDITLOG : "records"
  ORGANIZATION ||--o{ PLATFORMPAYMENT : "billed"
  ORGANIZATION ||--o{ SUPPORTREQUEST : "raises"

  STORE ||--o{ PRODUCT : ""
  STORE ||--o{ CATEGORY : ""
  STORE ||--o{ CUSTOMER : ""
  STORE ||--o{ SUPPLIER : ""
  STORE ||--o{ SALE : ""
  STORE ||--o{ PURCHASE : ""
  STORE ||--o{ STOCKMOVEMENT : ""
  STORE ||--o{ LEDGERENTRY : ""
  STORE ||--o{ ACCOUNTGROUP : ""
  STORE ||--o{ ACCOUNT : ""
  STORE ||--o{ VOUCHER : ""
  STORE ||--o{ BANKACCOUNT : ""
  STORE ||--o{ GSTREPORT : ""
  STORE ||--o{ EMPLOYEE : ""
  STORE ||--o{ PAYSLIP : ""
  STORE ||--o{ COUNTER : ""
  PRODUCT ||--o{ PRODUCTUNIT : ""
  EMPLOYEE ||--o{ PAYSLIP : ""
```

---

## 2. Identity & tenancy — complete fields

```mermaid
erDiagram
  ORGANIZATION {
    ObjectId _id PK
    string name
    ObjectId ownerUserId FK
    string plan "free|starter|pro|enterprise"
    string centralGstin
    string pan
    number hsnDigitsRequired "4|6|8"
    boolean isActive "vendor hard-block"
    date trialEndsAt
    date subscriptionStartedAt
    date subscriptionEndsAt
    number monthlyAmount
    string vendorNote
    object customLimits "enterprise caps"
    object reminderTemplate
    array userAddons "paid user slots"
    date createdAt
    date updatedAt
  }
  STORE {
    ObjectId _id PK
    ObjectId organizationId FK
    string name
    string type "store|warehouse"
    string code UK "unique sparse"
    object address
    string gstNumber
    boolean gstRegistered
    string stateCode
    string phone
    string email
    string logoUrl
    string invoicePrefix
    number invoiceCounter "legacy seed"
    string upiId
    number poCounter
    number grnCounter
    number creditNoteCounter
    number debitNoteCounter
    Map voucherCounters
    object settings
    object whatsapp "masked secrets"
    object eInvoice "masked secrets"
    boolean isActive
    date createdAt
    date updatedAt
  }
  SUPERADMIN {
    ObjectId _id PK
    string name
    string email UK
    string phone
    string password "bcrypt wf12"
    boolean isActive
    date lastLogin
    date createdAt
    date updatedAt
  }
  TENANTADMIN {
    ObjectId _id PK
    string name
    string email UK
    string phone
    string password "bcrypt wf12"
    ObjectId organizationId FK
    array storeIds FK
    ObjectId primaryStoreId FK
    boolean isActive
    date lastLogin
    date createdAt
    date updatedAt
  }
  USER {
    ObjectId _id PK
    string name
    string email UK
    string phone
    string password "bcrypt wf12"
    string role "manager|cashier|accountant|ca"
    ObjectId organizationId FK
    ObjectId storeId FK
    array storeIds FK
    ObjectId primaryStoreId FK
    object permissions
    boolean isActive
    date lastLogin
    date createdAt
    date updatedAt
  }
  INVITETOKEN {
    ObjectId _id PK
    string token UK
    ObjectId organizationId FK
    string email
    string name
    string role "admin|manager|cashier|accountant|ca"
    array storeIds FK
    ObjectId invitedBy FK
    date expiresAt
    date usedAt
    date revokedAt
    date createdAt
    date updatedAt
  }

  ORGANIZATION ||--o| TENANTADMIN : "owned by"
  ORGANIZATION ||--o{ USER : "employs"
  ORGANIZATION ||--o{ INVITETOKEN : "issues"
  ORGANIZATION ||--o{ STORE : "owns"
  TENANTADMIN }o--o{ STORE : "can access"
  USER }o--o{ STORE : "assigned to"
```
*SUPERADMIN is cross-tenant (no org/store link).*

---

## 3. Catalogue & inventory — complete fields

```mermaid
erDiagram
  PRODUCT {
    ObjectId _id PK
    ObjectId storeId FK
    string name
    string sku UK "unique per store"
    string barcode
    string qrCode
    boolean isSerialised
    string category "free-text"
    string brand
    string unit
    number purchasePrice
    number sellingPrice
    number mrp
    number gstRate "0|5|12|18|28"
    boolean priceIncludesGst
    string hsnCode
    string sacCode
    string taxType "GST|IGST|Exempt"
    number stock
    number minStock
    number maxStock
    number reorderQty
    number warrantyMonths
    boolean batchTracking
    boolean expiryTracking
    string imageUrl
    boolean isActive
    ObjectId createdBy FK
    date createdAt
    date updatedAt
  }
  PRODUCTUNIT {
    ObjectId _id PK
    ObjectId storeId FK
    ObjectId productId FK
    string serialNo UK
    string status "in_stock|sold|returned|damaged"
    ObjectId saleId FK
    ObjectId purchaseId FK
    date soldAt
    date warrantyStartsAt
    date warrantyExpiresAt
    date addedAt
    ObjectId addedBy FK
    date createdAt
    date updatedAt
  }
  CATEGORY {
    ObjectId _id PK
    ObjectId storeId FK
    string name
    ObjectId parentId FK
    date createdAt
    date updatedAt
  }
  STOCKMOVEMENT {
    ObjectId _id PK
    ObjectId storeId FK
    ObjectId productId FK
    string type "in|out|adjustment|transfer"
    number quantity
    number previousStock
    number newStock
    string referenceType "sale|purchase|return|manual|transfer"
    ObjectId referenceId
    string batchNumber
    date expiryDate
    string reason
    ObjectId createdBy FK
    date createdAt "immutable"
  }

  PRODUCT ||--o{ PRODUCTUNIT : "units"
  PRODUCT ||--o{ STOCKMOVEMENT : "movements"
  CATEGORY ||--o{ CATEGORY : "parent of"
```

---

## 4. Customers & Sales — complete fields

```mermaid
erDiagram
  CUSTOMER {
    ObjectId _id PK
    ObjectId storeId FK
    string name
    string phone
    string email
    string gstNumber
    string stateCode
    string address
    number creditLimit
    number outstandingBalance
    number loyaltyPoints
    boolean isActive
    date createdAt
    date updatedAt
  }
  SALE {
    ObjectId _id PK
    string invoiceNumber UK "per store"
    string shareToken UK
    ObjectId storeId FK
    ObjectId customerId FK
    object customerSnapshot
    string placeOfSupply
    string invoiceType "regular|export|sez|exempt|…"
    object exportDetails
    number subtotal
    number totalDiscount
    number totalTax
    number roundOff
    number grandTotal
    number amountPaid
    number change
    string paymentStatus "paid|partial|credit"
    string saleType "pos|order|credit"
    string status "completed|returned|voided"
    boolean hasWarranty
    array whatsappSends
    ObjectId returnRef FK
    object eInvoice "IRN+QR"
    object eWayBill
    string notes
    string idempotencyKey UK "partial unique"
    object offlineMeta "device/session/time if created offline"
    ObjectId createdBy FK
    date createdAt
    date updatedAt
  }
  SALE_ITEM {
    ObjectId productId FK
    object productSnapshot
    number quantity
    string unit
    number sellingPrice
    number basePrice
    number discount
    string discountType "flat|percent"
    number discountAmount
    number taxableAmount
    number gstRate
    number cgst
    number sgst
    number igst
    number totalTax
    number totalAmount
    ObjectId unitId FK
    string serialNo
    number warrantyMonths
    date warrantyExpiresAt
  }
  SALE_PAYMENT {
    string mode "cash|upi|card|credit|loyalty"
    number amount
    string reference
  }
  WARRANTY_LINE {
    ObjectId productId FK
    string productName
    string sku
    number quantity
    number warrantyMonths
    date startsAt
    date expiresAt
  }

  CUSTOMER ||--o{ SALE : "buys"
  SALE ||--o{ SALE_ITEM : "contains (embedded)"
  SALE ||--o{ SALE_PAYMENT : "settled by (embedded)"
  SALE ||--o{ WARRANTY_LINE : "warrants (embedded)"
  SALE ||--o| SALE : "credit note → original"
  SALE_ITEM }o--|| PRODUCT : "of"
  SALE_ITEM }o--o| PRODUCTUNIT : "serial"
```

---

## 5. Suppliers & Purchases — complete fields

```mermaid
erDiagram
  SUPPLIER {
    ObjectId _id PK
    ObjectId storeId FK
    string name
    string phone
    string email
    string gstNumber
    string stateCode
    string address
    number outstandingBalance
    boolean isActive
    date createdAt
    date updatedAt
  }
  PURCHASE {
    ObjectId _id PK
    string poNumber UK "per store"
    ObjectId storeId FK
    ObjectId supplierId FK
    object supplierSnapshot
    string status "draft|ordered|partial|received|closed|cancelled|returned"
    ObjectId returnRef FK
    number subtotal
    number totalDiscount
    number totalTax
    number grandTotal
    string paymentStatus "unpaid|partial|paid"
    number amountPaid
    boolean reverseCharge
    string invoiceType "regular|sez|import|deemed_export"
    string closedReason
    date closedAt
    date dueDate
    date expectedDate
    string notes
    ObjectId createdBy FK
    date createdAt
    date updatedAt
  }
  PURCHASE_ITEM {
    ObjectId productId FK
    object productSnapshot
    number orderedQty
    number receivedQty
    number purchasePrice
    number gstRate
    boolean priceIncludesGst
    number cgst
    number sgst
    number igst
    string batchNumber
    date expiryDate
    number taxableAmount
    number totalTax
    number totalAmount
  }
  RECEIPT_REF {
    string grnNumber
    array items "received lines"
    number total
    number ancillaryTotal
    array ancillaryExpenses
    date receivedAt
    ObjectId receivedBy FK
  }
  ANCILLARY_EXPENSE {
    string type "labour|freight|octroi|…"
    string description
    number amount
    boolean includeInLandedCost
    string paidVia "cash|bank|upi|card|cheque|supplier"
    string paidTo
  }

  SUPPLIER ||--o{ PURCHASE : "supplies"
  PURCHASE ||--o{ PURCHASE_ITEM : "orders (embedded)"
  PURCHASE ||--o{ RECEIPT_REF : "GRN (embedded)"
  RECEIPT_REF ||--o{ ANCILLARY_EXPENSE : "costs (embedded)"
  PURCHASE ||--o| PURCHASE : "debit note → original"
  PURCHASE_ITEM }o--|| PRODUCT : "of"
```

---

## 6. Accounting — complete fields

```mermaid
erDiagram
  ACCOUNTGROUP {
    ObjectId _id PK
    ObjectId storeId FK
    string name
    ObjectId parentId FK
    string nature "asset|liability|income|expense"
    date createdAt
    date updatedAt
  }
  ACCOUNT {
    ObjectId _id PK
    ObjectId storeId FK
    string name
    ObjectId groupId FK
    number openingBalance
    date createdAt
    date updatedAt
  }
  LEDGERENTRY {
    ObjectId _id PK
    ObjectId storeId FK
    string entryType "debit|credit"
    string accountType "cash|bank|receivable|payable|revenue|expense|gst|journal"
    ObjectId accountId "Account|Customer|Supplier"
    number amount "positive"
    number balance
    string referenceType "sale|purchase|payment|adjustment|journal|voucher|return|manual"
    ObjectId referenceId
    string narration
    boolean isAutoGenerated
    ObjectId createdBy FK
    date createdAt "immutable"
  }
  VOUCHER {
    ObjectId _id PK
    ObjectId storeId FK
    string type "payment|receipt|journal|contra"
    string voucherNumber UK "per store"
    date date
    string narration
    number totalAmount
    ObjectId createdBy FK
    date createdAt
    date updatedAt
  }
  VOUCHER_ENTRY {
    ObjectId accountId FK
    string accountName
    string entryType "debit|credit"
    number amount
  }
  BANKACCOUNT {
    ObjectId _id PK
    ObjectId storeId FK
    string name
    string type "cash|bank"
    string accountNumber
    string ifsc
    number openingBalance
    number currentBalance
    date createdAt
    date updatedAt
  }
  PAYMENT {
    ObjectId _id PK
    string paymentNumber UK
    string reference "Sale|Purchase|Customer|Supplier"
    ObjectId referenceId
    ObjectId party
    number amount
    string paymentMode "Cash|Card|Check|Bank Transfer|Online"
    string transactionId
    string checkNumber
    string bankAccount
    string status "Pending|Completed|Failed|Cancelled"
    string notes
    ObjectId createdBy FK
    date createdAt
    date updatedAt
  }

  ACCOUNTGROUP ||--o{ ACCOUNTGROUP : "parent of"
  ACCOUNTGROUP ||--o{ ACCOUNT : "groups"
  ACCOUNT ||--o{ LEDGERENTRY : "posted to"
  ACCOUNT ||--o{ VOUCHER_ENTRY : "Dr/Cr"
  VOUCHER ||--o{ VOUCHER_ENTRY : "contains (embedded)"
  VOUCHER ||--o{ LEDGERENTRY : "generates"
  SALE ||--o{ LEDGERENTRY : "generates"
  PURCHASE ||--o{ LEDGERENTRY : "generates"
```
> `PAYMENT` currently has **no `storeId`** and is unused by services (the ledger records payments via `LEDGERENTRY`). Shown for completeness; fix or remove before wiring it up.

---

## 7. GST, Payroll, Transfers, Sequencing — complete fields

```mermaid
erDiagram
  GSTREPORT {
    ObjectId _id PK
    ObjectId storeId FK
    string period "YYYY-MM"
    string reportType "GSTR1|GSTR3B"
    array b2bSales
    array b2cSales
    array purchaseITC
    object summary
    string status "draft|filed"
    date generatedAt
    date createdAt
    date updatedAt
  }
  EMPLOYEE {
    ObjectId _id PK
    ObjectId storeId FK
    string employeeCode UK "per store"
    string name
    string email
    string phone
    string address
    string pan
    string aadhaar "last 4"
    string bankAccount
    string bankIfsc
    string pfUan
    string esiNumber
    string designation
    string department
    date joinDate
    date exitDate
    object salary
    boolean isActive
    ObjectId createdBy FK
    date createdAt
    date updatedAt
  }
  PAYSLIP {
    ObjectId _id PK
    ObjectId storeId FK
    string payslipNumber
    ObjectId employeeId FK
    object employeeSnapshot
    string period "YYYY-MM"
    number workDaysInMonth
    number paidDays
    number lopDays
    object earnings
    object deductions
    object employerContribution
    number netSalary
    string status "draft|finalized|paid"
    date paidAt
    string paymentMode "bank|cash|cheque"
    string paymentReference
    string notes
    ObjectId createdBy FK
    date createdAt
    date updatedAt
  }
  STORETRANSFER {
    ObjectId _id PK
    ObjectId organizationId FK
    ObjectId fromStoreId FK
    ObjectId toStoreId FK
    string transferNumber UK
    array items
    string status "requested|in_transit|received|cancelled"
    string notes
    ObjectId requestedBy FK
    ObjectId dispatchedBy FK
    date dispatchedAt
    ObjectId receivedBy FK
    date receivedAt
    ObjectId cancelledBy FK
    date cancelledAt
    string cancelReason
    date createdAt
    date updatedAt
  }
  TRANSFER_ITEM {
    ObjectId productId FK
    object productSnapshot
    number requestedQty
    number dispatchedQty
    number receivedQty
    number costPrice
  }
  COUNTER {
    ObjectId _id PK
    ObjectId storeId FK
    string docType "invoice|po|grn|CN|…"
    number seq "highest claimed"
    date createdAt
    date updatedAt
  }

  EMPLOYEE ||--o{ PAYSLIP : "paid via"
  STORETRANSFER ||--o{ TRANSFER_ITEM : "moves (embedded)"
  STORETRANSFER }o--|| STORE : "from"
  STORETRANSFER }o--|| STORE : "to"
  TRANSFER_ITEM }o--|| PRODUCT : "of"
```

---

## 8. Audit & Platform / SaaS — complete fields

```mermaid
erDiagram
  AUDITLOG {
    ObjectId _id PK
    ObjectId organizationId FK
    ObjectId storeId FK
    ObjectId userId FK
    string userEmail
    string userRole
    string method
    string path
    string resource
    string action
    number statusCode
    string summary
    Mixed payload "PII redacted"
    string ip
    string userAgent
    number durationMs
    date createdAt "append-only"
  }
  SUBSCRIPTIONPLAN {
    ObjectId _id PK
    string code UK
    string name
    string description
    string tier "free|starter|pro|enterprise|custom"
    number price
    string currency
    string billingCycle "monthly|quarterly|half_yearly|yearly|2year|lifetime"
    number effectiveMonthlyAmount
    number trialDays
    object limits
    array features
    string paymentUrl
    string savingsLabel
    object paymentMethods
    boolean isActive
    boolean isFeatured
    number displayOrder
    date createdAt
    date updatedAt
  }
  PLATFORMPAYMENT {
    ObjectId _id PK
    ObjectId organizationId FK
    string organizationName
    string reference UK
    string type "subscription|user_addon|manual|other"
    string planCode
    string planName
    number cycleMonths
    string addonRole "admin|manager|cashier|accountant|ca"
    number addonQuantity
    number amount
    string currency
    string status "pending|awaiting_confirmation|completed|rejected|cancelled"
    string gatewayProvider
    string gatewayUrl
    string gatewayReference
    string tenantNote
    string vendorNote
    ObjectId initiatedByUserId
    string initiatedByEmail
    ObjectId confirmedByUserId
    date confirmedAt
    date paidAt
    date createdAt
    date updatedAt
  }
  PLATFORMSETTINGS {
    ObjectId _id PK
    object paymentGateway "razorpay|phonepe|upi (secrets)"
    object vendorContact
    object brand
    object userAddon
    date createdAt
    date updatedAt
  }
  SUPPORTREQUEST {
    ObjectId _id PK
    ObjectId organizationId FK
    string organizationName
    ObjectId raisedByUserId
    string raisedByName
    string raisedByEmail
    string raisedByRole
    string type "support|billing|feature|bug|upgrade|general"
    string priority "low|normal|high|urgent"
    string subject
    string body
    string status "open|in_progress|resolved|closed"
    boolean unreadByVendor
    array messages
    date lastActivityAt
    date createdAt
    date updatedAt
  }
  SUPPORT_MESSAGE {
    ObjectId _id PK
    string from "tenant|vendor"
    ObjectId authorId
    string authorName
    string authorEmail
    string body
    date createdAt
  }

  ORGANIZATION ||--o{ PLATFORMPAYMENT : "billed via"
  ORGANIZATION ||--o{ SUPPORTREQUEST : "raises"
  ORGANIZATION ||--o{ AUDITLOG : "audited in"
  SUPPORTREQUEST ||--o{ SUPPORT_MESSAGE : "thread (embedded)"
```
*SUBSCRIPTIONPLAN and PLATFORMSETTINGS are vendor-owned, cross-tenant; the tenant app reads them via `/api/public`.*

---

## How to view / export
- **VS Code:** open this file → `Ctrl/Cmd + Shift + V`. For SVG/PNG export, the "Markdown Preview Mermaid Support" extension, or paste a ```mermaid``` block into <https://mermaid.live> → Export.
- **GitHub/GitLab:** renders inline on the file page.

*Field internals of every `object`/`array` (e.g. `store.settings`, `store.whatsapp`, `payslip.earnings`), all indexes, and integrity rules are in [database-schema.md](database-schema.md). Last updated 2026-06-16.*
