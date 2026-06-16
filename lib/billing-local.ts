/**
 * Client-side mirror of `server/engines/gst.engine.js` + `billing.engine.js`.
 *
 * Used only in offline mode so the POS cart can compute GST + grand totals
 * without round-tripping `/pos/calculate`. The two implementations MUST stay
 * in lockstep — when GST rules change server-side, mirror it here. Drift will
 * show up as a delta between the optimistic offline total and the server's
 * recomputed total once the sale syncs.
 */

import type { CartLine, CartTotals, Product } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

interface CartItemInput {
  productId: string
  quantity: number
  discount?: number
  discountType?: 'flat' | 'percent'
  unitId?: string
}

interface CalcContext {
  storeStateCode: string
  customerStateCode?: string
}

function computeItemTax(
  item: { basePrice: number; discount: number; discountType: 'flat' | 'percent'; gstRate: number; priceIncludesGst?: boolean },
  ctx: CalcContext,
) {
  const { basePrice, discount, discountType, gstRate, priceIncludesGst } = item
  const discountAmount =
    discountType === 'percent' ? basePrice * (Number(discount || 0) / 100) : Number(discount || 0)
  const grossAfterDiscount = round2(basePrice - discountAmount)

  const isSameState =
    String(ctx.storeStateCode) === String(ctx.customerStateCode || ctx.storeStateCode)
  const inclusive = !!priceIncludesGst

  let taxableAmount: number
  let cgst = 0
  let sgst = 0
  let igst = 0

  // Ex-tax value of the line before discount — see server gst.engine.js.
  // For inclusive lines this divides the tax back out so the cart subtotal
  // doesn't stack GST on a price that already includes it.
  let subtotalExTax: number

  if (inclusive && gstRate > 0) {
    taxableAmount = round2(grossAfterDiscount / (1 + gstRate / 100))
    subtotalExTax = round2(basePrice / (1 + gstRate / 100))
    const tax = round2(grossAfterDiscount - taxableAmount)
    if (isSameState) {
      cgst = round2(tax / 2)
      sgst = round2(tax - cgst)
    } else {
      igst = tax
    }
  } else {
    taxableAmount = grossAfterDiscount
    subtotalExTax = round2(basePrice)
    if (isSameState) {
      cgst = round2((taxableAmount * gstRate) / 200)
      sgst = round2((taxableAmount * gstRate) / 200)
    } else {
      igst = round2((taxableAmount * gstRate) / 100)
    }
  }
  const totalTax = round2(cgst + sgst + igst)
  const totalAmount = round2(taxableAmount + totalTax)
  return {
    basePrice: round2(basePrice),
    subtotalExTax,
    discountAmount: round2(discountAmount),
    taxableAmount,
    gstRate,
    cgst,
    sgst,
    igst,
    totalTax,
    totalAmount,
    priceIncludesGst: inclusive,
  }
}

/**
 * Resolve products from the cache and compute totals exactly the way the
 * server's BillingEngine does.
 *
 * Throws Error('PRODUCT_NOT_FOUND_OFFLINE') if any line points at a product
 * that isn't in the offline cache — caller should reject the sale and tell
 * the cashier to refresh products while online.
 */
export function buildCartLocal(
  items: CartItemInput[],
  cachedProducts: Product[],
  ctx: CalcContext,
): CartTotals {
  if (!items.length) {
    throw new Error('CART_EMPTY')
  }
  const byId = new Map(cachedProducts.map((p) => [String(p._id), p]))

  // Keep each line's ex-tax base alongside it so the totals balance for both
  // inclusive and exclusive pricing (mirrors server gst.engine.js).
  const subtotalExTaxByLine: number[] = []

  const lines: CartLine[] = items.map((it) => {
    const product = byId.get(String(it.productId))
    if (!product) throw new Error('PRODUCT_NOT_FOUND_OFFLINE')
    const quantity = Number(it.quantity || 1)
    if (quantity <= 0) throw new Error('INVALID_QUANTITY')
    const sellingPrice = Number(product.sellingPrice)
    const basePrice = sellingPrice * quantity
    const computed = computeItemTax(
      {
        basePrice,
        discount: Number(it.discount || 0),
        discountType: it.discountType || 'flat',
        gstRate: Number(product.gstRate || 0),
        priceIncludesGst: !!product.priceIncludesGst,
      },
      ctx,
    )
    subtotalExTaxByLine.push(computed.subtotalExTax)
    return {
      productId: String(product._id),
      productSnapshot: {
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        hsnCode: product.hsnCode,
      },
      quantity,
      unit: product.unit,
      sellingPrice,
      basePrice: computed.basePrice,
      discount: Number(it.discount || 0),
      discountType: it.discountType || 'flat',
      discountAmount: computed.discountAmount,
      taxableAmount: computed.taxableAmount,
      gstRate: computed.gstRate,
      cgst: computed.cgst,
      sgst: computed.sgst,
      igst: computed.igst,
      totalTax: computed.totalTax,
      totalAmount: computed.totalAmount,
      ...(it.unitId ? { unitId: it.unitId } : {}),
    }
  })

  // Aggregate from ex-tax bases: grandTotal = subtotal - discount + tax
  // == Σ line.totalAmount. Identical to old behaviour for exclusive lines;
  // for inclusive lines the tax is extracted instead of stacked on top, so
  // the customer pays exactly the listed selling price.
  const subtotal = round2(subtotalExTaxByLine.reduce((s, v) => s + v, 0))
  const taxableTotal = round2(lines.reduce((s, l) => s + l.taxableAmount, 0))
  const totalTax = round2(lines.reduce((s, l) => s + l.totalTax, 0))
  const totalDiscount = round2(subtotal - taxableTotal)
  const grandTotalRaw = round2(taxableTotal + totalTax)
  const grandTotal = Math.round(grandTotalRaw)
  const roundOff = round2(grandTotal - grandTotalRaw)

  return { items: lines, subtotal, totalDiscount, totalTax, roundOff, grandTotal }
}
