/**
 * Vercel serverless entry point — wraps the Express app for /api/* routes.
 *
 * Vercel auto-detects this file as a serverless function (the `[[...slug]]`
 * filename is a Next.js / Vercel optional catch-all). It receives every
 * request that starts with `/api/`, hands it to Express, and returns
 * Express's response.
 *
 * The Express app itself is unchanged — same routes, same middleware. It
 * just no longer calls `.listen()` in production; serverless-http drives it
 * per-request instead.
 */

import serverless from 'serverless-http';
import { app, prepareApp } from '../server/app.js';

// Wrap once at module load. The wrapper is reusable across invocations.
const expressHandler = serverless(app);

// Export the Vercel handler. Each invocation:
//   1. Awaits prepareApp() — connects to Atlas + seeds if needed (cached after
//      the first cold start, so this is ~free on warm invocations).
//   2. Pipes the request through Express via serverless-http.
//   3. Returns the response Vercel needs.
export default async function handler(req, res) {
  if (req.url === '/api/health' || req.url?.startsWith('/api/health?')) {
    return expressHandler(req, res);
  }

  try {
    await prepareApp();
  } catch (err) {
    console.error('[api] prepareApp failed:', err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: { code: 'STARTUP_FAILED', message: err?.message || 'Database connection failed' },
    }));
    return;
  }
  return expressHandler(req, res);
}
