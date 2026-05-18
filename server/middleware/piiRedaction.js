import { isReadOnlyRole } from '../rbac/matrix.js';

/**
 * For external read-only roles (CA / auditor) we strip customer + supplier
 * PII (phone / email / address) from outbound responses. The CA needs the
 * GST identity (GSTIN, name, state code), invoice numbers and totals — not
 * the customer's mobile number. Redaction happens at the JSON-encode step
 * via a res.json() wrapper so we don't have to thread it through every
 * route handler.
 *
 * Wires only on the auth-required side of the API (mounted after
 * `authenticate`). Un-authenticated routes are unaffected.
 */

const PII_FIELDS = ['phone', 'email', 'address'];

function redact(node, _seen = new WeakSet()) {
  if (node === null || typeof node !== 'object') return node;
  if (_seen.has(node)) return node; // cycle guard
  _seen.add(node);

  if (Array.isArray(node)) {
    for (const el of node) redact(el, _seen);
    return node;
  }

  for (const k of Object.keys(node)) {
    if (PII_FIELDS.includes(k) && typeof node[k] === 'string') {
      node[k] = '[REDACTED]';
    } else {
      redact(node[k], _seen);
    }
  }
  return node;
}

export function piiRedactionForReadOnly(req, res, next) {
  if (!isReadOnlyRole(req.user?.role)) return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      // Only redact our standard envelope's `data` so we don't mangle error
      // messages (which legitimately may contain a customer name).
      if (body && typeof body === 'object' && 'data' in body) {
        body = { ...body, data: redact(JSON.parse(JSON.stringify(body.data))) };
      }
    } catch {
      /* fall through with the original body */
    }
    return originalJson(body);
  };
  next();
}
