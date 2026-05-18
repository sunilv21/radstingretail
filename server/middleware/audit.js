import AuditLog from '../models/AuditLog.js';

/**
 * Lightweight middleware that writes one audit row per authenticated request,
 * AFTER the response has been sent. Errors here never affect the request — we
 * swallow them so a logging failure can't take down the API.
 *
 * Skips:
 *   - GET requests (too noisy; we audit reads only via explicit calls)
 *   - any request with statusCode >= 500 (the global error handler logs those)
 *
 * For CA-role users we DO log GETs since their entire purpose is to audit
 * their reads. The middleware is invoked AFTER the auth middleware has set
 * req.user, so we can decide based on role.
 */

const RESOURCE_FROM_PATH = [
  ['/api/sales', 'sales'],
  ['/api/products', 'products'],
  ['/api/inventory', 'inventory'],
  ['/api/purchases', 'purchases'],
  ['/api/customers', 'customers'],
  ['/api/suppliers', 'suppliers'],
  ['/api/accounting', 'accounting'],
  ['/api/gst', 'gst'],
  ['/api/reports', 'reports'],
  ['/api/payroll', 'payroll'],
  ['/api/store', 'store'],
  ['/api/stores', 'store'],
  ['/api/transfers', 'transfers'],
  ['/api/users', 'users'],
  ['/api/auth', 'auth'],
];

function resourceOf(path) {
  for (const [prefix, name] of RESOURCE_FROM_PATH) {
    if (path.startsWith(prefix)) return name;
  }
  return 'other';
}

function actionOf(method, statusCode) {
  if (method === 'GET') return 'read';
  if (method === 'POST') return statusCode === 201 ? 'create' : 'create';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  if (method === 'DELETE') return 'delete';
  return 'unknown';
}

const SENSITIVE_BODY_KEYS = ['password', 'accessToken', 'appSecret', 'clientSecret', 'token'];

function sanitisePayload(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_BODY_KEYS.includes(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = v.slice(0, 200) + '…';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function auditMiddleware(req, res, next) {
  if (!req.user) return next(); // un-auth routes — webhooks, public bills
  const t0 = Date.now();
  const originalUrl = req.originalUrl || req.url;

  // Decide BEFORE the response whether we want to log this request.
  const isCa = req.user.role === 'ca';
  const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
  const shouldLog = isWrite || isCa;

  if (!shouldLog) return next();

  res.on('finish', () => {
    // Skip noisy 5xx — the unhandled-error handler already logs the stack.
    if (res.statusCode >= 500) return;
    const resource = resourceOf(originalUrl);
    const action = actionOf(req.method, res.statusCode);
    setImmediate(() => {
      AuditLog.create({
        organizationId: req.user.organizationId || null,
        storeId: req.user.storeId || null,
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        method: req.method,
        path: originalUrl.length > 240 ? originalUrl.slice(0, 240) + '…' : originalUrl,
        resource,
        action,
        statusCode: res.statusCode,
        payload: isWrite ? sanitisePayload(req.body) : null,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        durationMs: Date.now() - t0,
      }).catch((err) => {
        // Don't crash on logging failure — but record to stderr so we know.
        console.error('[audit] write failed:', err?.message || err);
      });
    });
  });

  next();
}
