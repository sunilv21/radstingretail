import { AppError, fail } from '../utils/response.js';

const isProd = process.env.NODE_ENV === 'production';

export function errorHandler(err, req, res, _next) {
  // Already-modeled application errors get passed through unchanged.
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(fail(err.code, err.message, err.details));
  }

  // Mongoose validation: surface the field-level problems as a 400.
  if (err && err.name === 'ValidationError' && err.errors) {
    const details = {};
    for (const [field, e] of Object.entries(err.errors)) {
      details[field] = e?.message || 'Invalid value';
    }
    return res.status(400).json(fail('VALIDATION_ERROR', 'Some fields failed validation', details));
  }

  // Mongoose CastError: bad ObjectId etc. Don't 500 for these.
  if (err && err.name === 'CastError') {
    return res
      .status(400)
      .json(fail('CAST_ERROR', `Invalid ${err.path || 'value'}: ${err.value}`));
  }

  // Duplicate key — schema-level uniqueness collision.
  if (err && (err.code === 11000 || err.code === 11001)) {
    const fields = err.keyValue ? Object.keys(err.keyValue) : [];
    return res.status(409).json(
      fail(
        'DUPLICATE_KEY',
        `Already exists: ${fields.join(', ') || 'unique field'}`,
        err.keyValue,
      ),
    );
  }

  // Mongo network / timeout — give the client a retry-friendly status.
  if (err && (err.name === 'MongoNetworkError' || err.name === 'MongoServerSelectionError')) {
    console.error(`[db] ${err.name}: ${err.message}`);
    return res.status(503).json(fail('DB_UNAVAILABLE', 'Database is temporarily unavailable. Try again.'));
  }

  // JSON body parse error from express.json() — usually malformed input.
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json(fail('BAD_JSON', 'Request body is not valid JSON'));
  }

  // Catch-all. Log full stack server-side, return a sanitised message.
  console.error(`[unhandled_error] ${req?.method || ''} ${req?.originalUrl || ''}`);
  console.error(err?.stack || err);
  // Default: hide internal error text in prod. Operator escape hatch:
  // set DEBUG_API_ERRORS=1 in env (Vercel project → Settings → Env Vars,
  // then redeploy) to surface the real message + first stack frame so
  // production 500s can be triaged without trawling function logs. Turn
  // it off once the bug is found — error messages can leak schema names,
  // file paths, and secret-shaped strings.
  const debugErrors = process.env.DEBUG_API_ERRORS === '1';
  const exposeMessage = !isProd || debugErrors
    ? err?.message || 'Something went wrong on our side'
    : 'Something went wrong on our side';
  const details = debugErrors && err?.stack
    ? { stack: String(err.stack).split('\n').slice(0, 6).map((s) => s.trim()) }
    : undefined;
  res.status(500).json(fail('INTERNAL_ERROR', exposeMessage, details));
}

export function notFoundHandler(_req, res) {
  res.status(404).json(fail('NOT_FOUND', 'Route not found'));
}
