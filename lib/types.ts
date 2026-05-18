export interface Product {
  _id: string;
  storeId: string;
  name: string;
  sku: string;
  barcode: string;
  qrCode?: string;
  isSerialised?: boolean;
  /** Set by POS lookup when the scanned code matched a specific unit's serial. */
  matchedUnit?: ProductUnit;
  category: string;
  brand?: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  gstRate: number;
  hsnCode: string;
  stock: number;
  minStock: number;
  maxStock?: number;
  reorderQty?: number;
  warrantyMonths?: number;
  /** If true, `sellingPrice` already includes GST — tax is extracted from it on sale. */
  priceIncludesGst?: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductUnit {
  _id: string;
  storeId: string;
  productId: string;
  serialNo: string;
  status: 'in_stock' | 'sold' | 'returned' | 'damaged';
  saleId?: string | null;
  purchaseId?: string | null;
  soldAt?: string | null;
  warrantyStartsAt?: string | null;
  warrantyExpiresAt?: string | null;
  addedAt: string;
  addedBy?: string;
}

export type Role = 'super_admin' | 'admin' | 'manager' | 'cashier' | 'accountant' | 'ca';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId?: string | null;
  storeId?: string | null;
  storeIds?: string[];
  /**
   * Branches the user can switch into. `type` discriminates retail stores
   * from warehouses — the dashboard, sidebar, and StoreSwitcher all reshape
   * themselves when the active branch is a warehouse (no POS, no GST, no
   * customer-facing screens; just stock + transfers).
   */
  stores?: { _id: string; name: string; code?: string; type?: 'store' | 'warehouse' }[];
  permissions?: Record<string, string[]>;
}

export interface StoreSettings {
  allowNegativeStock: boolean;
  defaultGSTMode: 'inclusive' | 'exclusive';
  printCopies: number;
  enableLoyalty: boolean;
  loyaltyRate: number;
  invoiceFooter: string;
  defaultLowStockThreshold: number;
  defaultWarrantyMonths: number;
  agingBuckets: number[];
  eWayBillThreshold: number;
  b2cLargeThreshold: number;
}

export interface StoreInfo {
  _id: string;
  name: string;
  code?: string;
  /** Discriminates retail stores from warehouses; drives plan-limit
   *  accounting and the warehouse-mode UI. Locked once the branch is
   *  created. */
  type?: 'store' | 'warehouse';
  gstNumber?: string;
  /** When false, the branch has no GSTIN and invoices print as bills of
   *  supply with no tax components. Defaults to true. */
  gstRegistered?: boolean;
  stateCode?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  invoicePrefix?: string;
  upiId?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  settings?: StoreSettings;
  whatsapp?: {
    enabled: boolean;
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string; // server returns masked value
    apiVersion: string;
    defaultCountryCode: string;
    messageTemplate: string;
    templateLanguage: string;
    appSecret: string; // server returns masked value
    verifyToken: string; // server returns in clear — merchant pastes it into Meta
    webhookStatus?: WhatsAppWebhookStatus | null;
    configured?: boolean;
    webhookReady?: boolean;
    verifiedProfile?: WhatsAppVerifiedProfile | null;
    testLog?: WhatsAppTestLogEntry[];
  };
  eInvoice?: {
    enabled: boolean;
    provider: 'mock' | 'nic' | 'gsp';
    environment: 'sandbox' | 'production';
    gstin?: string;
    username?: string;
    password?: string; // server returns masked
    clientId?: string;
    clientSecret?: string; // server returns masked
    baseUrl?: string;
    configured?: boolean;
  };
}

export interface WhatsAppWebhookStatus {
  lastEventAt: string | null;
  lastEventType: 'statuses' | 'messages' | 'unknown' | null;
  eventsReceived: number;
  lastError: string | null;
}

export interface WhatsAppVerifiedProfile {
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  platformType: string | null;
  nameStatus: string | null;
  verifiedAt: string;
}

export interface WhatsAppTestLogEntry {
  to: string | null;
  status: 'ok' | 'failed';
  messageId?: string | null;
  whatsappPhone?: string | null;
  error?: string;
  errorCode?: string | null;
  sentAt: string;
  sentBy?: string;
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed' | string;
  deliveryStatusAt?: string;
  deliveryError?: string;
}

export interface WarrantyLine {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  warrantyMonths: number;
  startsAt: string;
  expiresAt: string;
}

export interface CartLine {
  productId: string;
  productSnapshot: {
    name: string;
    sku: string;
    barcode: string;
    hsnCode: string;
  };
  quantity: number;
  unit: string;
  sellingPrice: number;
  basePrice: number;
  discount: number;
  discountType: 'flat' | 'percent';
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  /** Set when the line is a specific serialised unit. */
  unitId?: string;
  serialNo?: string;
}

export interface CartTotals {
  items: CartLine[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
}

export type PaymentMode = 'cash' | 'upi' | 'card' | 'credit';

export interface Payment {
  mode: PaymentMode;
  amount: number;
  reference?: string;
}

export type InvoiceType =
  | 'regular'
  | 'reverse_charge'
  | 'sez_with_payment'
  | 'sez_without_payment'
  | 'export_with_payment'
  | 'export_without_payment'
  | 'deemed_export'
  | 'nil_rated'
  | 'exempt'
  | 'non_gst';

export interface Sale {
  _id: string;
  invoiceNumber: string;
  shareToken?: string;
  storeId: string;
  customerId: string;
  customerSnapshot: {
    name: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
    stateCode?: string;
    address?: string;
  };
  placeOfSupply?: string;
  invoiceType?: InvoiceType;
  exportDetails?: { shippingBillNo?: string; shippingBillDate?: string; portCode?: string };
  items: (CartLine & { warrantyMonths?: number; warrantyExpiresAt?: string })[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  payments: Payment[];
  amountPaid: number;
  change: number;
  paymentStatus: 'paid' | 'partial' | 'credit';
  status?: 'completed' | 'returned' | 'voided';
  returnRef?: string | null;
  hasWarranty?: boolean;
  warranties?: WarrantyLine[];
  eInvoice?: {
    irn?: string;
    ackNo?: string;
    ackDate?: string;
    signedQr?: string;
    status?: 'active' | 'cancelled';
    provider?: string;
    generatedAt?: string;
    cancelledAt?: string;
    cancelReason?: string;
  };
  eWayBill?: {
    ewbNumber?: string;
    ewbDate?: string;
    validUpto?: string;
    vehicleNumber?: string;
    transportMode?: string;
    transporterId?: string;
    status?: 'active' | 'cancelled';
    provider?: string;
    generatedAt?: string;
  };
  createdAt: string;
}
