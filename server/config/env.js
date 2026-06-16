/**
 * Boot-time environment validation.
 *
 * Fails CLOSED in production: if a critical variable is missing or weak the
 * process refuses to start, with ONE message listing every problem (instead of
 * discovering them one crash at a time). In development it only warns, so local
 * runs work with a partial .env.
 *
 * Critical (hard-fail in prod):
 *   - MONGODB_URI       — no database, nothing works
 *   - JWT_SECRET        — must be ≥32 chars; a weak/absent secret lets anyone
 *                         forge a super_admin token (see middleware/auth.js)
 *
 * Recommended (warn): CORS_ORIGIN, NEXT_PUBLIC_APP_URL.
 * Optional tuning vars (pool/timeout/load-shed) have safe defaults.
 */

const isProd = () => process.env.NODE_ENV === 'production';

export function validateEnv() {
  const errors = [];
  const warnings = [];

  // ---- critical ----
  if (!process.env.MONGODB_URI) {
    errors.push('MONGODB_URI is required (MongoDB connection string).');
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    errors.push('JWT_SECRET is required.');
  } else if (secret.length < 32) {
    // auth.js enforces ≥16 as a hard floor; production should use ≥32.
    (isProd() ? errors : warnings).push(
      `JWT_SECRET should be at least 32 random characters (current: ${secret.length}).`,
    );
  } else if (/change-me|your-secret-key|secret|password/i.test(secret)) {
    errors.push('JWT_SECRET looks like a placeholder — set a real random value.');
  }

  // ---- recommended in production ----
  if (isProd()) {
    if (!process.env.CORS_ORIGIN) {
      warnings.push('CORS_ORIGIN not set — only same-origin browser callers will be allowed.');
    }
    if (!process.env.NEXT_PUBLIC_APP_URL && !process.env.APP_URL) {
      warnings.push('NEXT_PUBLIC_APP_URL/APP_URL not set — share links fall back to the request host.');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate and, in production, throw on any critical error. Call once at boot
 * (before connecting to the DB). Logs a concise summary either way.
 */
export function assertEnv() {
  const { ok, errors, warnings } = validateEnv();
  for (const w of warnings) console.warn(`[env] WARN: ${w}`);
  if (!ok) {
    const msg = `Environment validation failed:\n  - ${errors.join('\n  - ')}`;
    if (isProd()) {
      // Fail closed — refuse to start a misconfigured production server.
      throw new Error(msg);
    }
    console.warn(`[env] ${msg}\n[env] (dev mode — starting anyway)`);
  } else {
    console.log('[env] Environment OK.');
  }
  return ok;
}
