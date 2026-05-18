/**
 * Vercel health endpoint. Cheap — no database call — so we can verify the
 * function is hot, the env vars are configured, and the build is current.
 * Hit GET /api/health.
 */
export default function handler(_req, res) {
  res.status(200).json({
    success: true,
    data: {
      status: 'OK',
      runtime: 'vercel-function',
      // Reveal which critical env vars are configured (without exposing
      // the values themselves). If `mongoConfigured` is false, the
      // tenant login will 500/503 even before reaching the database —
      // set MONGODB_URI in the Vercel project's env vars and redeploy.
      env: {
        mongoConfigured: !!process.env.MONGODB_URI,
        jwtConfigured:
          !!process.env.JWT_SECRET && process.env.JWT_SECRET !== 'your-secret-key',
        corsConfigured: !!process.env.CORS_ORIGIN,
        debugErrorsOn: process.env.DEBUG_API_ERRORS === '1',
        nodeEnv: process.env.NODE_ENV || 'unknown',
      },
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
}
