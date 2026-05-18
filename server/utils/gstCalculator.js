export const calculateGST = (amount, gstRate) => {
  const gstAmount = (amount * gstRate) / 100;
  return {
    gstAmount: parseFloat(gstAmount.toFixed(2)),
    totalAmount: parseFloat((amount + gstAmount).toFixed(2)),
  };
};

export const calculateItemGST = (quantity, rate, gstRate, discount = 0) => {
  const lineAmount = quantity * rate;
  const discountedAmount = lineAmount - (lineAmount * discount) / 100;
  const { gstAmount, totalAmount } = calculateGST(discountedAmount, gstRate);

  return {
    quantity,
    rate,
    amount: parseFloat(discountedAmount.toFixed(2)),
    gstRate,
    gstAmount,
    totalAmount,
    discount,
  };
};

export const splitGST = (gstAmount, isSameState = true) => {
  if (isSameState) {
    const halfGST = gstAmount / 2;
    return {
      cgst: parseFloat(halfGST.toFixed(2)),
      sgst: parseFloat(halfGST.toFixed(2)),
      igst: 0,
    };
  } else {
    return {
      cgst: 0,
      sgst: 0,
      igst: parseFloat(gstAmount.toFixed(2)),
    };
  }
};

export const calculateSaleTotal = (items) => {
  let subtotal = 0;
  let totalGST = 0;
  const gstBreakdown = {};

  items.forEach((item) => {
    const itemGST = calculateItemGST(
      item.quantity,
      item.rate,
      item.gstRate,
      item.discount || 0
    );

    subtotal += itemGST.amount;
    totalGST += itemGST.gstAmount;

    if (!gstBreakdown[item.gstRate]) {
      gstBreakdown[item.gstRate] = {
        taxableValue: 0,
        gstAmount: 0,
      };
    }

    gstBreakdown[item.gstRate].taxableValue += itemGST.amount;
    gstBreakdown[item.gstRate].gstAmount += itemGST.gstAmount;
  });

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    totalGST: parseFloat(totalGST.toFixed(2)),
    total: parseFloat((subtotal + totalGST).toFixed(2)),
    gstBreakdown,
  };
};

export const generateGSTReport = (sales, month) => {
  const report = {
    month,
    outwardSupplies: {
      total: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      items: [],
    },
    inwardSupplies: {
      total: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      items: [],
    },
  };

  sales.forEach((sale) => {
    if (sale.status === 'Completed') {
      report.outwardSupplies.total += sale.total;
      report.outwardSupplies.cgst += sale.cgst || 0;
      report.outwardSupplies.sgst += sale.sgst || 0;
      report.outwardSupplies.igst += sale.igst || 0;
    }
  });

  return report;
};
