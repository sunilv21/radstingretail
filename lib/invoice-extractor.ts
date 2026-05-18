/**
 * Pulls structured fields out of OCR'd Indian-GST-invoice text.
 * Pure regex — works on output from any OCR provider (Tesseract today,
 * AWS Textract / Google Vision later).
 *
 * No field is required; every extractor returns either a best-guess match
 * or null. The merchant reviews and edits before posting the purchase.
 */

export interface ExtractedInvoice {
  supplierGstin: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO 'YYYY-MM-DD' if parsed
  totalAmount: number | null;
  taxableAmount: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  hsnCodes: string[];
  rawText: string;
  confidence: { fields: number; total: number }; // 0..1 — fraction of fields successfully extracted
}

// ---- GSTIN ---------------------------------------------------------------

// Standard format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric.
const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/g;

export function extractGstin(text: string): string | null {
  const matches = text.toUpperCase().match(GSTIN_RE);
  if (!matches) return null;
  // If multiple GSTINs appear (supplier + customer), the supplier's usually
  // appears first — at the top of the bill.
  return matches[0];
}

// ---- Invoice number ------------------------------------------------------

const INVOICE_NUMBER_LABELS = [
  /(?:invoice|inv|bill|tax\s+invoice)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/_]{2,20})/i,
  /(?:document|doc)\s*no\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/_]{2,20})/i,
];

export function extractInvoiceNumber(text: string): string | null {
  for (const re of INVOICE_NUMBER_LABELS) {
    const m = text.match(re);
    if (m && m[1]) {
      const candidate = m[1].trim();
      // Filter obvious false positives like "of", "for", etc.
      if (candidate.length >= 3 && /[0-9]/.test(candidate)) return candidate;
    }
  }
  return null;
}

// ---- Date ----------------------------------------------------------------

const DATE_PATTERNS: { re: RegExp; map: (m: RegExpMatchArray) => string | null }[] = [
  // DD/MM/YYYY or DD-MM-YYYY
  {
    re: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    map: (m) => {
      const d = Number(m[1]); const mo = Number(m[2]); let y = Number(m[3]);
      if (y < 100) y += y < 50 ? 2000 : 1900;
      if (d > 31 || mo > 12 || d < 1 || mo < 1) return null;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    },
  },
  // DD MMM YYYY (15 Apr 2026)
  {
    re: /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
    map: (m) => {
      const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
        .indexOf(m[2].toLowerCase().slice(0, 3));
      if (monthIdx < 0) return null;
      return `${m[3]}-${String(monthIdx + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
    },
  },
];

export function extractInvoiceDate(text: string): string | null {
  // Look near "Date" / "Invoice Date" labels first; fall back to first date in text.
  const nearLabel = text.match(/(?:invoice\s+date|date|dt\.?)\s*[:\-]?\s*([\d\/\-A-Za-z\s]{8,20})/i);
  const targets = nearLabel ? [nearLabel[1]] : [];
  targets.push(text);
  for (const target of targets) {
    for (const { re, map } of DATE_PATTERNS) {
      const m = target.match(re);
      if (m) {
        const iso = map(m);
        if (iso) return iso;
      }
    }
  }
  return null;
}

// ---- Amounts -------------------------------------------------------------

const NUMBER_RE = /([\d,]+(?:\.\d{1,2})?)/;

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[, ]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractLabeledAmount(text: string, labels: RegExp[]): number | null {
  for (const labelRe of labels) {
    // Capture: <label> <some text up to 30 chars> <amount>
    const re = new RegExp(`${labelRe.source}[^\\n]{0,30}?${NUMBER_RE.source}`, 'i');
    const m = text.match(re);
    if (m) {
      const idx = m.length - 1;
      const n = parseNumber(m[idx]);
      if (n !== null) return n;
    }
  }
  return null;
}

export function extractTotalAmount(text: string): number | null {
  return extractLabeledAmount(text, [
    /grand\s*total/, /total\s+amount/, /net\s+amount/, /(?:invoice|bill)\s+(?:total|amount)/, /\btotal\b/,
  ]);
}

export function extractTaxableAmount(text: string): number | null {
  return extractLabeledAmount(text, [
    /taxable\s+(?:amount|value)/, /sub[\-\s]*total/, /assessable\s+value/,
  ]);
}

export function extractCgst(text: string): number | null {
  return extractLabeledAmount(text, [/\bcgst\b(?!\s*%)/, /central\s+(?:gst|tax)/]);
}

export function extractSgst(text: string): number | null {
  return extractLabeledAmount(text, [/\bsgst\b(?!\s*%)/, /state\s+(?:gst|tax)/]);
}

export function extractIgst(text: string): number | null {
  return extractLabeledAmount(text, [/\bigst\b(?!\s*%)/, /integrated\s+(?:gst|tax)/]);
}

// ---- HSN codes -----------------------------------------------------------

// HSN codes: 4-8 digits, usually appearing in a column of line items.
const HSN_RE = /\b(?:hsn|sac)\s*(?:code|no\.?)?\s*[:\-]?\s*(\d{4,8})\b/gi;

export function extractHsnCodes(text: string): string[] {
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = HSN_RE.exec(text))) {
    codes.add(m[1]);
  }
  return Array.from(codes).slice(0, 10); // cap at 10 — usually a few unique codes per bill
}

// ---- Supplier name (heuristic) -------------------------------------------

export function extractSupplierName(text: string): string | null {
  // Naive: take the first non-empty line that's mostly letters and not a label.
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    // Skip lines with too many digits or that look like addresses
    const letterCount = (line.match(/[A-Za-z]/g) || []).length;
    const digitCount = (line.match(/\d/g) || []).length;
    if (letterCount < 5) continue;
    if (digitCount > letterCount / 2) continue;
    if (/(invoice|tax\s+invoice|bill|gstin|address|phone|email)/i.test(line)) continue;
    if (line.length > 60) continue;
    return line;
  }
  return null;
}

// ---- Combined extractor --------------------------------------------------

export function extractInvoiceFields(rawText: string): ExtractedInvoice {
  const supplierGstin = extractGstin(rawText);
  const supplierName = extractSupplierName(rawText);
  const invoiceNumber = extractInvoiceNumber(rawText);
  const invoiceDate = extractInvoiceDate(rawText);
  const totalAmount = extractTotalAmount(rawText);
  const taxableAmount = extractTaxableAmount(rawText);
  const cgst = extractCgst(rawText);
  const sgst = extractSgst(rawText);
  const igst = extractIgst(rawText);
  const hsnCodes = extractHsnCodes(rawText);

  const fields = [
    supplierGstin, supplierName, invoiceNumber, invoiceDate,
    totalAmount, taxableAmount, cgst || sgst || igst,
  ];
  const filled = fields.filter((v) => v !== null && v !== undefined).length;
  const confidence = { fields: filled, total: fields.length };

  return {
    supplierGstin,
    supplierName,
    invoiceNumber,
    invoiceDate,
    totalAmount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    hsnCodes,
    rawText,
    confidence,
  };
}
