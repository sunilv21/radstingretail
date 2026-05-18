// Vendor portal types — mirror the shapes returned by /api/platform/* and
// /api/auth/super-admin/login on the tenant backend.

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  userType: 'super_admin' | 'tenant_admin' | 'staff'
  organizationId?: string | null
}

export type SubStatus = 'trial' | 'active' | 'expired' | 'blocked'

export interface Subscription {
  status: SubStatus
  plan: string
  trialEndsAt: string | null
  subscriptionStartedAt: string | null
  subscriptionEndsAt: string | null
  monthlyAmount: number
  daysRemaining: number | null
  isAccessAllowed: boolean
}

export interface UserCaps {
  admin: number
  manager: number
  cashier: number
  accountant: number
  ca: number
}

export interface PlanLimits {
  label: string
  stores: number
  warehouses: number
  users: UserCaps
}

export interface CustomLimitsInput {
  stores?: number | null
  warehouses?: number | null
  users?: Partial<UserCaps>
}

export interface ReminderTemplate {
  trial: string
  expiringSoon: string
}

export interface UserAddonRow {
  id: string
  role: 'admin' | 'manager' | 'cashier' | 'accountant' | 'ca'
  quantity: number
  cycleMonths: number
  startsAt: string
  expiresAt: string
  amountPaid: number
  currency: string
  paymentReference: string
  addedBy: string
}

export interface OrgRow {
  id: string
  name: string
  plan: string
  centralGstin?: string
  pan?: string
  isActive: boolean
  createdAt: string
  vendorNote?: string
  subscription: Subscription
  limits: PlanLimits
  customLimits: CustomLimitsInput | null
  reminderTemplate: ReminderTemplate
  /** Active + expired paid user-slot grants (full history). */
  userAddons?: UserAddonRow[]
  owner: {
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
    lastLogin?: string
  } | null
  counts: { stores: number; warehouses: number; users: number }
}

export interface DashboardSummary {
  tenants: {
    total: number
    trial: number
    active: number
    expired: number
    blocked: number
  }
  mrr: number
  arr: number
  activePayingTenants: number
  averageRevenuePerTenant: number
  totalStores: number
  totalUsers: number
  expiringSoon: {
    id: string
    name: string
    status: SubStatus
    daysRemaining: number
  }[]
}

export interface PlatformUser {
  id: string
  name: string
  email: string
  role: string
  userType: 'super_admin' | 'tenant_admin' | 'staff'
  organizationId?: string | null
  isActive: boolean
  lastLogin?: string
  createdAt?: string
}

// --- Subscription plan catalogue (vendor authors these in the portal) ---
export type BillingCycle =
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly'
  | '2year'
  | 'lifetime'
export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise' | 'custom'

export interface PlanPaymentMethods {
  upi: boolean
  card: boolean
  netbanking: boolean
  bankTransfer: boolean
  manual: boolean
}

export interface SubscriptionPlanRow {
  id: string
  code: string
  name: string
  description: string
  tier: PlanTier
  price: number
  currency: string
  billingCycle: BillingCycle
  effectiveMonthlyAmount: number
  trialDays: number | null
  limits: {
    stores: number | null
    warehouses: number | null
    users: {
      admin: number | null
      manager: number | null
      cashier: number | null
      accountant: number | null
      ca: number | null
    }
  }
  features: string[]
  paymentUrl: string
  savingsLabel: string
  paymentMethods: PlanPaymentMethods
  isActive: boolean
  isFeatured: boolean
  displayOrder: number
  createdAt?: string
  updatedAt?: string
}

// --- Support / billing / feature requests inbox -------------------------
export type RequestStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type RequestType =
  | 'support'
  | 'billing'
  | 'feature'
  | 'bug'
  | 'upgrade'
  | 'general'
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface RequestMessage {
  id: string
  from: 'tenant' | 'vendor'
  authorName: string
  authorEmail: string
  body: string
  createdAt: string
}

export interface SupportRequestRow {
  id: string
  organizationId: string
  organizationName: string
  raisedByUserId?: string | null
  raisedByName: string
  raisedByEmail: string
  raisedByRole: string
  type: RequestType
  priority: RequestPriority
  subject: string
  body: string
  status: RequestStatus
  unreadByVendor: boolean
  messages: RequestMessage[]
  lastActivityAt: string
  createdAt: string
  updatedAt: string
}

// --- Platform-wide settings (singleton) -------------------------------
export type PaymentProvider =
  | 'razorpay'
  | 'stripe'
  | 'cashfree'
  | 'paytm'
  | 'phonepe'
  | 'upi'
  | 'custom'
  | 'manual'

export interface PhonePeConfig {
  merchantId: string
  /** Always returned masked (`••••••••<last4>`) — never the cleartext. */
  saltKey: string
  /** Whether a real saltKey is on file server-side. Lets the form
   *  show "configured" without leaking the mask itself. */
  saltKeyConfigured: boolean
  saltIndex: number
  environment: 'sandbox' | 'production'
}

export interface UpiConfig {
  vpa: string
  payeeName: string
}

export interface RazorpayConfig {
  keyId: string
  /** Masked on read (`••••••••<last4>`) — never cleartext. */
  keySecret: string
  keySecretConfigured: boolean
  /** Same masking for the webhook secret. */
  webhookSecret: string
  webhookSecretConfigured: boolean
  mode: 'test' | 'live'
}

export interface PlatformSettingsRow {
  paymentGateway: {
    url: string
    provider: PaymentProvider
    currency: string
    mode: 'live' | 'test'
    phonepe: PhonePeConfig
    upi: UpiConfig
    razorpay: RazorpayConfig
  }
  vendorContact: {
    whatsapp: string
    phone: string
    email: string
    website: string
  }
  brand: {
    vendorName: string
    supportHours: string
  }
  userAddon: {
    pricePerUser: number
    currency: string
    description: string
  }
  updatedAt?: string
}

export type PlatformPaymentType = 'subscription' | 'user_addon' | 'manual' | 'other'
export type PlatformPaymentStatus =
  | 'pending'
  | 'awaiting_confirmation'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export interface PlatformPaymentRow {
  id: string
  organizationId: string
  organizationName: string
  reference: string
  type: PlatformPaymentType
  planCode: string
  planName: string
  cycleMonths: number
  addonRole: string | null
  addonQuantity: number
  amount: number
  currency: string
  status: PlatformPaymentStatus
  gatewayProvider: string
  gatewayUrl: string
  gatewayReference: string
  tenantNote: string
  vendorNote: string
  initiatedByName: string
  initiatedByEmail: string
  confirmedByName: string
  confirmedAt: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PlatformPaymentListResponse {
  payments: PlatformPaymentRow[]
  summary: {
    pending: number
    awaiting_confirmation: number
    completed: number
    rejected: number
    cancelled: number
    totalCollected: number
  }
}

export interface SupportRequestListResponse {
  requests: SupportRequestRow[]
  summary: {
    open: number
    in_progress: number
    resolved: number
    closed: number
    unread: number
  }
}
