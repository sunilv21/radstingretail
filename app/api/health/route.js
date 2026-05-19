/**
 * Cheap health probe — no database call. Useful for confirming the
 * deployment is live and which env vars are wired up. The catch-all at
 * `app/api/[...slug]/route.js` would also handle this path, but defining
 * a specific route here means we don't even need to spin up Express for
 * a simple "are you alive" check.
 *
 * Hit GET /api/health.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    success: true,
    data: {
      status: 'OK',
      runtime: 'nextjs-app-router',
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
  })
}
