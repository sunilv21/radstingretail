/**
 * POS cart drafts — small localStorage-backed CRUD so a cashier can park an
 * in-progress cart and ring up another customer without losing the first
 * one's items. Drafts are intentionally per-device:
 *
 *  - they hold raw client-side state (no server-side validation has been
 *    run yet); pushing them to the API would clutter the backend with
 *    transient state.
 *  - the same cashier on a different tablet wouldn't expect their
 *    in-progress cart to follow them — fresh device = empty drafts list.
 *
 * Drafts ARE scoped by storeId so a cashier who switches branches doesn't
 * see the previous branch's parked carts.
 */

import type { Product, PaymentMode } from './types'

/** What we save per cart line. Mirrors `CartLineInput` in pos/page.tsx. */
export interface DraftLine {
  productId: string
  product: Product
  quantity: number
  discount: number
  discountType: 'flat' | 'percent'
  unitId?: string
  serialNo?: string
}

export interface DraftCustomer {
  name: string
  phone: string
  address: string
  email: string
  gstNumber: string
  stateCode: string
}

export type DraftInvoiceType =
  | 'regular'
  | 'export_with_payment'
  | 'export_without_payment'
  | 'sez_with_payment'
  | 'sez_without_payment'
  | 'nil_rated'
  | 'exempt'

export interface Draft {
  id: string
  storeId: string
  /** Optional friendly label. Auto-falls-back to customer name or first item. */
  label?: string
  lines: DraftLine[]
  customer: DraftCustomer
  pickedCustomerId: string | null
  paymentMode: PaymentMode
  invoiceType: DraftInvoiceType
  /** Cashier who created it — helpful when multiple cashiers share a tablet. */
  cashierName?: string
  /** Pre-computed grand total at save time (display-only — recalculated on load). */
  grandTotalAtSave?: number
  createdAt: number
  updatedAt: number
}

const KEY_PREFIX = 'pos-drafts:'

function key(storeId: string): string {
  return `${KEY_PREFIX}${storeId || 'default'}`
}

/** Returns every saved draft for a store, newest first. Resilient to a
 *  corrupted JSON blob — returns `[]` instead of throwing. */
export function loadDrafts(storeId: string): Draft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key(storeId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as Draft[])
      .filter((d) => d && typeof d.id === 'string' && Array.isArray(d.lines))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

/** Replace the whole drafts list — used internally by save/delete. */
function writeAll(storeId: string, drafts: Draft[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key(storeId), JSON.stringify(drafts))
  } catch {
    /* QuotaExceeded — caller should toast; we swallow to avoid noisy crashes. */
  }
}

/** Insert a new draft or update an existing one (matched by `id`). */
export function saveDraft(draft: Draft): void {
  const all = loadDrafts(draft.storeId)
  const idx = all.findIndex((d) => d.id === draft.id)
  if (idx >= 0) {
    all[idx] = draft
  } else {
    all.unshift(draft)
  }
  writeAll(draft.storeId, all)
}

/** Remove a draft by id. */
export function deleteDraft(storeId: string, id: string): void {
  const all = loadDrafts(storeId).filter((d) => d.id !== id)
  writeAll(storeId, all)
}

/** Wipe every draft for a store. */
export function clearDrafts(storeId: string): void {
  writeAll(storeId, [])
}

/** Stable ID — uuid-shaped, no crypto dependency required at call sites. */
export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Auto-generate a human label when the cashier doesn't type one. */
export function autoLabel(draft: Pick<Draft, 'customer' | 'lines'>): string {
  const name = draft.customer?.name?.trim()
  if (name) return name
  const first = draft.lines[0]?.product?.name
  if (first) {
    return draft.lines.length > 1
      ? `${first} +${draft.lines.length - 1} more`
      : first
  }
  return 'Untitled cart'
}

/**
 * The "live cart" — separate from named drafts. This is the in-progress
 * cart the cashier is actively building. We persist it on every
 * state change so leaving the POS page (or a tab crash) doesn't wipe
 * everything they've scanned. Resumes automatically when the POS mounts.
 *
 * Stored under its own key because:
 *  - mixing it with named drafts would clutter the Drafts dropdown
 *  - we only ever keep ONE live cart per store (latest wins), whereas
 *    named drafts are an unbounded list.
 *  - clearing the live cart is a side-effect of checkout / clear /
 *    save-as-draft and should not touch the named drafts list.
 */
export interface LiveCart {
  storeId: string
  lines: DraftLine[]
  customer: DraftCustomer
  pickedCustomerId: string | null
  paymentMode: PaymentMode
  invoiceType: DraftInvoiceType
  tendered: string
  /** If the cart originated from a named draft, remember that link so
   *  Update-draft + checkout-cleanup still work after a page navigation. */
  activeDraftId: string | null
  updatedAt: number
}

const LIVE_PREFIX = 'pos-live-cart:'

function liveKey(storeId: string): string {
  return `${LIVE_PREFIX}${storeId || 'default'}`
}

/** Read the live cart for a store. Returns `null` when nothing is parked. */
export function loadLiveCart(storeId: string): LiveCart | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(liveKey(storeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as LiveCart
    if (!parsed || !Array.isArray(parsed.lines)) return null
    return parsed
  } catch {
    return null
  }
}

/** Write the live cart for a store. Caller is responsible for debouncing. */
export function saveLiveCart(cart: LiveCart): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(liveKey(cart.storeId), JSON.stringify(cart))
  } catch {
    /* Quota — non-fatal. */
  }
}

/** Delete the live cart — call after checkout / clear / save-as-draft. */
export function clearLiveCart(storeId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(liveKey(storeId))
  } catch {
    /* ignore */
  }
}
