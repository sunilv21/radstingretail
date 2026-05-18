/**
 * Client-side helpers for the platform-payments flow.
 *
 *   1. startCheckout(...) — calls POST /api/billing/intent to record a
 *      PENDING payment, then opens the gateway URL in a new tab. The
 *      intent's reference is stamped onto sessionStorage so the
 *      /payment/return page knows which row to confirm.
 *   2. confirmReturn(ref) — POST /api/billing/payments/:ref/return,
 *      flips status to AWAITING_CONFIRMATION so the vendor inbox
 *      surfaces it.
 *
 * Both surfaces (SubscriptionExpiredScreen + Settings → Subscription
 * → PlansShowcase) call startCheckout() so every click creates an
 * audit row even if the tenant abandons before paying.
 */
import { api, ApiError } from '@/lib/api'

export interface PaymentIntent {
  id: string
  reference: string
  type: 'subscription' | 'user_addon' | 'manual' | 'other'
  amount: number
  currency: string
  planCode: string
  planName: string
  cycleMonths: number
  addonRole: string | null
  addonQuantity: number
  status:
    | 'pending'
    | 'awaiting_confirmation'
    | 'completed'
    | 'rejected'
    | 'cancelled'
  gatewayProvider: string
  gatewayUrl: string
  /** Server timestamps — used by the BillingTab history list to show the
   *  "created · settled" column. Optional because the create-intent
   *  response omits them. */
  createdAt?: string
  updatedAt?: string
}

export interface SubscriptionIntentInput {
  type?: 'subscription'
  planCode: string
}

export interface UserAddonIntentInput {
  type: 'user_addon'
  addonRole: 'admin' | 'manager' | 'cashier' | 'accountant' | 'ca'
  addonQuantity: number
  /** 'monthly' (default) charges 1× pricePerUser × qty and grants the
   *  slot for ~30 days. 'yearly' charges 12 × pricePerUser × qty × 0.75
   *  (25% off) and grants the slot for ~365 days. */
  billingCycle?: 'monthly' | 'yearly'
}

export type IntentInput = SubscriptionIntentInput | UserAddonIntentInput

/**
 * Create a payment intent and (optionally) open the gateway URL. Returns
 * the persisted intent so the caller can show "go to /dashboard/billing
 * once you finish" copy and stash the reference for the return page.
 *
 * Pass `openInTab=false` to suppress the popup — useful for forms that
 * want to render their own confirmation panel before the user leaves.
 */
export async function startCheckout(
  input: IntentInput,
  opts: { openInTab?: boolean; whatsappFallback?: string; emailFallback?: string } = {},
): Promise<PaymentIntent> {
  const intent = await api.post<PaymentIntent>('/billing/intent', input)

  // Stash the reference so /payment/return knows which row to confirm
  // even if the gateway redirect drops the query string.
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('billing:last-ref', intent.reference)
    } catch {
      /* ignore */
    }
  }

  const open = opts.openInTab !== false

  if (intent.gatewayUrl) {
    if (open) {
      // Same-origin URLs (UPI checkout page lives at `/pay/upi/<ref>`)
      // navigate in the SAME tab — they're our own pages and the
      // tenant doesn't need a new-tab + come-back-to-confirm dance.
      // External gateways (Razorpay / PhonePe / Stripe) still open in
      // a new tab so the dashboard stays mounted underneath and we
      // can re-mark the row from the BillingTab return banner.
      const isSameOrigin =
        typeof window !== 'undefined' &&
        intent.gatewayUrl.startsWith(window.location.origin)
      if (isSameOrigin) {
        window.location.href = intent.gatewayUrl
      } else {
        window.open(intent.gatewayUrl, '_blank', 'noopener,noreferrer')
      }
    }
    return intent
  }

  // No hosted gateway configured — fall back to WhatsApp / mailto with
  // the intent's reference baked in so the vendor can match it on
  // their side without any extra hand-off.
  const summary =
    intent.type === 'user_addon'
      ? `extra ${intent.addonQuantity} × ${intent.addonRole} user${intent.addonQuantity === 1 ? '' : 's'}`
      : `the "${intent.planName}" plan`
  const text = `Hi, I'd like to pay for ${summary} (${intent.currency} ${intent.amount}). My payment reference is ${intent.reference}.`
  if (open) {
    if (opts.whatsappFallback) {
      const wa = opts.whatsappFallback.replace(/[^\d]/g, '')
      if (wa) {
        window.open(
          `https://wa.me/${wa}?text=${encodeURIComponent(text)}`,
          '_blank',
          'noopener,noreferrer',
        )
        return intent
      }
    }
    if (opts.emailFallback) {
      window.location.href = `mailto:${opts.emailFallback}?subject=${encodeURIComponent(
        `Payment for ${intent.reference}`,
      )}&body=${encodeURIComponent(text)}`
    }
  }
  return intent
}

/**
 * Tenant returned from the gateway. Flip the row to
 * AWAITING_CONFIRMATION so the vendor inbox sees it. Idempotent —
 * calling on an already-confirmed row is a no-op.
 */
export async function confirmReturn(
  reference: string,
  body: { gatewayReference?: string; tenantNote?: string } = {},
): Promise<PaymentIntent> {
  return api.post<PaymentIntent>(`/billing/payments/${reference}/return`, body)
}

export async function cancelIntent(reference: string): Promise<PaymentIntent> {
  return api.post<PaymentIntent>(`/billing/payments/${reference}/cancel`, {})
}

export async function getIntent(reference: string): Promise<PaymentIntent> {
  return api.get<PaymentIntent>(`/billing/payments/${reference}`)
}

export async function listPayments(): Promise<PaymentIntent[]> {
  return api.get<PaymentIntent[]>('/billing/payments')
}

/** Surface a friendly message for ApiError chains. */
export function checkoutErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Could not start checkout'
}
