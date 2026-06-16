import { claimSequence } from './sequence.js';

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

/**
 * Next sequential invoice number — now backed by the range-pre-allocation
 * sequence allocator (see utils/sequence.js) instead of incrementing the
 * Store document inside the sale transaction. This removes the per-store
 * hot-doc contention that capped billing throughput. The Store's legacy
 * `invoiceCounter` is used only to seed continuity on first claim.
 *
 * Async now: callers must `await`. Format is unchanged (`<PREFIX>-<YYYY>-#####`).
 */
export async function nextInvoiceNumber(storeDoc) {
  const seq = await claimSequence(storeDoc._id, 'invoice', storeDoc.invoiceCounter || 0);
  const year = new Date().getFullYear();
  const padded = String(seq).padStart(5, '0');
  return `${storeDoc.invoicePrefix || 'INV'}-${year}-${padded}`;
}
