/**
 * Pulls structured fields out of OCR'd Indian-GST-invoice text.
 * Pure regex — works on output from any OCR provider (Tesseract today,
 * AWS Textract / Google Vision later).
 *
 * No field is required; every extractor returns either a best-guess match
 * or null. The merchant reviews and edits before posting the purchase.
 */

export interface ExtractedLineItem {
  description: string;
  hsnCode: string | null;
  quantity: number | null;
  rate: number | null;        // per-unit price
  amount: number | null;      // line total (taxable, usually pre-GST)
  gstRate: number | null;     // % if detected on the row
}

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
  lineItems: ExtractedLineItem[];
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
const NUMBER_RE_G = /[\d,]+(?:\.\d{1,2})?/g;

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[, ]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractLabeledAmount(text: string, labels: RegExp[]): number | null {
  const lines = text.split(/\n/);
  for (const labelRe of labels) {
    const anchored = new RegExp(labelRe.source, 'i');
    for (const line of lines) {
      if (!anchored.test(line)) continue;
      // Totals are right-aligned, so take the LAST number on the label's line
      // (ignores intermediate noise like a "9%" rate before the figure).
      const nums = line.match(NUMBER_RE_G);
      if (nums && nums.length) {
        const n = parseNumber(nums[nums.length - 1]);
        if (n !== null) return n;
      }
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

// ---- Line items (product table rows) -------------------------------------

// Where the item table starts: a header row mentioning a description column
// alongside any of qty / rate / amount / hsn.
const TABLE_HEADER_RE =
  /(description|particulars|product|item\s*name|goods|services)/i;
const TABLE_HEADER_COLS_RE = /(qty|quantity|rate|price|amount|hsn|sac|unit)/i;

// Where the table ends: the totals / tax summary block.
const TABLE_END_RE =
  /(sub\s*-?\s*total|taxable\s+(?:value|amount)|grand\s+total|total\s+(?:amount|invoice|value)|round\s*off|amount\s+in\s+words|terms|declaration|bank\s+details|\bcgst\b|\bsgst\b|\bigst\b)/i;

// A money/quantity token: digits with optional thousands commas and decimals.
const TOKEN_RE = /\d[\d,]*(?:\.\d{1,3})?/g;

function parseTokenNum(s: string): number {
  return Number(s.replace(/,/g, ''));
}

/**
 * Best-effort parse of the product table. Returns one row per detected line
 * item with whatever could be read. Every field is nullable — the merchant
 * reviews and corrects in the UI before the PO is created.
 *
 * Strategy: isolate the region between the table header and the totals block,
 * then for each row pull out the HSN, the trailing numbers (qty / rate /
 * amount), and treat the leading text as the description. Rows with no numbers
 * are appended to the previous row's description (wrapped product names).
 */
export function extractLineItems(text: string): ExtractedLineItem[] {
  const lines = text.split(/\n/).map((l) => l.trim());

  // Locate the table region.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (TABLE_HEADER_RE.test(lines[i]) && TABLE_HEADER_COLS_RE.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) {
    // No clear header — scan the whole body but be stricter about what's a row.
    start = 0;
  }
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (TABLE_END_RE.test(lines[i])) {
      end = i;
      break;
    }
  }

  const items: ExtractedLineItem[] = [];
  for (let i = start; i < end; i++) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.length < 3) continue;
    if (TABLE_HEADER_RE.test(rawLine) && TABLE_HEADER_COLS_RE.test(rawLine)) continue;

    const numberMatches = rawLine.match(TOKEN_RE) || [];
    const letterCount = (rawLine.match(/[A-Za-z]/g) || []).length;

    // A row with letters but no numbers = likely a wrapped description line.
    if (numberMatches.length === 0) {
      if (letterCount >= 3 && items.length > 0) {
        items[items.length - 1].description =
          `${items[items.length - 1].description} ${rawLine}`.trim();
      }
      continue;
    }
    // Need some descriptive text to be a product row (skip pure-number noise).
    if (letterCount < 2) continue;

    // Strip a leading serial number ("1 ", "1.", "1)") so it isn't mistaken
    // for a quantity or part of the description.
    const work = rawLine.replace(/^\s*\d{1,3}[.)]?\s+/, '');

    // GST rate on the row, if present ("12%", "18 %").
    const gstRateMatch = work.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    const gstRate = gstRateMatch ? Number(gstRateMatch[1]) : null;

    // HSN: a STANDALONE 4/6/8-digit integer (whitespace on both sides) — this
    // avoids grabbing the "1200" out of a name like "Fan 1200mm" because that
    // digit run is followed by letters, not whitespace.
    const hsnMatch = work.match(/(?:^|\s)(\d{4}|\d{6}|\d{8})(?=\s|$)/);
    const hsnCode = hsnMatch ? hsnMatch[1] : null;

    // Column-aware split: invoice tables separate columns with 2+ spaces (the
    // PDF extractor inserts these on horizontal gaps). The first column is the
    // description; trailing numeric columns are HSN / qty / rate / amount.
    const cols = work.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);

    let description = '';
    let prices: number[] = [];

    const columnMode =
      cols.length >= 2 && /\d/.test(cols[cols.length - 1]);

    if (columnMode) {
      // Description = leading columns that aren't purely numeric.
      const descCols: string[] = [];
      const numericCols: string[] = [];
      for (const c of cols) {
        const isNumeric = /^[\d,.\s%₹]+$/.test(c);
        if (!isNumeric && numericCols.length === 0) descCols.push(c);
        else numericCols.push(c);
      }
      description = descCols.join(' ').trim();
      // Numeric columns → drop the HSN and the gst% , keep money/qty values.
      prices = numericCols
        .map((c) => c.replace(/%/g, '').trim())
        .map(parseTokenNum)
        .filter(
          (n) =>
            Number.isFinite(n) &&
            !(hsnCode !== null && String(n) === hsnCode) &&
            !(gstRate !== null && n === gstRate),
        );
    } else {
      // Single-spaced fallback: description = text before the first standalone
      // number that is the HSN or a price; pull prices from the token stream.
      const tokens = (work.match(TOKEN_RE) || []).map(parseTokenNum);
      prices = tokens.filter(
        (n) =>
          Number.isFinite(n) &&
          !(hsnCode !== null && String(n) === hsnCode) &&
          !(gstRate !== null && n === gstRate),
      );
      // Description: take text up to the HSN token if we found one, else up to
      // the last alpha run. Keeps embedded sizes like "9W" in the name.
      if (hsnCode) {
        const idx = work.indexOf(hsnCode);
        description = work.slice(0, idx).trim();
      }
      if (description.length < 2) {
        const alpha = work.match(/[A-Za-z][A-Za-z0-9 .&/'-]{2,}/);
        description = alpha ? alpha[0].trim() : '';
      }
    }

    description = description.replace(/[|:.\-\s]+$/, '').trim();
    if (!description || description.length < 2) continue;

    // From the price columns, infer qty / rate / amount (amount is the tail).
    let quantity: number | null = null;
    let rate: number | null = null;
    let amount: number | null = null;
    if (prices.length >= 3) {
      amount = prices[prices.length - 1];
      rate = prices[prices.length - 2];
      quantity = prices[prices.length - 3];
    } else if (prices.length === 2) {
      rate = prices[0];
      amount = prices[1];
    } else if (prices.length === 1) {
      amount = prices[0];
    }

    items.push({ description, hsnCode, quantity, rate, amount, gstRate });
  }

  // Sanity cap — invoices rarely exceed this; protects against runaway noise.
  return items.slice(0, 100);
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
  const lineItems = extractLineItems(rawText);

  // Backfill the HSN summary from line items if the labelled extractor missed.
  if (hsnCodes.length === 0) {
    for (const li of lineItems) {
      if (li.hsnCode && !hsnCodes.includes(li.hsnCode)) hsnCodes.push(li.hsnCode);
    }
  }

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
    lineItems,
    rawText,
    confidence,
  };
}
