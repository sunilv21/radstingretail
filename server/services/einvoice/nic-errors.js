/**
 * NIC IRP error-code translator. Most GSPs forward NIC's `error_code` /
 * `errorDetails` straight through, so we get the canonical 4-digit code
 * back. We turn it into a humane message the cashier can act on.
 *
 * Codes are stable per the NIC e-invoice schema docs (FAQ doc Annex-A).
 * Full list at https://einv-apisandbox.nic.in/version1.03/errorlist.html
 */

const CODES = {
  // ---- Auth / token ----
  '2169': 'IRN already generated for this invoice (duplicate doc number).',
  '2174': 'Token expired. Re-authenticating…',
  '2245': 'Invalid GSTIN length in seller details.',
  '3028': 'GSTIN does not match seller GSTIN registered with NIC.',

  // ---- IRN generate ----
  '2150': 'Duplicate IRN — this invoice number already has an IRN.',
  '2154': 'Document date cannot be more than 7 days in the past (NIC policy).',
  '2168': 'Document type does not match the supply type (e.g. INV vs CRN).',
  '2172': 'Cannot cancel — IRN was generated more than 24 hours ago.',
  '2176': 'Invalid supplier GSTIN format.',
  '2189': 'HSN code is invalid or not in the NIC HSN master.',
  '2194': 'Invalid place-of-supply state code.',
  '2197': 'Tax rate is invalid for the selected GST category.',
  '2200': 'Invalid pincode in supplier or buyer address.',
  '2211': 'Tax amount calculation does not match expected formula.',
  '2227': 'Invoice total doesn\'t match the sum of line items + tax + round-off.',
  '2233': 'Invalid buyer GSTIN format.',
  '2240': 'Place of supply is required when buyer is in a different state.',
  '2244': 'Invoice date is in the future or malformed.',
  '2250': 'Document type mismatch — pick INV / CRN / DBN correctly.',
  '2265': 'GSTIN of buyer is the same as seller — self-invoice not allowed.',

  // ---- Cancel ----
  '2275': 'Cancellation reason missing — reason code is required.',
  '2295': 'Cancellation reason not in NIC allowed list (1=Duplicate, 2=Data entry, 3=Order cancel, 4=Other).',
  '2298': 'IRN is already cancelled.',

  // ---- Network / generic ----
  '4001': 'GSP rejected the request — check Authorization header.',
  '4002': 'Invalid auth token or token expired.',
  '4003': 'Forbidden — the GSP user is not enrolled for this GSTIN.',
};

/**
 * Translate one or many NIC error codes into human messages. Accepts:
 *   - a single code/object/string
 *   - an array of those
 *   - a generic GSP response with `error_details`, `errorDetails`, etc.
 * Returns a one-line string suitable for toast/error display.
 */
export function translateNicError(payload) {
  if (!payload) return 'Unknown NIC error';

  // Already-formatted single string
  if (typeof payload === 'string') {
    const m = payload.match(/\b(\d{4})\b/);
    if (m && CODES[m[1]]) return `[${m[1]}] ${CODES[m[1]]}`;
    return payload;
  }

  // NIC-style `errorDetails: [{ErrorCode, ErrorMessage}]` or
  // `error_details: [{code, message}]` arrays
  const list =
    payload.errorDetails ||
    payload.error_details ||
    payload.errors ||
    (payload.error_code ? [payload] : null);

  if (Array.isArray(list)) {
    return list
      .map((e) => {
        const code = String(e.ErrorCode || e.error_code || e.code || '');
        const msg = e.ErrorMessage || e.error_message || e.message || '';
        const friendly = code && CODES[code] ? CODES[code] : msg;
        return code ? `[${code}] ${friendly || msg}` : friendly || msg;
      })
      .filter(Boolean)
      .join(' · ');
  }

  // Bare object
  const code = String(payload.error_code || payload.ErrorCode || payload.code || '');
  const msg = payload.error_message || payload.ErrorMessage || payload.message || '';
  if (code && CODES[code]) return `[${code}] ${CODES[code]}`;
  if (msg) return msg;
  try {
    return JSON.stringify(payload).slice(0, 240);
  } catch {
    return 'Unknown NIC error';
  }
}

/** Exposed for the Settings UI's "common errors" doc panel. */
export const NIC_ERROR_CATALOGUE = CODES;
