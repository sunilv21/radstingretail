function calcEan13CheckDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(twelve[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  return Number(code[12]) === calcEan13CheckDigit(code.slice(0, 12));
}

/**
 * Generate a random but valid EAN-13 with a given GS1 prefix (defaults to
 * India's 890). Collision-check happens at the caller level (ProductService)
 * so this function stays pure and DB-agnostic.
 */
export function generateEan13Barcode({ prefix = '890' } = {}) {
  const middle = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0');
  const twelve = `${prefix}${middle}`;
  return `${twelve}${calcEan13CheckDigit(twelve)}`;
}

export function nextInvoiceNumber(storeDoc) {
  storeDoc.invoiceCounter = (storeDoc.invoiceCounter || 0) + 1;
  const year = new Date().getFullYear();
  const padded = String(storeDoc.invoiceCounter).padStart(5, '0');
  return `${storeDoc.invoicePrefix || 'INV'}-${year}-${padded}`;
}
