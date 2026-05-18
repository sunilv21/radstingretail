export function nextPoNumber(storeDoc) {
  storeDoc.poCounter = (storeDoc.poCounter || 0) + 1;
  const year = new Date().getFullYear();
  return `PO-${year}-${String(storeDoc.poCounter).padStart(5, '0')}`;
}

export function nextGrnNumber(storeDoc) {
  storeDoc.grnCounter = (storeDoc.grnCounter || 0) + 1;
  const year = new Date().getFullYear();
  return `GRN-${year}-${String(storeDoc.grnCounter).padStart(5, '0')}`;
}

export function nextCreditNoteNumber(storeDoc) {
  storeDoc.creditNoteCounter = (storeDoc.creditNoteCounter || 0) + 1;
  const year = new Date().getFullYear();
  return `CN-${year}-${String(storeDoc.creditNoteCounter).padStart(5, '0')}`;
}

export function nextDebitNoteNumber(storeDoc) {
  storeDoc.debitNoteCounter = (storeDoc.debitNoteCounter || 0) + 1;
  const year = new Date().getFullYear();
  return `DN-${year}-${String(storeDoc.debitNoteCounter).padStart(5, '0')}`;
}

export function nextVoucherNumber(storeDoc, prefix) {
  // voucherCounters is a Mongoose Map — must use .get() / .set(), and
  // markModified so the increment actually persists on save().
  if (!storeDoc.voucherCounters) {
    storeDoc.voucherCounters = new Map();
  }
  const current = Number(storeDoc.voucherCounters.get(prefix) || 0);
  const next = current + 1;
  storeDoc.voucherCounters.set(prefix, next);
  storeDoc.markModified('voucherCounters');
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
}
