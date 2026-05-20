/**
 * Purchase-order payable helpers.
 *
 * A PO's payable is NOT `grandTotal − amountPaid`. The ledger only creates a
 * supplier payable when goods are actually received (a GRN). So:
 *
 *   - a cancelled PO received nothing → owes nothing,
 *   - a draft / ordered PO with no GRN → owes nothing yet,
 *   - a partially-received PO → owes only the received portion,
 *   - a fully-received PO → owes its grand total (minus what's paid).
 *
 * Using the ordered grand total (the old behaviour) made cancelled and
 * un-received POs show a phantom "amount to pay". These helpers compute the
 * real figure from the GRN receipt totals.
 */

export interface PoReceiptLite {
  total?: number
}

export interface PoPayableLite {
  status?: string
  amountPaid?: number
  grandTotal?: number
  receiptRefs?: PoReceiptLite[]
}

/** Value of goods actually received against the PO (sum of GRN totals). */
export function poReceivedValue(p: PoPayableLite): number {
  const refs = p.receiptRefs || []
  if (refs.length) {
    return refs.reduce((s, r) => s + Number(r.total || 0), 0)
  }
  // Legacy fallback: a 'received' / 'closed' PO created before GRN receipt
  // tracking was added won't have receiptRefs — treat the full grand total
  // as received so its payable still surfaces.
  if (p.status === 'received' || p.status === 'closed') {
    return Number(p.grandTotal || 0)
  }
  return 0
}

/**
 * Amount still owed to the supplier for this PO = received value − amount paid.
 * Cancelled POs always return 0 (nothing was received, nothing is owed).
 */
export function poPayable(p: PoPayableLite): number {
  if (p.status === 'cancelled') return 0
  return Math.max(0, poReceivedValue(p) - Number(p.amountPaid || 0))
}

/** Whether a PO represents a real (committed + non-cancelled) purchase that
 *  belongs in a purchase register. Drafts and cancellations are excluded. */
export function isRealPurchase(p: PoPayableLite): boolean {
  return p.status !== 'cancelled' && p.status !== 'draft'
}
