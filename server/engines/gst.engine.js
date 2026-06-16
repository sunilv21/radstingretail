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

    // Ex-tax value of the line BEFORE discount. For inclusive pricing the
    // listed price already contains tax, so the ex-tax base is the price
    // divided out by the rate. This is what the cart subtotal sums — keeping
    // it ex-tax is what stops the grand total from adding GST a second time
    // on top of an already-inclusive price.
    let subtotalExTax;

    if (inclusive && rate > 0) {
      // Selling price already includes GST. Extract the tax out of the gross
      // so the customer pays exactly the listed (gross) amount.
      taxableAmount = round2(grossAfterDiscount / (1 + rate / 100));
      subtotalExTax = round2(basePrice / (1 + rate / 100));
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
      subtotalExTax = round2(basePrice);
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
      subtotalExTax,
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

    // Aggregate from ex-tax bases so inclusive and exclusive both balance:
    //   grandTotal = subtotal - discount + tax  ==  Σ line.totalAmount.
    // `subtotal` and `totalDiscount` are ex-tax. For EXCLUSIVE lines this is
    // identical to the old behaviour (subtotalExTax === basePrice), so legacy
    // exclusive sales are unchanged. For INCLUSIVE lines the tax is extracted
    // from the price rather than stacked on top, so the customer pays exactly
    // the listed selling price.
    const subtotal = round2(lines.reduce((s, l) => s + l.subtotalExTax, 0));
    const taxableTotal = round2(lines.reduce((s, l) => s + l.taxableAmount, 0));
    const totalTax = round2(lines.reduce((s, l) => s + l.totalTax, 0));
    const totalDiscount = round2(subtotal - taxableTotal);
    const grandTotalRaw = round2(taxableTotal + totalTax);
    const grandTotal = Math.round(grandTotalRaw);
    const roundOff = round2(grandTotal - grandTotalRaw);

    return { items: lines, subtotal, totalDiscount, totalTax, roundOff, grandTotal };
  },
};
