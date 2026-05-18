const round2 = (n) => Math.round(n * 100) / 100;

export const GSTEngine = {
  computeItemTax(item, { storeStateCode, customerStateCode }) {
    const basePrice = Number(item.basePrice || item.sellingPrice * item.quantity);
    const discountAmount =
      item.discountType === 'percent'
        ? basePrice * (Number(item.discount || 0) / 100)
        : Number(item.discount || 0);
    const grossAfterDiscount = round2(basePrice - discountAmount);

    const rate = Number(item.gstRate || 0);
    const isSameState = String(storeStateCode) === String(customerStateCode || storeStateCode);
    const inclusive = !!item.priceIncludesGst;

    let taxableAmount;
    let cgst = 0,
      sgst = 0,
      igst = 0;

    if (inclusive && rate > 0) {
      // Selling price already includes GST. Extract the tax out of the gross
      // so the customer pays exactly the listed (gross) amount.
      taxableAmount = round2(grossAfterDiscount / (1 + rate / 100));
      const totalTaxFromInclusive = round2(grossAfterDiscount - taxableAmount);
      if (isSameState) {
        cgst = round2(totalTaxFromInclusive / 2);
        sgst = round2(totalTaxFromInclusive - cgst); // SGST absorbs any paisa rounding
      } else {
        igst = totalTaxFromInclusive;
      }
    } else {
      // Tax-exclusive pricing (historical default): tax is added on top.
      taxableAmount = grossAfterDiscount;
      if (isSameState) {
        cgst = round2((taxableAmount * rate) / 200);
        sgst = round2((taxableAmount * rate) / 200);
      } else {
        igst = round2((taxableAmount * rate) / 100);
      }
    }
    const totalTax = round2(cgst + sgst + igst);
    const totalAmount = round2(taxableAmount + totalTax);

    return {
      basePrice: round2(basePrice),
      discountAmount: round2(discountAmount),
      taxableAmount,
      gstRate: rate,
      cgst,
      sgst,
      igst,
      totalTax,
      totalAmount,
      priceIncludesGst: inclusive,
    };
  },

  computeCartTotals(items, { storeStateCode, customerStateCode }) {
    const lines = items.map((it) => {
      const computed = GSTEngine.computeItemTax(it, { storeStateCode, customerStateCode });
      return { ...it, ...computed };
    });

    const subtotal = round2(lines.reduce((s, l) => s + l.basePrice, 0));
    const totalDiscount = round2(lines.reduce((s, l) => s + l.discountAmount, 0));
    const totalTax = round2(lines.reduce((s, l) => s + l.totalTax, 0));
    const grandTotalRaw = round2(subtotal - totalDiscount + totalTax);
    const grandTotal = Math.round(grandTotalRaw);
    const roundOff = round2(grandTotal - grandTotalRaw);

    return { items: lines, subtotal, totalDiscount, totalTax, roundOff, grandTotal };
  },
};
