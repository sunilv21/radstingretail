import { HSN_MASTER, lookupHsn, searchHsn } from '../data/hsn-master.js';

/**
 * HSN / SAC verification primitives. The format check is strict (digit count
 * must match GST rules); the master lookup is lenient — an "unknown" HSN
 * is a warning, not a failure, because our bundled list isn't exhaustive.
 *
 * Why two failure modes?
 *  - INVALID_FORMAT: definitely wrong — wrong digits/letters, blocks save.
 *  - UNKNOWN: well-formed but not in our master — informational only.
 *  - RATE_MISMATCH: in master but rate ≠ product's gstRate — informational.
 *
 * Per CBIC rules, HSN length depends on aggregate turnover:
 *  - < ₹5Cr  : 4-digit HSN mandatory on B2B invoices
 *  - ≥ ₹5Cr  : 6-digit HSN mandatory on all invoices
 *  - Exports : 8-digit always
 *
 * Services use a 6-digit SAC code that always starts with "99".
 */

export const VALID_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

/** Strip whitespace and uppercase; both code paths use this. */
export function normaliseHsn(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/**
 * Pure format check. Returns:
 *   { valid: boolean, kind: 'hsn' | 'sac' | null, digits: number, normalized: string, reason?: string }
 */
export function validateHsnFormat(raw, { minDigits = 4 } = {}) {
  const code = normaliseHsn(raw);
  if (!code) return { valid: false, kind: null, digits: 0, normalized: '', reason: 'EMPTY' };

  // SAC: 6-digit numeric starting with 99.
  if (/^99[0-9]{4}$/.test(code)) {
    return { valid: true, kind: 'sac', digits: 6, normalized: code };
  }

  // HSN: 2 / 4 / 6 / 8 digit numeric.
  if (!/^[0-9]{2,8}$/.test(code)) {
    return {
      valid: false,
      kind: null,
      digits: code.length,
      normalized: code,
      reason: 'NOT_NUMERIC_OR_OUT_OF_RANGE',
    };
  }

  const len = code.length;
  // 2/3/5/7 are non-standard widths.
  if (![2, 4, 6, 8].includes(len)) {
    return {
      valid: false,
      kind: 'hsn',
      digits: len,
      normalized: code,
      reason: 'BAD_DIGIT_COUNT',
    };
  }

  if (len < minDigits) {
    return {
      valid: false,
      kind: 'hsn',
      digits: len,
      normalized: code,
      reason: 'BELOW_REQUIRED_DIGITS',
    };
  }

  return { valid: true, kind: 'hsn', digits: len, normalized: code };
}

/**
 * Comprehensive verify: format + master + rate. `appliedRate` is the
 * product's gstRate. Returns a single status the UI can render directly.
 *
 *   status:
 *     'verified'        — format ok, in master, rates match
 *     'rate_mismatch'   — format ok, in master, but appliedRate ≠ master rate
 *     'unknown_hsn'     — format ok, not in our master
 *     'invalid_format'  — wrong shape
 *     'missing'         — empty
 */
export function verifyHsn(code, appliedRate, opts = {}) {
  const fmt = validateHsnFormat(code, opts);
  if (fmt.reason === 'EMPTY') {
    return { status: 'missing', ...fmt, masterMatches: [], prescribedRates: [] };
  }
  if (!fmt.valid) {
    return { status: 'invalid_format', ...fmt, masterMatches: [], prescribedRates: [] };
  }

  // 4-digit codes in master live both as 4-digit (chapter heading) and 6/8-digit
  // (sub-heading). Try the exact code first; if not found, fall back to the
  // 4-digit chapter so a product tagged with a 6-digit code can still match
  // the broader chapter's rate.
  const exact = lookupHsn(fmt.normalized);
  const chapter = exact.length === 0 && fmt.normalized.length > 4
    ? lookupHsn(fmt.normalized.slice(0, 4))
    : [];
  const masterMatches = exact.length > 0 ? exact : chapter;

  if (masterMatches.length === 0) {
    return { status: 'unknown_hsn', ...fmt, masterMatches: [], prescribedRates: [] };
  }

  const prescribedRates = Array.from(new Set(masterMatches.map((m) => m.gstRate)));
  const rateOk =
    appliedRate === undefined ||
    appliedRate === null ||
    prescribedRates.includes(Number(appliedRate));

  return {
    status: rateOk ? 'verified' : 'rate_mismatch',
    ...fmt,
    masterMatches,
    prescribedRates,
    appliedRate: appliedRate ?? null,
  };
}

/** Re-export the lookup primitives so route handlers can import from one place. */
export { HSN_MASTER, lookupHsn, searchHsn };
