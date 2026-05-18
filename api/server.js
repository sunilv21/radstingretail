import { Readable } from 'stream';
import serverless from 'serverless-http';
import { app, prepareApp } from '../server/app.js';

const expressHandler = serverless(app);

/**
 * Vercel's Node runtime pre-parses JSON bodies and consumes the underlying
 * request stream. When the Express `express.json()` middleware runs later,
 * it sees an empty stream and `req.body` ends up as `{}` — every login,
 * sale-create, etc. arrives without its payload. The fix is to repackage
 * Vercel's already-parsed body back into a readable stream that Express's
 * body parser can consume normally.
 *
 * Only applied when:
 *   - `req.body` is a plain JSON object (not a Buffer, not multipart)
 *   - the request has a JSON content-type
 */
function rehydrateJsonBody(req) {
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) return;
  if (!req.body) return;
  if (Buffer.isBuffer(req.body)) return;
  if (typeof req.body !== 'object') return;
  try {
    const json = JSON.stringify(req.body);
    const buf = Buffer.from(json, 'utf8');
    // Replace the consumed stream with a fresh one carrying the body bytes.
    const stream = Readable.from(buf);
    // Copy node-stream methods/properties Express body-parser expects.
    Object.assign(req, {
      headers: { ...req.headers, 'content-length': String(buf.length) },
      readable: true,
      _readableState: stream._readableState,
    });
    req.read = stream.read.bind(stream);
    req.on = stream.on.bind(stream);
    req.once = stream.once.bind(stream);
    req.pipe = stream.pipe.bind(stream);
    req.removeListener = stream.removeListener.bind(stream);
    // Don't leave Vercel's parsed body sitting on req — Express will
    // refill it from the stream we just attached.
    req.body = undefined;
  } catch (err) {
    console.error('[api] body rehydrate failed:', err);
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

  // Detailed diagnostics for production triage. Sanitised — never log
  // Authorization, cookies, or password fields.
  const start = Date.now();
  const reqId = req.headers?.['x-vercel-id'] || Math.random().toString(36).slice(2, 10);
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

  rehydrateJsonBody(req);

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
      // DEBUG_API_ERRORS=1 in Vercel env exposes the actual error message
      // and stack so an operator can diagnose without crawling logs. Off
      // by default — error messages leak internal detail.
      const exposeDetails = process.env.DEBUG_API_ERRORS === '1';
      res.end(
        JSON.stringify({
          success: false,
          error: {
            code: 'FUNCTION_ERROR',
            message: exposeDetails
              ? err?.message || 'API function failed'
              : 'API function failed',
            ...(exposeDetails && err?.stack ? { stack: err.stack.split('\n').slice(0, 8) } : {}),
          },
          reqId,
        }),
      );
    }
  }
}
