import serverless from 'serverless-http';
import { app, prepareApp } from '../server/app.js';

const expressHandler = serverless(app);

/**
 * Vercel's Node runtime parses JSON bodies and consumes the underlying
 * request stream BEFORE handing the function `req`. When Express's
 * `express.json()` middleware runs later it sees an empty stream and
 * `req.body` becomes `{}` — every login / sale-create / etc. arrives
 * without its payload.
 *
 * Fix: keep Vercel's pre-parsed `req.body` as-is, but set the magic
 * `_body` flag that body-parser checks at the top of its handler. With
 * `_body === true`, body-parser skips reading the stream entirely and
 * lets `req.body` flow through to the route. This is the canonical
 * "body was parsed upstream" hand-off in the body-parser source.
 *
 * Also reconstruct `req.rawBody` from the parsed body so any route that
 * needs the raw bytes (WhatsApp webhook HMAC verification — see
 * server/routes/webhook.routes.js) still works on Vercel.
 */
function normalizeVercelBody(req) {
  if (req.body === undefined || req.body === null) return;
  // Buffer body — leave it alone, Express handles it natively.
  if (Buffer.isBuffer(req.body)) return;
  // Only JSON content-type uses the parsed-object body shape on Vercel.
  const ct = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!ct.includes('application/json')) return;

  // Mark the body as already-parsed so body-parser doesn't try to read
  // a stream that Vercel has already drained.
  req._body = true;

  // Webhook HMAC needs the exact bytes — reconstruct them from the parsed
  // object. Acceptable here because Meta/Stripe re-sign with stable JSON
  // serialisation; if we hit signature drift for any provider we can
  // switch to disabling Vercel's body parser for those routes specifically.
  if (typeof req.body === 'object') {
    try {
      req.rawBody = Buffer.from(JSON.stringify(req.body), 'utf8');
    } catch {
      /* non-serialisable — skip rawBody, signature checks will fail */
    }
  }
}

export default async function handler(req, res) {
  // The vercel.json rewrite turns `/api/auth/login` into
  // `/api/server?path=auth/login`. Reconstruct the original URL so
  // Express's router can dispatch.
  if (req.query?.path) {
    const path = Array.isArray(req.query.path)
      ? req.query.path.join('/')
      : String(req.query.path);
    const query = new URLSearchParams(req.query);
    query.delete('path');
    const suffix = query.toString();
    req.url = `/api/${path}${suffix ? `?${suffix}` : ''}`;
  }

  // Per-request diagnostics. Never log Authorization headers, cookies,
  // or anything from req.body — payload-level logging is added only
  // when DEBUG_API_ERRORS=1.
  const start = Date.now();
  const reqId =
    String(req.headers?.['x-vercel-id'] || '').slice(0, 12) ||
    Math.random().toString(36).slice(2, 10);
  const dbg = process.env.DEBUG_API_ERRORS === '1';
  console.log(
    `[api] ▶ ${reqId} ${req.method} ${req.url} ct=${req.headers?.['content-type'] || '-'}`,
  );

  try {
    await prepareApp();
  } catch (err) {
    console.error(`[api] ✖ ${reqId} prepareApp failed:`, err?.stack || err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'STARTUP_FAILED',
          message: err?.message || 'Database connection failed',
        },
        reqId,
      }),
    );
    return;
  }

  normalizeVercelBody(req);

  if (dbg) {
    // Body shape only — never the actual values.
    const bodyShape =
      req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? Object.keys(req.body)
        : Buffer.isBuffer(req.body)
          ? '<Buffer>'
          : typeof req.body;
    console.log(
      `[api] · ${reqId} body=${JSON.stringify(bodyShape)} _body=${!!req._body} rawBody=${req.rawBody ? req.rawBody.length + 'B' : '-'}`,
    );
  }

  try {
    const result = await expressHandler(req, res);
    console.log(
      `[api] ◀ ${reqId} ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - start}ms)`,
    );
    return result;
  } catch (err) {
    console.error(
      `[api] ✖ ${reqId} ${req.method} ${req.url} threw:`,
      err?.stack || err,
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: {
            code: 'FUNCTION_ERROR',
            message: dbg
              ? err?.message || 'API function failed'
              : 'API function failed',
            ...(dbg && err?.stack
              ? { stack: err.stack.split('\n').slice(0, 8).map((s) => s.trim()) }
              : {}),
          },
          reqId,
        }),
      );
    }
  }
}
