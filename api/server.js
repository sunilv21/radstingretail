import serverless from 'serverless-http';
import { app, prepareApp } from '../server/app.js';

const expressHandler = serverless(app);

export default async function handler(req, res) {
  if (req.query?.path) {
    const path = Array.isArray(req.query.path)
      ? req.query.path.join('/')
      : String(req.query.path);
    const query = new URLSearchParams(req.query);
    query.delete('path');
    const suffix = query.toString();
    req.url = `/api/${path}${suffix ? `?${suffix}` : ''}`;
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

  try {
    return await expressHandler(req, res);
  } catch (err) {
    console.error('[api] request failed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: {
          code: 'FUNCTION_ERROR',
          message: err?.message || 'API function failed',
        },
      }));
    }
  }
}
